#!/bin/bash

# =============================================================================
# Application Deployment Script with Blue-Green Deployment
# =============================================================================
# This script deploys the PostgreSQL-enabled application using blue-green deployment:
# 1. Build and push Docker image to ECR
# 2. Register new ECS task definition
# 3. Update ECS service with blue-green deployment
# 4. Monitor deployment progress
# 5. Verify application health
# 6. Complete deployment or rollback on failure
#
# Prerequisites:
# - PostgreSQL schema initialized
# - Data migration completed
# - AWS CLI configured
# - Docker installed
# - ECS cluster and service exist
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="us-west-2"
ECR_REPOSITORY="xrestaurant-backend"
IMAGE_TAG="postgres-v$(date +%Y%m%d-%H%M%S)"
CLUSTER_NAME="xrestaurant-cluster"
SERVICE_NAME="xrestaurant-service"
TASK_DEFINITION_FAMILY="xrestaurant-postgres"
ALB_TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/xrestaurant-tg/1234567890123456"
HEALTH_CHECK_PATH="/health"

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

# Function to build production Docker image
build_production_image() {
    log "Building production Docker image..."
    
    # Navigate to server directory
    cd ../server
    
    # Build the image using the PostgreSQL Dockerfile
    docker build -f Dockerfile.postgres -t $ECR_REPOSITORY:$IMAGE_TAG .
    
    if [ $? -eq 0 ]; then
        success "Docker image built successfully: $ECR_REPOSITORY:$IMAGE_TAG"
    else
        error "Docker image build failed"
        exit 1
    fi
    
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
    docker tag $ECR_REPOSITORY:$IMAGE_TAG $ECR_REPOSITORY_URI:latest-postgres
    
    # Push to ECR
    docker push $ECR_REPOSITORY_URI:$IMAGE_TAG
    docker push $ECR_REPOSITORY_URI:latest-postgres
    
    if [ $? -eq 0 ]; then
        success "Image pushed to ECR: $ECR_REPOSITORY_URI:$IMAGE_TAG"
        success "Latest tag updated: $ECR_REPOSITORY_URI:latest-postgres"
    else
        error "Failed to push image to ECR"
        exit 1
    fi
}

# Function to get current task definition
get_current_task_definition() {
    log "Getting current task definition..."
    
    # Get current task definition
    CURRENT_TASK_DEF=$(aws ecs describe-task-definition \
        --task-definition $TASK_DEFINITION_FAMILY \
        --region $REGION \
        --query 'taskDefinition.revision' \
        --output text 2>/dev/null)
    
    if [ -z "$CURRENT_TASK_DEF" ] || [ "$CURRENT_TASK_DEF" = "None" ]; then
        warning "No existing task definition found, will create new one"
        CURRENT_TASK_DEF=0
    else
        log "Current task definition revision: $CURRENT_TASK_DEF"
    fi
}

# Function to register new task definition
register_task_definition() {
    log "Registering new task definition..."
    
    # Get ECR repository URI
    ECR_REPOSITORY_URI=$(aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $REGION --query 'repositories[0].repositoryUri' --output text)
    
    # Create new task definition JSON
    cat > task-definition-postgres-production.json << EOF
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
            "name": "xrestaurant-postgres-container",
            "image": "$ECR_REPOSITORY_URI:$IMAGE_TAG",
            "essential": true,
            "portMappings": [
                {
                    "containerPort": 5000,
                    "protocol": "tcp"
                }
            ],
            "environment": [
                {
                    "name": "NODE_ENV",
                    "value": "production"
                },
                {
                    "name": "PORT",
                    "value": "5000"
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
                    "name": "CORS_ORIGIN",
                    "value": "https://xrestaurant.com"
                },
                {
                    "name": "JWT_SECRET_NAME",
                    "value": "xrestaurant/jwt/secret"
                },
                {
                    "name": "STRIPE_SECRET_NAME",
                    "value": "xrestaurant/stripe/secret"
                },
                {
                    "name": "GOOGLE_CLIENT_SECRET_NAME",
                    "value": "xrestaurant/google/client"
                }
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": "/ecs/xrestaurant-postgres",
                    "awslogs-region": "$REGION",
                    "awslogs-stream-prefix": "postgres-app"
                }
            },
            "healthCheck": {
                "command": ["CMD-SHELL", "curl -f http://localhost:5000/health || exit 1"],
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
    NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
        --cli-input-json file://task-definition-postgres-production.json \
        --region $REGION \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    if [ -n "$NEW_TASK_DEF_ARN" ]; then
        NEW_TASK_DEF_REVISION=$(echo $NEW_TASK_DEF_ARN | rev | cut -d':' -f1 | rev)
        success "New task definition registered: $TASK_DEFINITION_FAMILY:$NEW_TASK_DEF_REVISION"
    else
        error "Failed to register task definition"
        exit 1
    fi
}

# Function to create CloudWatch log group
create_log_group() {
    log "Creating CloudWatch log group..."
    
    # Check if log group exists
    aws logs describe-log-groups --log-group-name-prefix "/ecs/xrestaurant-postgres" --region $REGION --query 'logGroups[0].logGroupName' --output text 2>/dev/null
    
    if [ $? -ne 0 ]; then
        # Create log group
        aws logs create-log-group --log-group-name "/ecs/xrestaurant-postgres" --region $REGION
        
        if [ $? -eq 0 ]; then
            success "CloudWatch log group created: /ecs/xrestaurant-postgres"
        else
            error "Failed to create CloudWatch log group"
            exit 1
        fi
    else
        log "CloudWatch log group already exists: /ecs/xrestaurant-postgres"
    fi
}

# Function to update ECS service with blue-green deployment
update_ecs_service() {
    log "Starting blue-green deployment..."
    
    # Get current service configuration
    CURRENT_DESIRED_COUNT=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $REGION \
        --query 'services[0].desiredCount' \
        --output text)
    
    if [ -z "$CURRENT_DESIRED_COUNT" ] || [ "$CURRENT_DESIRED_COUNT" = "None" ]; then
        error "Service not found: $SERVICE_NAME"
        exit 1
    fi
    
    log "Current desired count: $CURRENT_DESIRED_COUNT"
    
    # Update service with new task definition
    log "Updating ECS service with new task definition..."
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --task-definition $NEW_TASK_DEF_ARN \
        --region $REGION > /dev/null
    
    if [ $? -eq 0 ]; then
        success "ECS service update initiated"
    else
        error "Failed to update ECS service"
        exit 1
    fi
}

# Function to monitor deployment progress
monitor_deployment() {
    log "Monitoring deployment progress..."
    
    local max_wait=1200  # 20 minutes
    local wait_time=0
    local check_interval=30
    local stable_checks=0
    local required_stable_checks=3
    
    while [ $wait_time -lt $max_wait ]; do
        # Get service status
        local service_info=$(aws ecs describe-services \
            --cluster $CLUSTER_NAME \
            --services $SERVICE_NAME \
            --region $REGION \
            --query 'services[0]')
        
        local running_count=$(echo $service_info | jq -r '.runningCount')
        local pending_count=$(echo $service_info | jq -r '.pendingCount')
        local desired_count=$(echo $service_info | jq -r '.desiredCount')
        local deployment_status=$(echo $service_info | jq -r '.deployments[0].status')
        local rollout_state=$(echo $service_info | jq -r '.deployments[0].rolloutState // "UNKNOWN"')
        
        log "Deployment status: $deployment_status, Rollout: $rollout_state"
        log "Tasks - Running: $running_count, Pending: $pending_count, Desired: $desired_count"
        
        # Check if deployment is stable
        if [ "$running_count" = "$desired_count" ] && [ "$pending_count" = "0" ] && [ "$deployment_status" = "PRIMARY" ]; then
            stable_checks=$((stable_checks + 1))
            log "Deployment stable check $stable_checks/$required_stable_checks"
            
            if [ $stable_checks -ge $required_stable_checks ]; then
                success "Deployment is stable!"
                break
            fi
        else
            stable_checks=0
        fi
        
        # Check for failed deployment
        if [ "$rollout_state" = "FAILED" ]; then
            error "Deployment failed with rollout state: $rollout_state"
            show_deployment_events
            return 1
        fi
        
        # Show recent events every 2 minutes
        if [ $((wait_time % 120)) -eq 0 ] && [ $wait_time -gt 0 ]; then
            show_deployment_events
        fi
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
    done
    
    if [ $wait_time -ge $max_wait ]; then
        error "Deployment monitoring timed out after ${max_wait} seconds"
        return 1
    fi
    
    return 0
}

# Function to show deployment events
show_deployment_events() {
    log "Recent deployment events:"
    
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $REGION \
        --query 'services[0].events[:5].[createdAt,message]' \
        --output table
}

# Function to verify application health
verify_application_health() {
    log "Verifying application health..."
    
    # Get ALB DNS name
    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --region $REGION \
        --query 'LoadBalancers[?contains(LoadBalancerName, `xrestaurant`)].DNSName' \
        --output text)
    
    if [ -z "$ALB_DNS" ]; then
        warning "Could not find ALB DNS name, skipping health check"
        return 0
    fi
    
    log "Testing health endpoint: https://$ALB_DNS$HEALTH_CHECK_PATH"
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Health check attempt $attempt/$max_attempts"
        
        # Test health endpoint
        local response=$(curl -s -o /dev/null -w "%{http_code}" "https://$ALB_DNS$HEALTH_CHECK_PATH" || echo "000")
        
        if [ "$response" = "200" ]; then
            success "Application health check passed!"
            
            # Test a few more endpoints
            test_api_endpoints "$ALB_DNS"
            return 0
        else
            warning "Health check failed with status: $response"
            sleep 30
        fi
        
        attempt=$((attempt + 1))
    done
    
    error "Application health check failed after $max_attempts attempts"
    return 1
}

# Function to test API endpoints
test_api_endpoints() {
    local alb_dns=$1
    log "Testing key API endpoints..."
    
    # Test category endpoint
    local categories_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$alb_dns/api/category" || echo "000")
    if [ "$categories_response" = "200" ]; then
        success "Categories API: OK"
    else
        warning "Categories API failed: $categories_response"
    fi
    
    # Test product endpoint
    local products_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$alb_dns/api/product" || echo "000")
    if [ "$products_response" = "200" ]; then
        success "Products API: OK"
    else
        warning "Products API failed: $products_response"
    fi
    
    # Test table endpoint
    local tables_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$alb_dns/api/table" || echo "000")
    if [ "$tables_response" = "200" ]; then
        success "Tables API: OK"
    else
        warning "Tables API failed: $tables_response"
    fi
}

# Function to show deployment summary
show_deployment_summary() {
    log "Deployment Summary:"
    echo "=================================="
    echo "Image Tag: $IMAGE_TAG"
    echo "Task Definition: $TASK_DEFINITION_FAMILY:$NEW_TASK_DEF_REVISION"
    echo "Previous Revision: $CURRENT_TASK_DEF"
    echo "Deployment Time: $(date)"
    echo "=================================="
    
    # Show current service status
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $REGION \
        --query 'services[0].[serviceName,status,runningCount,pendingCount,desiredCount]' \
        --output table
}

# Function to rollback deployment
rollback_deployment() {
    error "Deployment failed, initiating rollback..."
    
    if [ "$CURRENT_TASK_DEF" != "0" ]; then
        log "Rolling back to previous task definition: $TASK_DEFINITION_FAMILY:$CURRENT_TASK_DEF"
        
        aws ecs update-service \
            --cluster $CLUSTER_NAME \
            --service $SERVICE_NAME \
            --task-definition "$TASK_DEFINITION_FAMILY:$CURRENT_TASK_DEF" \
            --region $REGION > /dev/null
        
        if [ $? -eq 0 ]; then
            warning "Rollback initiated, monitoring progress..."
            monitor_deployment
            if [ $? -eq 0 ]; then
                warning "Rollback completed successfully"
            else
                error "Rollback failed, manual intervention required"
            fi
        else
            error "Failed to initiate rollback"
        fi
    else
        error "No previous task definition to rollback to"
    fi
}

# Function to cleanup
cleanup() {
    log "Cleaning up temporary files..."
    
    # Remove task definition file
    if [ -f "task-definition-postgres-production.json" ]; then
        rm task-definition-postgres-production.json
        log "Removed task-definition-postgres-production.json"
    fi
    
    # Remove local Docker image
    docker rmi $ECR_REPOSITORY:$IMAGE_TAG 2>/dev/null || true
    log "Removed local Docker image"
}

# Main execution
main() {
    log "Starting PostgreSQL application deployment..."
    log "Region: $REGION"
    log "ECR Repository: $ECR_REPOSITORY"
    log "Image Tag: $IMAGE_TAG"
    log "Cluster: $CLUSTER_NAME"
    log "Service: $SERVICE_NAME"
    
    # Check prerequisites
    log "Checking prerequisites..."
    check_command "aws"
    check_command "docker"
    check_command "curl"
    check_command "jq"
    
    # Verify AWS CLI is configured
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi
    
    success "Prerequisites check passed"
    
    # Confirm deployment
    warning "This will deploy the PostgreSQL-enabled application to production"
    warning "Ensure schema initialization and data migration are completed"
    echo "Do you want to proceed with deployment? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        error "Deployment cancelled by user"
        exit 1
    fi
    
    # Execute deployment steps
    get_current_task_definition
    ecr_login
    build_production_image
    push_to_ecr
    create_log_group
    register_task_definition
    update_ecs_service
    
    # Monitor deployment
    if monitor_deployment; then
        # Verify application health
        if verify_application_health; then
            success "Application deployment completed successfully!"
            show_deployment_summary
            
            log "Next steps:"
            echo "1. Monitor CloudWatch metrics and logs"
            echo "2. Run integration tests"
            echo "3. Update DNS if needed"
            echo "4. Monitor application performance"
            echo "5. Notify team of successful deployment"
        else
            error "Application health check failed"
            rollback_deployment
            exit 1
        fi
    else
        error "Deployment monitoring failed"
        rollback_deployment
        exit 1
    fi
    
    # Cleanup
    cleanup
    
    log "Application deployment finished"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"