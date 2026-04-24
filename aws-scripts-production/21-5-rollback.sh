#!/bin/bash

# =============================================================================
# Rollback Script for PostgreSQL Migration
# =============================================================================
# This script provides comprehensive rollback capabilities for the PostgreSQL migration:
# 1. Rollback application to previous MongoDB version
# 2. Verify MongoDB connectivity and data integrity
# 3. Monitor rollback progress
# 4. Validate application functionality
# 5. Provide rollback verification report
#
# Prerequisites:
# - MongoDB instance still accessible
# - Previous MongoDB-based task definition available
# - AWS CLI configured
# - ECS cluster and service exist
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="us-west-2"
CLUSTER_NAME="xrestaurant-cluster"
SERVICE_NAME="xrestaurant-service"
MONGODB_TASK_DEFINITION_FAMILY="xrestaurant-mongodb"
POSTGRES_TASK_DEFINITION_FAMILY="xrestaurant-postgres"
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

# Function to show rollback menu
show_rollback_menu() {
    echo "=========================================="
    echo "PostgreSQL Migration Rollback Options"
    echo "=========================================="
    echo "1. Quick Rollback - Revert to previous task definition"
    echo "2. Full Rollback - Revert to MongoDB-based application"
    echo "3. Verify Current State - Check current deployment status"
    echo "4. Test MongoDB Connectivity - Verify MongoDB is accessible"
    echo "5. Exit"
    echo "=========================================="
    echo -n "Select an option (1-5): "
}

# Function to get current deployment info
get_current_deployment_info() {
    log "Getting current deployment information..."
    
    # Get current service info
    CURRENT_SERVICE_INFO=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $REGION \
        --query 'services[0]')
    
    if [ -z "$CURRENT_SERVICE_INFO" ] || [ "$CURRENT_SERVICE_INFO" = "null" ]; then
        error "Service not found: $SERVICE_NAME"
        exit 1
    fi
    
    CURRENT_TASK_DEF=$(echo $CURRENT_SERVICE_INFO | jq -r '.taskDefinition')
    CURRENT_RUNNING_COUNT=$(echo $CURRENT_SERVICE_INFO | jq -r '.runningCount')
    CURRENT_DESIRED_COUNT=$(echo $CURRENT_SERVICE_INFO | jq -r '.desiredCount')
    CURRENT_STATUS=$(echo $CURRENT_SERVICE_INFO | jq -r '.status')
    
    log "Current Task Definition: $CURRENT_TASK_DEF"
    log "Running Tasks: $CURRENT_RUNNING_COUNT"
    log "Desired Tasks: $CURRENT_DESIRED_COUNT"
    log "Service Status: $CURRENT_STATUS"
}

# Function to list available task definitions
list_available_task_definitions() {
    log "Available task definitions for rollback:"
    
    # List PostgreSQL task definitions
    echo "PostgreSQL Task Definitions:"
    aws ecs list-task-definitions \
        --family-prefix $POSTGRES_TASK_DEFINITION_FAMILY \
        --status ACTIVE \
        --region $REGION \
        --query 'taskDefinitionArns[-5:]' \
        --output table
    
    echo ""
    
    # List MongoDB task definitions
    echo "MongoDB Task Definitions:"
    aws ecs list-task-definitions \
        --family-prefix $MONGODB_TASK_DEFINITION_FAMILY \
        --status ACTIVE \
        --region $REGION \
        --query 'taskDefinitionArns[-5:]' \
        --output table
}

# Function to perform quick rollback
quick_rollback() {
    log "Starting quick rollback to previous task definition..."
    
    # Get previous PostgreSQL task definition
    PREVIOUS_POSTGRES_TASK_DEF=$(aws ecs list-task-definitions \
        --family-prefix $POSTGRES_TASK_DEFINITION_FAMILY \
        --status ACTIVE \
        --region $REGION \
        --query 'taskDefinitionArns[-2]' \
        --output text)
    
    if [ -z "$PREVIOUS_POSTGRES_TASK_DEF" ] || [ "$PREVIOUS_POSTGRES_TASK_DEF" = "None" ]; then
        error "No previous PostgreSQL task definition found"
        return 1
    fi
    
    log "Rolling back to: $PREVIOUS_POSTGRES_TASK_DEF"
    
    # Confirm rollback
    warning "This will rollback to the previous PostgreSQL task definition"
    echo "Current: $CURRENT_TASK_DEF"
    echo "Target:  $PREVIOUS_POSTGRES_TASK_DEF"
    echo "Do you want to proceed? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log "Quick rollback cancelled"
        return 0
    fi
    
    # Update service
    update_service_task_definition "$PREVIOUS_POSTGRES_TASK_DEF"
}

# Function to perform full rollback to MongoDB
full_rollback() {
    log "Starting full rollback to MongoDB-based application..."
    
    # Get latest MongoDB task definition
    MONGODB_TASK_DEF=$(aws ecs list-task-definitions \
        --family-prefix $MONGODB_TASK_DEFINITION_FAMILY \
        --status ACTIVE \
        --region $REGION \
        --query 'taskDefinitionArns[-1]' \
        --output text)
    
    if [ -z "$MONGODB_TASK_DEF" ] || [ "$MONGODB_TASK_DEF" = "None" ]; then
        error "No MongoDB task definition found"
        error "You may need to register a MongoDB task definition first"
        return 1
    fi
    
    log "Rolling back to MongoDB: $MONGODB_TASK_DEF"
    
    # Test MongoDB connectivity first
    if ! test_mongodb_connectivity; then
        error "MongoDB connectivity test failed"
        error "Cannot rollback to MongoDB without working database connection"
        return 1
    fi
    
    # Confirm rollback
    warning "This will rollback to the MongoDB-based application"
    warning "Ensure MongoDB contains the latest data before proceeding"
    echo "Current: $CURRENT_TASK_DEF"
    echo "Target:  $MONGODB_TASK_DEF"
    echo "Do you want to proceed? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log "Full rollback cancelled"
        return 0
    fi
    
    # Update service
    update_service_task_definition "$MONGODB_TASK_DEF"
}

# Function to update service with new task definition
update_service_task_definition() {
    local target_task_def=$1
    
    log "Updating ECS service to: $target_task_def"
    
    # Update service
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --task-definition "$target_task_def" \
        --region $REGION > /dev/null
    
    if [ $? -eq 0 ]; then
        success "Service update initiated"
        monitor_rollback_progress
    else
        error "Failed to update service"
        return 1
    fi
}

# Function to monitor rollback progress
monitor_rollback_progress() {
    log "Monitoring rollback progress..."
    
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
        
        log "Rollback status: $deployment_status, Rollout: $rollout_state"
        log "Tasks - Running: $running_count, Pending: $pending_count, Desired: $desired_count"
        
        # Check if rollback is stable
        if [ "$running_count" = "$desired_count" ] && [ "$pending_count" = "0" ] && [ "$deployment_status" = "PRIMARY" ]; then
            stable_checks=$((stable_checks + 1))
            log "Rollback stable check $stable_checks/$required_stable_checks"
            
            if [ $stable_checks -ge $required_stable_checks ]; then
                success "Rollback is stable!"
                break
            fi
        else
            stable_checks=0
        fi
        
        # Check for failed rollback
        if [ "$rollout_state" = "FAILED" ]; then
            error "Rollback failed with rollout state: $rollout_state"
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
        error "Rollback monitoring timed out after ${max_wait} seconds"
        return 1
    fi
    
    # Verify application after rollback
    verify_rollback_success
    return $?
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

# Function to verify rollback success
verify_rollback_success() {
    log "Verifying rollback success..."
    
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
            success "Application health check passed after rollback!"
            
            # Test a few more endpoints
            test_api_endpoints_after_rollback "$ALB_DNS"
            return 0
        else
            warning "Health check failed with status: $response"
            sleep 30
        fi
        
        attempt=$((attempt + 1))
    done
    
    error "Application health check failed after rollback"
    return 1
}

# Function to test API endpoints after rollback
test_api_endpoints_after_rollback() {
    local alb_dns=$1
    log "Testing key API endpoints after rollback..."
    
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
    
    # Test user endpoint (requires authentication, so just check if it returns proper error)
    local users_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$alb_dns/api/user" || echo "000")
    if [ "$users_response" = "401" ] || [ "$users_response" = "403" ]; then
        success "Users API: OK (authentication required as expected)"
    else
        warning "Users API unexpected response: $users_response"
    fi
}

# Function to test MongoDB connectivity
test_mongodb_connectivity() {
    log "Testing MongoDB connectivity..."
    
    # This would typically require access to MongoDB
    # For now, we'll provide instructions for manual testing
    warning "MongoDB connectivity test requires manual verification"
    echo "Please verify MongoDB connectivity manually:"
    echo "1. Connect to MongoDB server"
    echo "2. Check database 'xrestaurant' exists"
    echo "3. Verify collections have data"
    echo "4. Test a simple query"
    echo ""
    echo "Example commands:"
    echo "mongo xrestaurant --eval 'db.categories.count()'"
    echo "mongo xrestaurant --eval 'db.products.count()'"
    echo "mongo xrestaurant --eval 'db.users.count()'"
    echo ""
    echo "Is MongoDB accessible and contains data? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        success "MongoDB connectivity confirmed"
        return 0
    else
        error "MongoDB connectivity not confirmed"
        return 1
    fi
}

# Function to verify current state
verify_current_state() {
    log "Verifying current deployment state..."
    
    get_current_deployment_info
    
    echo ""
    echo "=========================================="
    echo "Current Deployment Status"
    echo "=========================================="
    echo "Service: $SERVICE_NAME"
    echo "Cluster: $CLUSTER_NAME"
    echo "Task Definition: $CURRENT_TASK_DEF"
    echo "Running Tasks: $CURRENT_RUNNING_COUNT"
    echo "Desired Tasks: $CURRENT_DESIRED_COUNT"
    echo "Service Status: $CURRENT_STATUS"
    echo "=========================================="
    
    # Determine database type from task definition
    if [[ "$CURRENT_TASK_DEF" == *"postgres"* ]]; then
        log "Current deployment is using PostgreSQL"
    elif [[ "$CURRENT_TASK_DEF" == *"mongodb"* ]]; then
        log "Current deployment is using MongoDB"
    else
        warning "Cannot determine database type from task definition"
    fi
    
    # Show recent deployment events
    echo ""
    show_deployment_events
    
    # Test application health
    echo ""
    log "Testing application health..."
    verify_rollback_success
}

# Function to show rollback summary
show_rollback_summary() {
    log "Rollback Summary:"
    echo "=================================="
    echo "Previous Task Definition: $CURRENT_TASK_DEF"
    echo "New Task Definition: $(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $REGION --query 'services[0].taskDefinition' --output text)"
    echo "Rollback Time: $(date)"
    echo "=================================="
    
    # Show current service status
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $REGION \
        --query 'services[0].[serviceName,status,runningCount,pendingCount,desiredCount]' \
        --output table
}

# Main execution
main() {
    log "PostgreSQL Migration Rollback Script"
    log "Region: $REGION"
    log "Cluster: $CLUSTER_NAME"
    log "Service: $SERVICE_NAME"
    
    # Check prerequisites
    log "Checking prerequisites..."
    check_command "aws"
    check_command "curl"
    check_command "jq"
    
    # Verify AWS CLI is configured
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi
    
    success "Prerequisites check passed"
    
    # Get current deployment info
    get_current_deployment_info
    
    # Show menu and handle user choice
    while true; do
        echo ""
        show_rollback_menu
        read -r choice
        
        case $choice in
            1)
                echo ""
                list_available_task_definitions
                echo ""
                quick_rollback
                if [ $? -eq 0 ]; then
                    show_rollback_summary
                fi
                ;;
            2)
                echo ""
                list_available_task_definitions
                echo ""
                full_rollback
                if [ $? -eq 0 ]; then
                    show_rollback_summary
                fi
                ;;
            3)
                echo ""
                verify_current_state
                ;;
            4)
                echo ""
                test_mongodb_connectivity
                ;;
            5)
                log "Exiting rollback script"
                exit 0
                ;;
            *)
                error "Invalid option. Please select 1-5."
                ;;
        esac
        
        echo ""
        echo "Press Enter to continue..."
        read -r
    done
}

# Run main function
main "$@"