#!/bin/bash

# ============================================
# Script 11: Setup Auto Scaling for ECS
# ============================================
# Purpose: Configure auto scaling for ECS service
# - Target tracking scaling based on CPU/Memory
# - Scale out when load increases
# - Scale in when load decreases
# - Min: 2 tasks, Max: 10 tasks
# - Handles existing resources gracefully
# ============================================

export AWS_PAGER=""

# Tags
OWNER="NamHoang"
PROJECT="XRestaurant"

# Source configuration
source ./vpc-config.sh

echo "============================================"
echo "Setting Up ECS Auto Scaling"
echo "============================================"

# ============================================
# 1. Register Scalable Target
# ============================================

echo ""
echo "Step 1: Registering ECS service as scalable target..."

# Register the ECS service with Application Auto Scaling
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
    --min-capacity 2 \
    --max-capacity 10 \
    --region ${AWS_REGION} 2>/dev/null || echo "  Note: Scalable target already registered or failed"

echo "✓ Scalable target registered (Min: 2, Max: 10 tasks)"

# ============================================
# 2. Create CPU-based Scaling Policy
# ============================================

echo ""
echo "Step 2: Creating CPU-based target tracking scaling policy..."

# Create target tracking scaling policy for CPU
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
    --policy-name xrestaurant-cpu-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
        },
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 180
    }' \
    --region ${AWS_REGION} > /dev/null 2>&1 || echo "  Note: CPU scaling policy already exists or failed"

echo "✓ CPU scaling policy created (Target: 70%)"
echo "  - Scale out when CPU > 70% (cooldown: 60s)"
echo "  - Scale in when CPU < 70% (cooldown: 180s)"

# ============================================
# 3. Create Memory-based Scaling Policy
# ============================================

echo ""
echo "Step 3: Creating Memory-based target tracking scaling policy..."

# Create target tracking scaling policy for Memory
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
    --policy-name xrestaurant-memory-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ECSServiceAverageMemoryUtilization"
        },
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 180
    }' \
    --region ${AWS_REGION} > /dev/null 2>&1 || echo "  Note: Memory scaling policy already exists or failed"

echo "✓ Memory scaling policy created (Target: 70%)"
echo "  - Scale out when Memory > 70% (cooldown: 60s)"
echo "  - Scale in when Memory < 70% (cooldown: 180s)"

# ============================================
# 4. Create ALB Request Count Scaling Policy
# ============================================

echo ""
echo "Step 4: Creating ALB request count scaling policy..."

# Get ALB full name for metrics
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

# Create target tracking scaling policy for ALB request count
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \
    --policy-name xrestaurant-request-count-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 1000.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ALBRequestCountPerTarget",
            "ResourceLabel": "'"${ALB_FULL_NAME}/${TG_FULL_NAME}"'"
        },
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 180
    }' \
    --region ${AWS_REGION} > /dev/null 2>&1 || echo "  Note: Request count scaling policy already exists or failed"

echo "✓ Request count scaling policy created (Target: 1000 requests/target/minute)"
echo "  - Scale out when requests > 1000/target/min"
echo "  - Scale in when requests < 1000/target/min"

# ============================================
# Summary
# ============================================

echo ""
echo "============================================"
echo "Auto Scaling Setup Complete"
echo "============================================"
echo ""
echo "Configuration:"
echo "  - Min tasks: 2"
echo "  - Max tasks: 10"
echo "  - Current tasks: 2"
echo ""
echo "Scaling Policies:"
echo "  1. CPU-based (Target: 70%)"
echo "     • Scale out cooldown: 60s"
echo "     • Scale in cooldown: 180s"
echo ""
echo "  2. Memory-based (Target: 70%)"
echo "     • Scale out cooldown: 60s"
echo "     • Scale in cooldown: 180s"
echo ""
echo "  3. Request count-based (Target: 1000 req/target/min)"
echo "     • Scale out cooldown: 60s"
echo "     • Scale in cooldown: 180s"
echo ""
echo "View Scaling Activities:"
echo "  aws application-autoscaling describe-scaling-activities \\"
echo "    --service-namespace ecs \\"
echo "    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \\"
echo "    --region ${AWS_REGION}"
echo ""
echo "View Scaling Policies:"
echo "  aws application-autoscaling describe-scaling-policies \\"
echo "    --service-namespace ecs \\"
echo "    --resource-id service/${ECS_CLUSTER}/${ECS_SERVICE} \\"
echo "    --region ${AWS_REGION}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./14-create-sns-sqs-lambda.sh"
echo ""
echo "=========================================="
