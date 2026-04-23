#!/bin/bash

# =============================================================================
# Schema Initialization Deployment Script
# =============================================================================
# This script initializes the PostgreSQL schema on AWS RDS by:
# 1. Building Docker image with Sequelize models
# 2. Running schema initialization via ECS task
# 3. Verifying schema creation
# 4. Monitoring the process
#
# Prerequisites:
# - AWS CLI configured
# - Docker installed
# - RDS instance running
# - Secrets Manager configured
# - ECS cluster exists
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="ap-southeast-1"
ECR_REPOSITORY="xrestaurant-backend"
IMAGE_TAG="postgres-schema-init"
CLUSTER_NAME="xrestaurant-cluster"
TASK_DEFINITION_FAMILY="xrestaurant-schema-init"
SUBNET_ID="subnet-0123456789abcdef0"  # Private subnet where RDS is located
SECURITY_GROUP_ID="sg-0123456789abcdef0"  # Security group with RDS access

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

# Function to build Docker image for schema initialization
build_schema_image() {
    log "Building Docker image for schema initialization..."
    
    # Navigate to server directory
    cd ../server
    
    # Create temporary Dockerfile for schema initialization
    cat > Dockerfile.schema-init << 'EOF'
FROM node:18-alpine

# Install PostgreSQL client
RUN apk add --no-cache postgresql-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

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
CMD ["node", "scripts/init-schema.js"]
EOF

    # Build the image
    docker build -f Dockerfile.schema-init -t $ECR_REPOSITORY:$IMAGE_TAG .
    
    if [ $? -eq 0 ]; then
        success "Docker image built successfully"
    else
        error "Docker image build failed"
        exit 1
    fi
    
    # Clean up temporary Dockerfile
    rm Dockerfile.schema-init
    
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

# Function to create ECS task definition for schema initialization
create_task_definition() {
    log "Creating ECS task definition for schema initialization..."
    
    # Get ECR repository URI
    ECR_REPOSITORY_URI=$(aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $REGION --query 'repositories[0].repositoryUri' --output text)
    
    # Create task definition JSON
    cat > task-definition-schema-init.json << EOF
{
    "family": "$TASK_DEFINITION_FAMILY",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024",
    "executionRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskRole",
    "containerDefinitions": [
        {
            "name": "schema-init-container",
            "image": "$ECR_REPOSITORY_URI:$IMAGE_TAG",
            "essential": true,
            "command": ["node", "scripts/init-schema.js"],
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
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/xrestaurant-schema-init",
                    "awslogs-region": "$REGION",
                    "awslogs-stream-prefix": "schema-init"
                }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "node -e \"console.log('Health check passed')\" || exit 1"],
                "interval": 30,
                "timeout": 10,
                "retries": 3,
                "startPeriod": 60
            }
        }
    ]
}
EOF

    # Register task definition
    aws ecs register-task-definition --cli-input-json file://task-definition-schema-init.json --region $REGION
    
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
    aws logs describe-log-groups --log-group-name-prefix "/ecs/xrestaurant-schema-init" --region $REGION --query 'logGroups[0].logGroupName' --output text 2>/dev/null
    
    if [ $? -ne 0 ]; then
        # Create log group
        aws logs create-log-group --log-group-name "/ecs/xrestaurant-schema-init" --region $REGION
        
        if [ $? -eq 0 ]; then
            success "CloudWatch log group created: /ecs/xrestaurant-schema-init"
        else
            error "Failed to create CloudWatch log group"
            exit 1
        fi
    else
        log "CloudWatch log group already exists: /ecs/xrestaurant-schema-init"
    fi
}

# Function to run schema initialization task
run_schema_init_task() {
    log "Running schema initialization task..."
    
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
        error "Failed to start schema initialization task"
        exit 1
    fi
    
    success "Schema initialization task started: $TASK_ARN"
    
    # Monitor task progress
    monitor_task_progress "$TASK_ARN"
}

# Function to monitor task progress
monitor_task_progress() {
    local task_arn=$1
    log "Monitoring task progress: $task_arn"
    
    local max_wait=600  # 10 minutes
    local wait_time=0
    local check_interval=15
    
    while [ $wait_time -lt $max_wait ]; do
        # Get task status
        local task_status=$(aws ecs describe-tasks \
            --cluster $CLUSTER_NAME \
            --tasks $task_arn \
            --region $REGION \
            --query 'tasks[0].lastStatus' \
            --output text)
        
        log "Task status: $task_status"
        
        case $task_status in
            "RUNNING")
                log "Task is running... (${wait_time}s elapsed)"
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
                    success "Schema initialization completed successfully!"
                    return 0
                else
                    error "Schema initialization failed with exit code: $exit_code"
                    
                    # Show recent logs
                    log "Recent logs from schema initialization:"
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

# Function to show task logs
show_task_logs() {
    local task_arn=$1
    log "Fetching logs for task: $task_arn"
    
    # Get log stream name
    local log_stream=$(aws logs describe-log-streams \
        --log-group-name "/ecs/xrestaurant-schema-init" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --region $REGION \
        --query 'logStreams[0].logStreamName' \
        --output text 2>/dev/null)
    
    if [ -n "$log_stream" ] && [ "$log_stream" != "None" ]; then
        echo "----------------------------------------"
        aws logs get-log-events \
            --log-group-name "/ecs/xrestaurant-schema-init" \
            --log-stream-name "$log_stream" \
            --region $REGION \
            --query 'events[*].message' \
            --output text
        echo "----------------------------------------"
    else
        warning "No log streams found"
    fi
}

# Function to verify schema creation
verify_schema() {
    log "Verifying schema creation..."
    
    # This would typically involve running a verification task
    # For now, we'll check if the task completed successfully
    log "Schema verification will be done through task completion status"
    log "For detailed verification, check the task logs above"
    
    success "Schema initialization process completed"
}

# Function to cleanup
cleanup() {
    log "Cleaning up temporary files..."
    
    # Remove task definition file
    if [ -f "task-definition-schema-init.json" ]; then
        rm task-definition-schema-init.json
        log "Removed task-definition-schema-init.json"
    fi
    
    # Remove local Docker image
    docker rmi $ECR_REPOSITORY:$IMAGE_TAG 2>/dev/null || true
    log "Removed local Docker image"
}

# Main execution
main() {
    log "Starting PostgreSQL schema initialization deployment..."
    log "Region: $REGION"
    log "ECR Repository: $ECR_REPOSITORY"
    log "Image Tag: $IMAGE_TAG"
    log "Cluster: $CLUSTER_NAME"
    
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
    ecr_login
    build_schema_image
    push_to_ecr
    create_log_group
    create_task_definition
    run_schema_init_task
    
    # Verify results
    if [ $? -eq 0 ]; then
        verify_schema
        success "Schema initialization deployment completed successfully!"
    else
        error "Schema initialization deployment failed!"
        exit 1
    fi
    
    # Cleanup
    cleanup
    
    log "Schema initialization deployment finished"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"