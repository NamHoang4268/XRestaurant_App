#!/bin/bash

# =============================================================================
# CloudWatch Alarms Creation Script for PostgreSQL Migration
# =============================================================================
# This script creates comprehensive CloudWatch alarms for monitoring:
# 1. RDS PostgreSQL alarms (high connections, CPU, memory, slow queries)
# 2. ECS application alarms (high CPU/memory, task failures)
# 3. ALB alarms (high error rates, slow response times)
# 4. Custom application alarms (database query performance)
#
# Prerequisites:
# - AWS CLI configured
# - SNS topic for notifications (optional)
# - RDS instance running
# - ECS service deployed
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="ap-southeast-1"
RDS_INSTANCE_ID="xrestaurant-db"
ECS_CLUSTER_NAME="xrestaurant-cluster"
ECS_SERVICE_NAME="xrestaurant-service"
ALB_NAME="xrestaurant-alb"
SNS_TOPIC_NAME="xrestaurant-alerts"

# Alarm thresholds
DB_CONNECTION_THRESHOLD=80      # 80% of max connections
DB_CPU_THRESHOLD=80            # 80% CPU utilization
DB_MEMORY_THRESHOLD=85         # 85% memory utilization
DB_READ_LATENCY_THRESHOLD=0.2  # 200ms read latency
DB_WRITE_LATENCY_THRESHOLD=0.2 # 200ms write latency

ECS_CPU_THRESHOLD=80           # 80% CPU utilization
ECS_MEMORY_THRESHOLD=85        # 85% memory utilization

ALB_ERROR_RATE_THRESHOLD=5     # 5% error rate
ALB_RESPONSE_TIME_THRESHOLD=2  # 2 seconds response time

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

# Function to create or get SNS topic
create_sns_topic() {
    log "Creating SNS topic for alerts..."
    
    # Check if topic already exists
    SNS_TOPIC_ARN=$(aws sns list-topics \
        --region $REGION \
        --query "Topics[?contains(TopicArn, '$SNS_TOPIC_NAME')].TopicArn" \
        --output text)
    
    if [ -z "$SNS_TOPIC_ARN" ]; then
        # Create new SNS topic
        SNS_TOPIC_ARN=$(aws sns create-topic \
            --name $SNS_TOPIC_NAME \
            --region $REGION \
            --query 'TopicArn' \
            --output text)
        
        if [ -n "$SNS_TOPIC_ARN" ]; then
            success "SNS topic created: $SNS_TOPIC_ARN"
            
            # Add email subscription (optional)
            warning "To receive email notifications, add email subscription:"
            echo "aws sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com --region $REGION"
        else
            error "Failed to create SNS topic"
            exit 1
        fi
    else
        success "Using existing SNS topic: $SNS_TOPIC_ARN"
    fi
}

# Function to get ALB ARN
get_alb_arn() {
    log "Getting Application Load Balancer ARN..."
    
    ALB_ARN=$(aws elbv2 describe-load-balancers \
        --region $REGION \
        --query "LoadBalancers[?contains(LoadBalancerName, '$ALB_NAME')].LoadBalancerArn" \
        --output text)
    
    if [ -z "$ALB_ARN" ]; then
        warning "ALB not found with name containing: $ALB_NAME"
        ALB_FULL_NAME="app/xrestaurant-alb/1234567890123456"
        warning "Using placeholder ALB name: $ALB_FULL_NAME"
    else
        ALB_FULL_NAME=$(echo $ALB_ARN | cut -d'/' -f2-)
        success "Found ALB: $ALB_FULL_NAME"
    fi
}

# Function to create RDS alarms
create_rds_alarms() {
    log "Creating RDS PostgreSQL alarms..."
    
    # High database connections alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-HighConnections" \
        --alarm-description "RDS database connections are high" \
        --metric-name DatabaseConnections \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold $DB_CONNECTION_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    # High CPU utilization alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-HighCPU" \
        --alarm-description "RDS CPU utilization is high" \
        --metric-name CPUUtilization \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold $DB_CPU_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    # Low free memory alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-LowMemory" \
        --alarm-description "RDS free memory is low" \
        --metric-name FreeableMemory \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold 268435456 \
        --comparison-operator LessThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    # High read latency alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-HighReadLatency" \
        --alarm-description "RDS read latency is high" \
        --metric-name ReadLatency \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold $DB_READ_LATENCY_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    # High write latency alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-HighWriteLatency" \
        --alarm-description "RDS write latency is high" \
        --metric-name WriteLatency \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold $DB_WRITE_LATENCY_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    # Database connection failures alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-RDS-ConnectionFailures" \
        --alarm-description "RDS connection failures detected" \
        --metric-name DatabaseConnections \
        --namespace AWS/RDS \
        --statistic Average \
        --period 300 \
        --threshold 0 \
        --comparison-operator LessThanThreshold \
        --evaluation-periods 1 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=DBInstanceIdentifier,Value=$RDS_INSTANCE_ID \
        --region $REGION
    
    success "RDS alarms created successfully"
}

# Function to create ECS alarms
create_ecs_alarms() {
    log "Creating ECS service alarms..."
    
    # High CPU utilization alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ECS-HighCPU" \
        --alarm-description "ECS service CPU utilization is high" \
        --metric-name CPUUtilization \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold $ECS_CPU_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=ServiceName,Value=$ECS_SERVICE_NAME Name=ClusterName,Value=$ECS_CLUSTER_NAME \
        --region $REGION
    
    # High memory utilization alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ECS-HighMemory" \
        --alarm-description "ECS service memory utilization is high" \
        --metric-name MemoryUtilization \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold $ECS_MEMORY_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=ServiceName,Value=$ECS_SERVICE_NAME Name=ClusterName,Value=$ECS_CLUSTER_NAME \
        --region $REGION
    
    # Service task count alarm (no running tasks)
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ECS-NoRunningTasks" \
        --alarm-description "ECS service has no running tasks" \
        --metric-name RunningTaskCount \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold 1 \
        --comparison-operator LessThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=ServiceName,Value=$ECS_SERVICE_NAME Name=ClusterName,Value=$ECS_CLUSTER_NAME \
        --region $REGION
    
    # Service deployment alarm (stuck deployment)
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ECS-StuckDeployment" \
        --alarm-description "ECS service deployment is stuck" \
        --metric-name PendingTaskCount \
        --namespace AWS/ECS \
        --statistic Average \
        --period 600 \
        --threshold 0 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=ServiceName,Value=$ECS_SERVICE_NAME Name=ClusterName,Value=$ECS_CLUSTER_NAME \
        --region $REGION
    
    success "ECS alarms created successfully"
}

# Function to create ALB alarms
create_alb_alarms() {
    log "Creating Application Load Balancer alarms..."
    
    # High 5xx error rate alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ALB-High5xxErrors" \
        --alarm-description "ALB 5xx error rate is high" \
        --metric-name HTTPCode_Target_5XX_Count \
        --namespace AWS/ApplicationELB \
        --statistic Sum \
        --period 300 \
        --threshold 10 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=LoadBalancer,Value=$ALB_FULL_NAME \
        --region $REGION
    
    # High 4xx error rate alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ALB-High4xxErrors" \
        --alarm-description "ALB 4xx error rate is high" \
        --metric-name HTTPCode_Target_4XX_Count \
        --namespace AWS/ApplicationELB \
        --statistic Sum \
        --period 300 \
        --threshold 50 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=LoadBalancer,Value=$ALB_FULL_NAME \
        --region $REGION
    
    # High response time alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ALB-HighResponseTime" \
        --alarm-description "ALB response time is high" \
        --metric-name TargetResponseTime \
        --namespace AWS/ApplicationELB \
        --statistic Average \
        --period 300 \
        --threshold $ALB_RESPONSE_TIME_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=LoadBalancer,Value=$ALB_FULL_NAME \
        --region $REGION
    
    # No healthy targets alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-ALB-NoHealthyTargets" \
        --alarm-description "ALB has no healthy targets" \
        --metric-name HealthyHostCount \
        --namespace AWS/ApplicationELB \
        --statistic Average \
        --period 300 \
        --threshold 1 \
        --comparison-operator LessThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=LoadBalancer,Value=$ALB_FULL_NAME \
        --region $REGION
    
    success "ALB alarms created successfully"
}

# Function to create custom application alarms
create_custom_alarms() {
    log "Creating custom application alarms..."
    
    # Slow database query alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-App-SlowQueries" \
        --alarm-description "Application has slow database queries" \
        --metric-name DatabaseQueryDuration \
        --namespace XRestaurant/Application \
        --statistic Average \
        --period 300 \
        --threshold 1000 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --region $REGION
    
    # High API response time alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-App-HighAPIResponseTime" \
        --alarm-description "Application API response time is high" \
        --metric-name APIResponseTime \
        --namespace XRestaurant/Application \
        --statistic Average \
        --period 300 \
        --threshold 2000 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 3 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --region $REGION
    
    # Connection pool exhaustion alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-App-ConnectionPoolExhaustion" \
        --alarm-description "Database connection pool is nearly exhausted" \
        --metric-name ConnectionPoolSize \
        --namespace XRestaurant/Application \
        --statistic Average \
        --period 300 \
        --threshold 8 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=Pool,Value=Active \
        --region $REGION
    
    # Payment processing failures alarm
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-App-PaymentFailures" \
        --alarm-description "High payment processing failure rate" \
        --metric-name PaymentProcessingTime \
        --namespace XRestaurant/Application \
        --statistic SampleCount \
        --period 300 \
        --threshold 5 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --dimensions Name=Status,Value=Failed \
        --region $REGION
    
    success "Custom application alarms created successfully"
}

# Function to create log-based alarms
create_log_alarms() {
    log "Creating log-based alarms..."
    
    # Create metric filter for database connection errors
    aws logs put-metric-filter \
        --log-group-name "/ecs/xrestaurant-postgres" \
        --filter-name "DatabaseConnectionErrors" \
        --filter-pattern "[timestamp, request_id, level=\"ERROR\", message=\"*database*connection*\"]" \
        --metric-transformations \
            metricName=DatabaseConnectionErrors,metricNamespace=XRestaurant/Logs,metricValue=1 \
        --region $REGION
    
    # Create alarm for database connection errors
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-Logs-DatabaseConnectionErrors" \
        --alarm-description "Database connection errors detected in logs" \
        --metric-name DatabaseConnectionErrors \
        --namespace XRestaurant/Logs \
        --statistic Sum \
        --period 300 \
        --threshold 5 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 1 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --region $REGION
    
    # Create metric filter for application errors
    aws logs put-metric-filter \
        --log-group-name "/ecs/xrestaurant-postgres" \
        --filter-name "ApplicationErrors" \
        --filter-pattern "[timestamp, request_id, level=\"ERROR\"]" \
        --metric-transformations \
            metricName=ApplicationErrors,metricNamespace=XRestaurant/Logs,metricValue=1 \
        --region $REGION
    
    # Create alarm for application errors
    aws cloudwatch put-metric-alarm \
        --alarm-name "XRestaurant-Logs-ApplicationErrors" \
        --alarm-description "High application error rate detected in logs" \
        --metric-name ApplicationErrors \
        --namespace XRestaurant/Logs \
        --statistic Sum \
        --period 300 \
        --threshold 20 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --treat-missing-data notBreaching \
        --alarm-actions $SNS_TOPIC_ARN \
        --region $REGION
    
    success "Log-based alarms created successfully"
}

# Function to list created alarms
list_created_alarms() {
    log "Listing created alarms..."
    
    aws cloudwatch describe-alarms \
        --alarm-name-prefix "XRestaurant-" \
        --region $REGION \
        --query 'MetricAlarms[*].[AlarmName,StateValue,MetricName,Threshold]' \
        --output table
}

# Function to show alarm management commands
show_alarm_management() {
    log "Alarm Management Commands:"
    echo "=================================="
    echo "List all alarms:"
    echo "aws cloudwatch describe-alarms --alarm-name-prefix 'XRestaurant-' --region $REGION"
    echo ""
    echo "Test alarm (set to ALARM state):"
    echo "aws cloudwatch set-alarm-state --alarm-name 'XRestaurant-RDS-HighCPU' --state-value ALARM --state-reason 'Testing alarm' --region $REGION"
    echo ""
    echo "Disable alarm:"
    echo "aws cloudwatch disable-alarm-actions --alarm-names 'XRestaurant-RDS-HighCPU' --region $REGION"
    echo ""
    echo "Enable alarm:"
    echo "aws cloudwatch enable-alarm-actions --alarm-names 'XRestaurant-RDS-HighCPU' --region $REGION"
    echo ""
    echo "Delete alarm:"
    echo "aws cloudwatch delete-alarms --alarm-names 'XRestaurant-RDS-HighCPU' --region $REGION"
    echo "=================================="
}

# Main execution
main() {
    log "Creating CloudWatch alarms for PostgreSQL migration monitoring..."
    log "Region: $REGION"
    log "RDS Instance: $RDS_INSTANCE_ID"
    log "ECS Cluster: $ECS_CLUSTER_NAME"
    log "ECS Service: $ECS_SERVICE_NAME"
    log "SNS Topic: $SNS_TOPIC_NAME"
    
    # Check prerequisites
    log "Checking prerequisites..."
    check_command "aws"
    
    # Verify AWS CLI is configured
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi
    
    success "Prerequisites check passed"
    
    # Create SNS topic for notifications
    create_sns_topic
    
    # Get ALB information
    get_alb_arn
    
    # Create all alarm categories
    create_rds_alarms
    create_ecs_alarms
    create_alb_alarms
    create_custom_alarms
    create_log_alarms
    
    # Show results
    list_created_alarms
    show_alarm_management
    
    success "CloudWatch alarms created successfully!"
    
    log "Next steps:"
    echo "1. Subscribe to SNS topic for email notifications:"
    echo "   aws sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com --region $REGION"
    echo "2. Test alarms by triggering alarm conditions"
    echo "3. Customize alarm thresholds based on your requirements"
    echo "4. Set up custom application metrics (run 22-3-setup-custom-metrics.sh)"
    echo "5. Configure alarm actions (auto-scaling, Lambda functions, etc.)"
    
    log "Alarm creation completed"
}

# Run main function
main "$@"