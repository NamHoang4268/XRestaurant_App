#!/bin/bash

# =============================================================================
# Data Migration Deployment Script
# =============================================================================
# This script migrates data from MongoDB to PostgreSQL by:
# 1. Creating MongoDB backup
# 2. Building Docker image with migration script
# 3. Running data migration via ECS task
# 4. Verifying data integrity
# 5. Monitoring the process
#
# Prerequisites:
# - MongoDB accessible (current production database)
# - PostgreSQL schema already initialized (run 21-2-initialize-schema.sh first)
# - AWS CLI configured
# - Docker installed
# - ECS cluster exists
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="ap-southeast-1"
ECR_REPOSITORY="xrestaurant-backend"
IMAGE_TAG="postgres-data-migration"
CLUSTER_NAME="xrestaurant-cluster"
TASK_DEFINITION_FAMILY="xrestaurant-data-migration"
SUBNET_ID="subnet-0123456789abcdef0"  # Private subnet where RDS is located
SECURITY_GROUP_ID="sg-0123456789abcdef0"  # Security group with RDS access
BACKUP_BUCKET="xrestaurant-backups"  # S3 bucket for MongoDB backups

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        error "$1 is not installed or not in PATH"
        exit 1
    fi
}

# Function to get ECR login token
ecr_login() {
    log "Logging into ECR..."
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI
    if [ $? -eq 0 ]; then
        success "ECR login successful"
    else
        error "ECR login failed"
        exit 1
    fi
}

# Function to create MongoDB backup
create_mongodb_backup() {
    log "Creating MongoDB backup..."
    
    # Create backup directory with timestamp
    BACKUP_DIR="mongodb-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p $BACKUP_DIR
    
    # Get MongoDB connection string from environment or prompt
    if [ -z "$MONGODB_URI" ]; then
        warning "MONGODB_URI environment variable not set"
        echo "Please provide MongoDB connection string:"
        read -s MONGODB_URI
    fi
    
    log "Starting MongoDB dump..."
    
    # Create mongodump (this would typically run on a server with MongoDB access)
    # For production, this should be run from a server that can access MongoDB
    cat > backup-mongodb.sh << 'EOF'
#!/bin/bash
# This script should be run on a server with MongoDB access
# It creates a backup and uploads to S3

BACKUP_DIR="mongodb-backup-$(date +%Y%m%d-%H%M%S)"
DATABASE_NAME="xrestaurant"

echo "Creating MongoDB backup directory: $BACKUP_DIR"
mkdir -p $BACKUP_DIR

echo "Starting mongodump..."
mongodump --uri="$MONGODB_URI" --db=$DATABASE_NAME --out=$BACKUP_DIR

if [ $? -eq 0 ]; then
    echo "MongoDB dump completed successfully"
    
    # Compress backup
    tar -czf ${BACKUP_DIR}.tar.gz $BACKUP_DIR
    
    # Upload to S3
    aws s3 cp ${BACKUP_DIR}.tar.gz s3://xrestaurant-backups/mongodb-backups/
    
    if [ $? -eq 0 ]; then
        echo "Backup uploaded to S3: s3://xrestaurant-backups/mongodb-backups/${BACKUP_DIR}.tar.gz"
        echo "BACKUP_FILE=${BACKUP_DIR}.tar.gz" > backup-info.txt
    else
        echo "Failed to upload backup to S3"
        exit 1
    fi
    
    # Cleanup local files
    rm -rf $BACKUP_DIR
    rm ${BACKUP_DIR}.tar.gz
    
else
    echo "MongoDB dump failed"
    exit 1
fi
EOF

    chmod +x backup-mongodb.sh
    
    warning "MongoDB backup script created: backup-mongodb.sh"
    warning "This script needs to be run on a server with MongoDB access"
    warning "Please run it manually and ensure backup is uploaded to S3"
    
    echo "Do you want to continue assuming backup is already available? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        error "Data migration cancelled. Please create MongoDB backup first."
        exit 1
    fi
    
    success "Proceeding with data migration (assuming backup exists)"
}

# Function to build Docker image for data migration
build_migration_image() {
    log "Building Docker image for data migration..."
    
    # Navigate to server directory
    cd ../server
    
    # Create temporary Dockerfile for data migration
    cat > Dockerfile.data-migration << 'EOF'
FROM node:18-alpine

# Install MongoDB tools and PostgreSQL client
RUN apk add --no-cache mongodb-tools postgresql-client curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including MongoDB drivers for migration)
RUN npm ci --only=production

# Install additional migration dependencies
RUN npm install mongodb@5.9.2

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set environment variables
ENV NODE_ENV=production
ENV DB_USE_POSTGRES=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Default command (will be overridden by ECS task)
CMD ["node", "scripts/migrate-data.js"]
EOF

    # Build the image
    docker build -f Dockerfile.data-migration -t $ECR_REPOSITORY:$IMAGE_TAG .
    
    if [ $? -eq 0 ]; then
        success "Docker image built successfully"
    else
        error "Docker image build failed"
        exit 1
    fi
    
    # Clean up temporary Dockerfile
    rm Dockerfile.data-migration
    
    # Return to aws-scripts directory
    cd ../aws-scripts-production
}

# Function to push image to ECR
push_to_ecr() {
    log "Pushing image to ECR..."
    
    # Get ECR repository URI
    ECR_REPOSITORY_URI=$(aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $REGION --query 'repositories[0].repositoryUri' --output text)
    
    if [ -z "$ECR_REPOSITORY_URI" ]; then
        error "ECR repository not found: $ECR_REPOSITORY"
        exit 1
    fi
    
    # Tag image for ECR
    docker tag $ECR_REPOSITORY:$IMAGE_TAG $ECR_REPOSITORY_URI:$IMAGE_TAG
    
    # Push to ECR
    docker push $ECR_REPOSITORY_URI:$IMAGE_TAG
    
    if [ $? -eq 0 ]; then
        success "Image pushed to ECR: $ECR_REPOSITORY_URI:$IMAGE_TAG"
    else
        error "Failed to push image to ECR"
        exit 1
    fi
}

# Function to create ECS task definition for data migration
create_task_definition() {
    log "Creating ECS task definition for data migration..."
    
    # Get ECR repository URI
    ECR_REPOSITORY_URI=$(aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $REGION --query 'repositories[0].repositoryUri' --output text)
    
    # Create task definition JSON
    cat > task-definition-data-migration.json << EOF
{
    "family": "$TASK_DEFINITION_FAMILY",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "2048",
    "executionRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskRole",
    "containerDefinitions": [
        {
            "name": "data-migration-container",
            "image": "$ECR_REPOSITORY_URI:$IMAGE_TAG",
            "essential": true,
            "command": ["node", "scripts/migrate-data.js"],
            "environment": [
                {
                    "name": "NODE_ENV",
                    "value": "production"
                },
                {
                    "name": "DB_USE_POSTGRES",
                    "value": "true"
                },
                {
                    "name": "DB_SECRET_NAME",
                    "value": "xrestaurant/rds/credentials"
                },
                {
                    "name": "AWS_REGION",
                    "value": "$REGION"
                },
                {
                    "name": "BACKUP_BUCKET",
                    "value": "$BACKUP_BUCKET"
                },
                {
                    "name": "MIGRATION_MODE",
                    "value": "production"
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/xrestaurant-data-migration",
                    "awslogs-region": "$REGION",
                    "awslogs-stream-prefix": "data-migration"
                }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "node -e \"console.log('Health check passed')\" || exit 1"],
                "interval": 30,
                "timeout": 10,
                "retries": 3,
                "startPeriod": 120
            }
        }
    ]
}
EOF

    # Register task definition
    aws ecs register-task-definition --cli-input-json file://task-definition-data-migration.json --region $REGION
    
    if [ $? -eq 0 ]; then
        success "Task definition registered: $TASK_DEFINITION_FAMILY"
    else
        error "Failed to register task definition"
        exit 1
    fi
}

# Function to create CloudWatch log group
create_log_group() {
    log "Creating CloudWatch log group..."
    
    # Check if log group exists
    aws logs describe-log-groups --log-group-name-prefix "/ecs/xrestaurant-data-migration" --region $REGION --query 'logGroups[0].logGroupName' --output text 2>/dev/null
    
    if [ $? -ne 0 ]; then
        # Create log group
        aws logs create-log-group --log-group-name "/ecs/xrestaurant-data-migration" --region $REGION
        
        if [ $? -eq 0 ]; then
            success "CloudWatch log group created: /ecs/xrestaurant-data-migration"
        else
            error "Failed to create CloudWatch log group"
            exit 1
        fi
    else
        log "CloudWatch log group already exists: /ecs/xrestaurant-data-migration"
    fi
}

# Function to run data migration task
run_migration_task() {
    log "Running data migration task..."
    
    # Confirm before starting migration
    warning "This will migrate data from MongoDB to PostgreSQL"
    warning "Ensure PostgreSQL schema is already initialized"
    warning "Ensure MongoDB backup is available in S3"
    echo "Do you want to proceed? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        error "Data migration cancelled by user"
        exit 1
    fi
    
    # Run ECS task
    TASK_ARN=$(aws ecs run-task \
        --cluster $CLUSTER_NAME \
        --task-definition $TASK_DEFINITION_FAMILY \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=DISABLED}" \
        --region $REGION \
        --query 'tasks[0].taskArn' \
        --output text)
    
    if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "None" ]; then
        error "Failed to start data migration task"
        exit 1
    fi
    
    success "Data migration task started: $TASK_ARN"
    
    # Monitor task progress
    monitor_task_progress "$TASK_ARN"
}

# Function to monitor task progress
monitor_task_progress() {
    local task_arn=$1
    log "Monitoring task progress: $task_arn"
    
    local max_wait=3600  # 60 minutes (data migration can take longer)
    local wait_time=0
    local check_interval=30
    
    while [ $wait_time -lt $max_wait ]; do
        # Get task status
        local task_status=$(aws ecs describe-tasks \
            --cluster $CLUSTER_NAME \
            --tasks $task_arn \
            --region $REGION \
            --query 'tasks[0].lastStatus' \
            --output text)
        
        log "Task status: $task_status (${wait_time}s elapsed)"
        
        # Show recent logs every 2 minutes
        if [ $((wait_time % 120)) -eq 0 ] && [ $wait_time -gt 0 ]; then
            show_recent_logs
        fi
        
        case $task_status in
            "RUNNING")
                log "Migration is running... (${wait_time}s elapsed)"
                ;;
            "STOPPED")
                # Check exit code
                local exit_code=$(aws ecs describe-tasks \
                    --cluster $CLUSTER_NAME \
                    --tasks $task_arn \
                    --region $REGION \
                    --query 'tasks[0].containers[0].exitCode' \
                    --output text)
                
                if [ "$exit_code" = "0" ]; then
                    success "Data migration completed successfully!"
                    show_migration_summary
                    return 0
                else
                    error "Data migration failed with exit code: $exit_code"
                    
                    # Show recent logs
                    log "Recent logs from data migration:"
                    show_task_logs "$task_arn"
                    return 1
                fi
                ;;
            "PENDING"|"PROVISIONING")
                log "Task is starting... (${wait_time}s elapsed)"
                ;;
            *)
                warning "Unknown task status: $task_status"
                ;;
        esac
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
    done
    
    error "Task monitoring timed out after ${max_wait} seconds"
    return 1
}

# Function to show recent logs
show_recent_logs() {
    log "Fetching recent migration logs..."
    
    # Get most recent log stream
    local log_stream=$(aws logs describe-log-streams \
        --log-group-name "/ecs/xrestaurant-data-migration" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --region $REGION \
        --query 'logStreams[0].logStreamName' \
        --output text 2>/dev/null)
    
    if [ -n "$log_stream" ] && [ "$log_stream" != "None" ]; then
        echo "--- Recent Migration Progress ---"
        aws logs get-log-events \
            --log-group-name "/ecs/xrestaurant-data-migration" \
            --log-stream-name "$log_stream" \
            --start-time $(($(date +%s) * 1000 - 300000)) \
            --region $REGION \
            --query 'events[-10:].message' \
            --output text
        echo "--- End Recent Logs ---"
    fi
}

# Function to show task logs
show_task_logs() {
    local task_arn=$1
    log "Fetching complete logs for task: $task_arn"
    
    # Get log stream name
    local log_stream=$(aws logs describe-log-streams \
        --log-group-name "/ecs/xrestaurant-data-migration" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --region $REGION \
        --query 'logStreams[0].logStreamName' \
        --output text 2>/dev/null)
    
    if [ -n "$log_stream" ] && [ "$log_stream" != "None" ]; then
        echo "=========================================="
        echo "COMPLETE MIGRATION LOGS"
        echo "=========================================="
        aws logs get-log-events \
            --log-group-name "/ecs/xrestaurant-data-migration" \
            --log-stream-name "$log_stream" \
            --region $REGION \
            --query 'events[*].message' \
            --output text
        echo "=========================================="
    else
        warning "No log streams found"
    fi
}

# Function to show migration summary
show_migration_summary() {
    log "Generating migration summary..."
    
    # This would typically parse the logs to extract migration statistics
    # For now, we'll show the final logs which should contain the summary
    show_recent_logs
    
    success "Data migration process completed successfully!"
    log "Check CloudWatch logs for detailed migration statistics"
}

# Function to verify data integrity
verify_data_integrity() {
    log "Data integrity verification will be done through the migration task"
    log "The migration script includes built-in verification checks"
    log "Check the task logs above for verification results"
    
    warning "Manual verification recommended:"
    echo "1. Connect to PostgreSQL and check record counts"
    echo "2. Verify foreign key relationships"
    echo "3. Check data consistency"
    echo "4. Run application smoke tests"
}

# Function to cleanup
cleanup() {
    log "Cleaning up temporary files..."
    
    # Remove task definition file
    if [ -f "task-definition-data-migration.json" ]; then
        rm task-definition-data-migration.json
        log "Removed task-definition-data-migration.json"
    fi
    
    # Remove backup script
    if [ -f "backup-mongodb.sh" ]; then
        rm backup-mongodb.sh
        log "Removed backup-mongodb.sh"
    fi
    
    # Remove local Docker image
    docker rmi $ECR_REPOSITORY:$IMAGE_TAG 2>/dev/null || true
    log "Removed local Docker image"
}

# Main execution
main() {
    log "Starting PostgreSQL data migration deployment..."
    log "Region: $REGION"
    log "ECR Repository: $ECR_REPOSITORY"
    log "Image Tag: $IMAGE_TAG"
    log "Cluster: $CLUSTER_NAME"
    log "Backup Bucket: $BACKUP_BUCKET"
    
    # Check prerequisites
    log "Checking prerequisites..."
    check_command "aws"
    check_command "docker"
    
    # Verify AWS CLI is configured
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi
    
    success "Prerequisites check passed"
    
    # Execute deployment steps
    create_mongodb_backup
    ecr_login
    build_migration_image
    push_to_ecr
    create_log_group
    create_task_definition
    run_migration_task
    
    # Verify results
    if [ $? -eq 0 ]; then
        verify_data_integrity
        success "Data migration deployment completed successfully!"
        
        log "Next steps:"
        echo "1. Verify data integrity manually"
        echo "2. Run application deployment (Task 21.4)"
        echo "3. Run integration tests"
        echo "4. Monitor application performance"
    else
        error "Data migration deployment failed!"
        exit 1
    fi
    
    # Cleanup
    cleanup
    
    log "Data migration deployment finished"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"