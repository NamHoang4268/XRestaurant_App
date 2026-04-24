#!/bin/bash

# =============================================================================
# CloudWatch Dashboard Creation Script for PostgreSQL Migration
# =============================================================================
# This script creates comprehensive CloudWatch dashboards for monitoring:
# 1. RDS PostgreSQL metrics (connections, CPU, memory, I/O)
# 2. ECS application metrics (CPU, memory, task health)
# 3. ALB metrics (requests, response times, errors)
# 4. Custom application metrics (API performance, database queries)
#
# Prerequisites:
# - AWS CLI configured
# - RDS instance running
# - ECS service deployed
# - Application Load Balancer configured
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="us-west-2"
RDS_INSTANCE_ID="xrestaurant-db"
ECS_CLUSTER_NAME="xrestaurant-cluster"
ECS_SERVICE_NAME="xrestaurant-service"
ALB_NAME="xrestaurant-alb"
DASHBOARD_NAME="XRestaurant-PostgreSQL-Migration"

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

# Function to get ALB ARN
get_alb_arn() {
    log "Getting Application Load Balancer ARN..."
    
    ALB_ARN=$(aws elbv2 describe-load-balancers \
        --region $REGION \
        --query "LoadBalancers[?contains(LoadBalancerName, '$ALB_NAME')].LoadBalancerArn" \
        --output text)
    
    if [ -z "$ALB_ARN" ]; then
        warning "ALB not found with name containing: $ALB_NAME"
        ALB_ARN="arn:aws:elasticloadbalancing:$REGION:123456789012:loadbalancer/app/xrestaurant-alb/1234567890123456"
        warning "Using placeholder ALB ARN: $ALB_ARN"
    else
        success "Found ALB ARN: $ALB_ARN"
    fi
}

# Function to get target group ARN
get_target_group_arn() {
    log "Getting Target Group ARN..."
    
    TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups \
        --region $REGION \
        --query "TargetGroups[?contains(TargetGroupName, 'xrestaurant')].TargetGroupArn" \
        --output text)
    
    if [ -z "$TARGET_GROUP_ARN" ]; then
        warning "Target Group not found"
        TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:$REGION:123456789012:targetgroup/xrestaurant-tg/1234567890123456"
        warning "Using placeholder Target Group ARN: $TARGET_GROUP_ARN"
    else
        success "Found Target Group ARN: $TARGET_GROUP_ARN"
    fi
}

# Function to create CloudWatch dashboard
create_dashboard() {
    log "Creating CloudWatch dashboard: $DASHBOARD_NAME"
    
    # Create dashboard JSON configuration
    cat > dashboard-config.json << EOF
{
    "widgets": [
        {
            "type": "metric",
            "x": 0,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "$RDS_INSTANCE_ID" ],
                    [ ".", "CPUUtilization", ".", "." ],
                    [ ".", "FreeableMemory", ".", "." ],
                    [ ".", "ReadLatency", ".", "." ],
                    [ ".", "WriteLatency", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "RDS PostgreSQL - Core Metrics",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/RDS", "ReadIOPS", "DBInstanceIdentifier", "$RDS_INSTANCE_ID" ],
                    [ ".", "WriteIOPS", ".", "." ],
                    [ ".", "ReadThroughput", ".", "." ],
                    [ ".", "WriteThroughput", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "RDS PostgreSQL - I/O Metrics",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ECS", "CPUUtilization", "ServiceName", "$ECS_SERVICE_NAME", "ClusterName", "$ECS_CLUSTER_NAME" ],
                    [ ".", "MemoryUtilization", ".", ".", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "ECS Service - Resource Utilization",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ECS", "RunningTaskCount", "ServiceName", "$ECS_SERVICE_NAME", "ClusterName", "$ECS_CLUSTER_NAME" ],
                    [ ".", "PendingTaskCount", ".", ".", ".", "." ],
                    [ ".", "DesiredCount", ".", ".", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "ECS Service - Task Counts",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 12,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "RequestCount", "LoadBalancer", "$(echo $ALB_ARN | cut -d'/' -f2-)" ],
                    [ ".", "TargetResponseTime", ".", "." ],
                    [ ".", "HTTPCode_Target_2XX_Count", ".", "." ],
                    [ ".", "HTTPCode_Target_4XX_Count", ".", "." ],
                    [ ".", "HTTPCode_Target_5XX_Count", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "Application Load Balancer - Request Metrics",
                "period": 300,
                "stat": "Sum"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 12,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", "$(echo $TARGET_GROUP_ARN | cut -d'/' -f2-)", "LoadBalancer", "$(echo $ALB_ARN | cut -d'/' -f2-)" ],
                    [ ".", "UnHealthyHostCount", ".", ".", ".", "." ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "Target Group - Health Status",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "log",
            "x": 0,
            "y": 18,
            "width": 24,
            "height": 6,
            "properties": {
                "query": "SOURCE '/ecs/xrestaurant-postgres'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 100",
                "region": "$REGION",
                "title": "Recent Application Errors",
                "view": "table"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 24,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "$RDS_INSTANCE_ID" ]
                ],
                "view": "singleValue",
                "region": "$REGION",
                "title": "Current DB Connections",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 8,
            "y": 24,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ECS", "RunningTaskCount", "ServiceName", "$ECS_SERVICE_NAME", "ClusterName", "$ECS_CLUSTER_NAME" ]
                ],
                "view": "singleValue",
                "region": "$REGION",
                "title": "Running Tasks",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 16,
            "y": 24,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "RequestCount", "LoadBalancer", "$(echo $ALB_ARN | cut -d'/' -f2-)" ]
                ],
                "view": "singleValue",
                "region": "$REGION",
                "title": "Requests/Min",
                "period": 60,
                "stat": "Sum"
            }
        }
    ]
}
EOF

    # Create the dashboard
    aws cloudwatch put-dashboard \
        --dashboard-name "$DASHBOARD_NAME" \
        --dashboard-body file://dashboard-config.json \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        success "CloudWatch dashboard created: $DASHBOARD_NAME"
    else
        error "Failed to create CloudWatch dashboard"
        exit 1
    fi
}

# Function to create custom metrics dashboard
create_custom_metrics_dashboard() {
    log "Creating custom application metrics dashboard..."
    
    CUSTOM_DASHBOARD_NAME="XRestaurant-Application-Metrics"
    
    cat > custom-dashboard-config.json << EOF
{
    "widgets": [
        {
            "type": "metric",
            "x": 0,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "XRestaurant/Application", "DatabaseQueryDuration", "QueryType", "SELECT" ],
                    [ ".", ".", ".", "INSERT" ],
                    [ ".", ".", ".", "UPDATE" ],
                    [ ".", ".", ".", "DELETE" ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "Database Query Performance",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "XRestaurant/Application", "APIResponseTime", "Endpoint", "/api/category" ],
                    [ ".", ".", ".", "/api/product" ],
                    [ ".", ".", ".", "/api/table" ],
                    [ ".", ".", ".", "/api/user" ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "API Endpoint Response Times",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "XRestaurant/Application", "ConnectionPoolSize", "Pool", "Active" ],
                    [ ".", ".", ".", "Idle" ],
                    [ ".", ".", ".", "Total" ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "Database Connection Pool",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ "XRestaurant/Application", "OrderProcessingTime", "Status", "Success" ],
                    [ ".", ".", ".", "Failed" ],
                    [ "XRestaurant/Application", "PaymentProcessingTime", "Provider", "Stripe" ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "$REGION",
                "title": "Business Process Metrics",
                "period": 300,
                "stat": "Average"
            }
        },
        {
            "type": "log",
            "x": 0,
            "y": 12,
            "width": 24,
            "height": 6,
            "properties": {
                "query": "SOURCE '/ecs/xrestaurant-postgres'\n| fields @timestamp, @message\n| filter @message like /Slow query/\n| sort @timestamp desc\n| limit 50",
                "region": "$REGION",
                "title": "Slow Database Queries",
                "view": "table"
            }
        }
    ]
}
EOF

    # Create the custom dashboard
    aws cloudwatch put-dashboard \
        --dashboard-name "$CUSTOM_DASHBOARD_NAME" \
        --dashboard-body file://custom-dashboard-config.json \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        success "Custom application metrics dashboard created: $CUSTOM_DASHBOARD_NAME"
    else
        error "Failed to create custom metrics dashboard"
        exit 1
    fi
}

# Function to create log insights queries
create_log_insights_queries() {
    log "Creating CloudWatch Logs Insights saved queries..."
    
    # Query 1: Database connection errors
    aws logs put-query-definition \
        --name "XRestaurant-Database-Connection-Errors" \
        --query-string 'fields @timestamp, @message | filter @message like /database connection/ or @message like /connection refused/ | sort @timestamp desc' \
        --log-group-names "/ecs/xrestaurant-postgres" \
        --region $REGION
    
    # Query 2: API response times
    aws logs put-query-definition \
        --name "XRestaurant-API-Response-Times" \
        --query-string 'fields @timestamp, @message | filter @message like /Response time/ | stats avg(@duration) by bin(5m)' \
        --log-group-names "/ecs/xrestaurant-postgres" \
        --region $REGION
    
    # Query 3: Error analysis
    aws logs put-query-definition \
        --name "XRestaurant-Error-Analysis" \
        --query-string 'fields @timestamp, @message | filter @level = "ERROR" | stats count() by @message | sort count desc' \
        --log-group-names "/ecs/xrestaurant-postgres" \
        --region $REGION
    
    # Query 4: Sequelize query performance
    aws logs put-query-definition \
        --name "XRestaurant-Sequelize-Performance" \
        --query-string 'fields @timestamp, @message | filter @message like /Executed/ | parse @message "Executed (*): * ms" as query, duration | stats avg(duration), max(duration), count() by query' \
        --log-group-names "/ecs/xrestaurant-postgres" \
        --region $REGION
    
    success "CloudWatch Logs Insights queries created"
}

# Function to cleanup
cleanup() {
    log "Cleaning up temporary files..."
    
    if [ -f "dashboard-config.json" ]; then
        rm dashboard-config.json
        log "Removed dashboard-config.json"
    fi
    
    if [ -f "custom-dashboard-config.json" ]; then
        rm custom-dashboard-config.json
        log "Removed custom-dashboard-config.json"
    fi
}

# Function to show dashboard URLs
show_dashboard_urls() {
    log "Dashboard URLs:"
    echo "=================================="
    echo "Main Dashboard:"
    echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=$DASHBOARD_NAME"
    echo ""
    echo "Custom Metrics Dashboard:"
    echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=XRestaurant-Application-Metrics"
    echo ""
    echo "CloudWatch Logs Insights:"
    echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:logs-insights"
    echo "=================================="
}

# Main execution
main() {
    log "Creating CloudWatch dashboards for PostgreSQL migration monitoring..."
    log "Region: $REGION"
    log "RDS Instance: $RDS_INSTANCE_ID"
    log "ECS Cluster: $ECS_CLUSTER_NAME"
    log "ECS Service: $ECS_SERVICE_NAME"
    
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
    
    # Get AWS resource ARNs
    get_alb_arn
    get_target_group_arn
    
    # Create dashboards
    create_dashboard
    create_custom_metrics_dashboard
    create_log_insights_queries
    
    # Show results
    show_dashboard_urls
    
    success "CloudWatch dashboards created successfully!"
    
    log "Next steps:"
    echo "1. Configure CloudWatch alarms (run 22-2-create-alarms.sh)"
    echo "2. Set up custom application metrics in your code"
    echo "3. Configure SNS notifications for alerts"
    echo "4. Review and customize dashboard widgets as needed"
    
    # Cleanup
    cleanup
    
    log "Dashboard creation completed"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"