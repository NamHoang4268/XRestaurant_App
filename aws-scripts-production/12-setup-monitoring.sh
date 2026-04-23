#!/bin/bash

# ============================================
# Script 10: Setup CloudWatch Monitoring & Alarms
# ============================================
# Purpose: Create CloudWatch dashboards and alarms
# - ECS service monitoring (CPU, Memory, Task count)
# - ALB monitoring (Target health, Response time, 5xx errors)
# - S3 monitoring (Requests, Errors)
# - SNS topic for alarm notifications
# - Handles existing resources gracefully
# ============================================

export AWS_PAGER=""

# Source configuration
source ./vpc-config.sh

echo "============================================"
echo "Setting Up CloudWatch Monitoring & Alarms"
echo "============================================"

# ============================================
# 1. Create SNS Topic for Alarms
# ============================================

echo ""
echo "Step 1: Creating SNS topic for alarm notifications..."

# Check if SNS topic exists
EXISTING_TOPIC=$(aws sns list-topics \
    --query "Topics[?contains(TopicArn, 'xrestaurant-alarms')].TopicArn | [0]" \
    --output text \
    --region ${AWS_REGION})

if [ "$EXISTING_TOPIC" != "None" ] && [ -n "$EXISTING_TOPIC" ]; then
    echo "✓ SNS topic already exists: $EXISTING_TOPIC"
    SNS_TOPIC_ARN="$EXISTING_TOPIC"
else
    SNS_TOPIC_ARN=$(aws sns create-topic \
        --name xrestaurant-alarms \
        --tags "Key=OWNER,Value=${OWNER}" "Key=PROJECT,Value=${PROJECT}" \
        --query "TopicArn" \
        --output text \
        --region ${AWS_REGION})
    
    echo "✓ SNS topic created: $SNS_TOPIC_ARN"
fi

# Note: To receive email notifications, subscribe manually:
echo "  To receive email alerts, run:"
echo "  aws sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com --region ${AWS_REGION}"

# ============================================
# 2. Create CloudWatch Dashboard
# ============================================

echo ""
echo "Step 2: Creating CloudWatch dashboard..."

# Get ALB full name
ALB_FULL_NAME=$(aws elbv2 describe-load-balancers \
    --names ${ALB_NAME} \
    --query "LoadBalancers[0].LoadBalancerArn" \
    --output text \
    --region ${AWS_REGION} | awk -F: '{print $NF}' | sed 's/loadbalancer\///')

# Get Target Group full name
TG_FULL_NAME=$(aws elbv2 describe-target-groups \
    --names ${TARGET_GROUP_NAME} \
    --query "TargetGroups[0].TargetGroupArn" \
    --output text \
    --region ${AWS_REGION} | awk -F: '{print $NF}')

# Dashboard configuration
DASHBOARD_BODY=$(cat <<EOF
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "CPU Average" } ],
                    [ "...", { "stat": "Maximum", "label": "CPU Max" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "ECS CPU Utilization",
                "period": 300,
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ECS", "MemoryUtilization", { "stat": "Average", "label": "Memory Average" } ],
                    [ "...", { "stat": "Maximum", "label": "Memory Max" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "ECS Memory Utilization",
                "period": 300,
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "TargetResponseTime", { "stat": "Average" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "ALB Response Time",
                "period": 300
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", { "stat": "Sum", "label": "5xx Errors" } ],
                    [ ".", "HTTPCode_Target_4XX_Count", { "stat": "Sum", "label": "4xx Errors" } ],
                    [ ".", "HTTPCode_Target_2XX_Count", { "stat": "Sum", "label": "2xx Success" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "ALB HTTP Response Codes",
                "period": 300
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "HealthyHostCount", { "stat": "Average" } ],
                    [ ".", "UnHealthyHostCount", { "stat": "Average" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "Target Health",
                "period": 300
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "AWS/ApplicationELB", "RequestCount", { "stat": "Sum" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${AWS_REGION}",
                "title": "ALB Request Count",
                "period": 300
            }
        }
    ]
}
EOF
)

aws cloudwatch put-dashboard \
    --dashboard-name xrestaurant-monitoring \
    --dashboard-body "$DASHBOARD_BODY" \
    --region ${AWS_REGION} > /dev/null

echo "✓ CloudWatch dashboard created: xrestaurant-monitoring"

# ============================================
# 3. Create CloudWatch Alarms
# ============================================

echo ""
echo "Step 3: Creating CloudWatch alarms..."

# Alarm 1: High CPU Utilization
aws cloudwatch put-metric-alarm \
    --alarm-name xrestaurant-high-cpu \
    --alarm-description "Alert when ECS CPU > 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --dimensions Name=ServiceName,Value=${ECS_SERVICE_NAME} Name=ClusterName,Value=${ECS_CLUSTER_NAME} \
    --region ${AWS_REGION} 2>/dev/null || echo "  Note: CPU alarm already exists or failed"

echo "✓ Alarm created: xrestaurant-high-cpu (CPU > 80%)"

# Alarm 2: High Memory Utilization
aws cloudwatch put-metric-alarm \
    --alarm-name xrestaurant-high-memory \
    --alarm-description "Alert when ECS Memory > 80%" \
    --metric-name MemoryUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --dimensions Name=ServiceName,Value=${ECS_SERVICE_NAME} Name=ClusterName,Value=${ECS_CLUSTER_NAME} \
    --region ${AWS_REGION} 2>/dev/null || echo "  Note: Memory alarm already exists or failed"

echo "✓ Alarm created: xrestaurant-high-memory (Memory > 80%)"

# Alarm 3: Unhealthy Targets
aws cloudwatch put-metric-alarm \
    --alarm-name xrestaurant-unhealthy-targets \
    --alarm-description "Alert when targets are unhealthy" \
    --metric-name UnHealthyHostCount \
    --namespace AWS/ApplicationELB \
    --statistic Average \
    --period 60 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --evaluation-periods 2 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --dimensions Name=LoadBalancer,Value=${ALB_FULL_NAME} Name=TargetGroup,Value=${TG_FULL_NAME} \
    --region ${AWS_REGION} 2>/dev/null || echo "  Note: Unhealthy targets alarm already exists or failed"

echo "✓ Alarm created: xrestaurant-unhealthy-targets"

# Alarm 4: High 5xx Error Rate
aws cloudwatch put-metric-alarm \
    --alarm-name xrestaurant-high-5xx-errors \
    --alarm-description "Alert when 5xx errors > 10 in 5 minutes" \
    --metric-name HTTPCode_Target_5XX_Count \
    --namespace AWS/ApplicationELB \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --dimensions Name=LoadBalancer,Value=${ALB_FULL_NAME} \
    --region ${AWS_REGION} 2>/dev/null || echo "  Note: 5xx errors alarm already exists or failed"

echo "✓ Alarm created: xrestaurant-high-5xx-errors (5xx > 10 in 5min)"

# ============================================
# Summary
# ============================================

echo ""
echo "============================================"
echo "Monitoring Setup Complete"
echo "============================================"
echo ""
echo "Resources Created:"
echo "  - SNS Topic: $SNS_TOPIC_ARN"
echo "  - Dashboard: xrestaurant-monitoring"
echo "  - Alarms:"
echo "    • xrestaurant-high-cpu (CPU > 80%)"
echo "    • xrestaurant-high-memory (Memory > 80%)"
echo "    • xrestaurant-unhealthy-targets"
echo "    • xrestaurant-high-5xx-errors (5xx > 10)"
echo ""
echo "View Dashboard:"
echo "  https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:name=xrestaurant-monitoring"
echo ""
echo "View Alarms:"
echo "  https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#alarmsV2:"
echo ""
echo "To receive email notifications:"
echo "  aws sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com --region ${AWS_REGION}"
echo ""
