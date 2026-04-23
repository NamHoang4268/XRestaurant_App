#!/bin/bash

# ============================================================================
# File: 07-create-alb.sh
# Description: Create Application Load Balancer and Update ECS Service
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🌐 Create Application Load Balancer"
echo "=========================================="
echo ""

# Load VPC configuration
if [ -f vpc-config.sh ]; then
  source vpc-config.sh
  echo "✅ Loaded VPC configuration"
else
  echo "❌ Error: vpc-config.sh not found!"
  exit 1
fi

echo "Configuration:"
echo "  - Region: $AWS_REGION"
echo "  - VPC: $VPC_ID"
echo "  - Owner: $OWNER"
echo "  - Project: $PROJECT"
echo ""

ALB_NAME="xrestaurant-alb"
TARGET_GROUP_NAME="xrestaurant-tg"
CONTAINER_PORT=3000
HEALTH_CHECK_PATH="/health"

# ============================================================================
# STEP 1: Create Target Group
# ============================================================================
echo "📋 Step 1: Create Target Group..."

# Check if target group exists
EXISTING_TG=$(aws elbv2 describe-target-groups \
    --region ${AWS_REGION} \
    --query "TargetGroups[?TargetGroupName=='${TARGET_GROUP_NAME}'].TargetGroupArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_TG" ]; then
  echo "⚠️  Target Group already exists: ${TARGET_GROUP_NAME}"
  TARGET_GROUP_ARN=$EXISTING_TG
else
  TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
      --name ${TARGET_GROUP_NAME} \
      --protocol HTTP \
      --port ${CONTAINER_PORT} \
      --vpc-id ${VPC_ID} \
      --target-type ip \
      --health-check-enabled \
      --health-check-protocol HTTP \
      --health-check-path ${HEALTH_CHECK_PATH} \
      --health-check-interval-seconds 30 \
      --health-check-timeout-seconds 5 \
      --healthy-threshold-count 2 \
      --unhealthy-threshold-count 3 \
      --matcher HttpCode=200 \
      --region ${AWS_REGION} \
      --tags Key=Name,Value=${TARGET_GROUP_NAME} Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
      --query 'TargetGroups[0].TargetGroupArn' \
      --output text)
  
  echo "✅ Target Group created: ${TARGET_GROUP_NAME}"
fi

echo "   ARN: ${TARGET_GROUP_ARN}"
echo ""

# ============================================================================
# STEP 2: Create Application Load Balancer
# ============================================================================
echo "📋 Step 2: Create Application Load Balancer..."

# Check if ALB exists
EXISTING_ALB=$(aws elbv2 describe-load-balancers \
    --region ${AWS_REGION} \
    --query "LoadBalancers[?LoadBalancerName=='${ALB_NAME}'].LoadBalancerArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_ALB" ]; then
  echo "⚠️  ALB already exists: ${ALB_NAME}"
  ALB_ARN=$EXISTING_ALB
  
  ALB_DNS=$(aws elbv2 describe-load-balancers \
      --load-balancer-arns ${ALB_ARN} \
      --region ${AWS_REGION} \
      --query 'LoadBalancers[0].DNSName' \
      --output text)
else
  ALB_ARN=$(aws elbv2 create-load-balancer \
      --name ${ALB_NAME} \
      --subnets ${PUBLIC_SUBNET_1} ${PUBLIC_SUBNET_2} \
      --security-groups ${SG_ALB} \
      --scheme internet-facing \
      --type application \
      --ip-address-type ipv4 \
      --region ${AWS_REGION} \
      --tags Key=Name,Value=${ALB_NAME} Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
      --query 'LoadBalancers[0].LoadBalancerArn' \
      --output text)
  
  echo "✅ ALB created: ${ALB_NAME}"
  
  echo "⏳ Waiting for ALB to become active..."
  aws elbv2 wait load-balancer-available \
      --load-balancer-arns ${ALB_ARN} \
      --region ${AWS_REGION}
  
  ALB_DNS=$(aws elbv2 describe-load-balancers \
      --load-balancer-arns ${ALB_ARN} \
      --region ${AWS_REGION} \
      --query 'LoadBalancers[0].DNSName' \
      --output text)
  
  echo "✅ ALB is active"
fi

echo "   ARN: ${ALB_ARN}"
echo "   DNS: ${ALB_DNS}"
echo ""

# ============================================================================
# STEP 3: Create HTTP Listener
# ============================================================================
echo "📋 Step 3: Create HTTP Listener..."

# Check if listener exists
EXISTING_LISTENER=$(aws elbv2 describe-listeners \
    --load-balancer-arn ${ALB_ARN} \
    --region ${AWS_REGION} \
    --query "Listeners[?Port==\`80\`].ListenerArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_LISTENER" ]; then
  echo "⚠️  HTTP Listener already exists"
  LISTENER_ARN=$EXISTING_LISTENER
else
  LISTENER_ARN=$(aws elbv2 create-listener \
      --load-balancer-arn ${ALB_ARN} \
      --protocol HTTP \
      --port 80 \
      --default-actions Type=forward,TargetGroupArn=${TARGET_GROUP_ARN} \
      --region ${AWS_REGION} \
      --tags Key=Name,Value=${ALB_NAME}-listener Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
      --query 'Listeners[0].ListenerArn' \
      --output text)
  
  echo "✅ HTTP Listener created (Port 80)"
fi

echo "   ARN: ${LISTENER_ARN}"
echo ""

# ============================================================================
# STEP 4: Check and Handle Existing ECS Service
# ============================================================================
echo "📋 Step 4: Check existing ECS Service..."

# Check if service exists
SERVICE_STATUS=$(aws ecs describe-services \
    --cluster ${ECS_CLUSTER} \
    --services ${ECS_SERVICE} \
    --region ${AWS_REGION} \
    --query 'services[0].status' \
    --output text 2>/dev/null || echo "NONE")

if [ "$SERVICE_STATUS" = "ACTIVE" ]; then
  # Check if service already has load balancer
  CURRENT_LB=$(aws ecs describe-services \
      --cluster ${ECS_CLUSTER} \
      --services ${ECS_SERVICE} \
      --region ${AWS_REGION} \
      --query 'services[0].loadBalancers[0].targetGroupArn' \
      --output text 2>/dev/null || echo "None")
  
  if [ "$CURRENT_LB" != "None" ] && [ -n "$CURRENT_LB" ]; then
    if [ "$CURRENT_LB" = "$TARGET_GROUP_ARN" ]; then
      echo "✅ Service already has correct load balancer attached"
      echo "   Skipping service recreation"
      SKIP_SERVICE_CREATION=true
    else
      echo "⚠️  Service has different load balancer attached"
      echo "   Current: $CURRENT_LB"
      echo "   Expected: $TARGET_GROUP_ARN"
      echo "   Will recreate service..."
      SKIP_SERVICE_CREATION=false
    fi
  else
    echo "⚠️  Service exists but has no load balancer"
    echo "   Will recreate service with load balancer..."
    SKIP_SERVICE_CREATION=false
  fi
  
  if [ "$SKIP_SERVICE_CREATION" != "true" ]; then
    echo "⚠️  Deleting existing service: ${ECS_SERVICE}"
    
    # Scale down to 0
    aws ecs update-service \
        --cluster ${ECS_CLUSTER} \
        --service ${ECS_SERVICE} \
        --desired-count 0 \
        --region ${AWS_REGION} \
        > /dev/null
    
    echo "   Scaled down to 0 tasks"
    
    # Delete service
    aws ecs delete-service \
        --cluster ${ECS_CLUSTER} \
        --service ${ECS_SERVICE} \
        --region ${AWS_REGION} \
        > /dev/null
    
    echo "   Service deletion initiated"
    echo "⏳ Waiting for service to be fully deleted..."
    
    # Wait until service is completely gone
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
      SERVICE_CHECK=$(aws ecs describe-services \
          --cluster ${ECS_CLUSTER} \
          --services ${ECS_SERVICE} \
          --region ${AWS_REGION} \
          --query 'services[0].status' \
          --output text 2>/dev/null || echo "NONE")
      
      if [ "$SERVICE_CHECK" = "NONE" ] || [ "$SERVICE_CHECK" = "INACTIVE" ]; then
        echo "✅ Service fully deleted"
        break
      fi
      
      echo "   Status: $SERVICE_CHECK (waiting...)"
      sleep 5
      WAIT_COUNT=$((WAIT_COUNT + 1))
    done
    
    if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
      echo "⚠️  Service deletion timeout. Waiting additional 30 seconds..."
      sleep 30
    fi
  fi
elif [ "$SERVICE_STATUS" = "NONE" ]; then
  echo "⚠️  Service does not exist (will create new)"
  SKIP_SERVICE_CREATION=false
else
  echo "⚠️  Service status: ${SERVICE_STATUS}"
  echo "⏳ Waiting for service to stabilize (30 seconds)..."
  sleep 30
  SKIP_SERVICE_CREATION=false
fi

echo ""

# ============================================================================
# STEP 5: Create ECS Service with Load Balancer
# ============================================================================
echo "📋 Step 5: Create ECS Service with Load Balancer..."

if [ "$SKIP_SERVICE_CREATION" = "true" ]; then
  echo "⚠️  Service already exists with correct load balancer"
  echo "   Skipping service creation"
else
  DESIRED_COUNT=2
  SUBNETS="${PRIVATE_APP_SUBNET_1},${PRIVATE_APP_SUBNET_2}"

  aws ecs create-service \
      --cluster ${ECS_CLUSTER} \
      --service-name ${ECS_SERVICE} \
      --task-definition ${ECS_TASK_FAMILY} \
      --desired-count ${DESIRED_COUNT} \
      --launch-type FARGATE \
      --platform-version LATEST \
      --network-configuration "awsvpcConfiguration={
        subnets=[${SUBNETS}],
        securityGroups=[${SG_ECS}],
        assignPublicIp=DISABLED
      }" \
      --load-balancers "targetGroupArn=${TARGET_GROUP_ARN},containerName=xrestaurant-backend,containerPort=${CONTAINER_PORT}" \
      --health-check-grace-period-seconds 60 \
      --enable-execute-command \
      --tags key=Name,value=${ECS_SERVICE} key=OWNER,value=${OWNER} key=PROJECT,value=${PROJECT} \
      --region ${AWS_REGION} \
      > /dev/null

  echo "✅ ECS Service created with Load Balancer"
fi

echo ""

# ============================================================================
# STEP 6: Wait for Service Stability
# ============================================================================
echo "📋 Step 6: Wait for Service Stability..."
echo "⏳ This may take 2-3 minutes..."

aws ecs wait services-stable \
  --cluster ${ECS_CLUSTER} \
  --services ${ECS_SERVICE} \
  --region ${AWS_REGION}

echo "✅ Service is stable"
echo ""

# ============================================================================
# STEP 7: Check Target Health
# ============================================================================
echo "📋 Step 7: Check Target Health..."

HEALTHY_COUNT=0
MAX_ATTEMPTS=24
ATTEMPT=0

while [ $HEALTHY_COUNT -lt 1 ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  
  HEALTHY_COUNT=$(aws elbv2 describe-target-health \
      --target-group-arn ${TARGET_GROUP_ARN} \
      --region ${AWS_REGION} \
      --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" \
      --output text 2>/dev/null || echo "0")
  
  TOTAL_COUNT=$(aws elbv2 describe-target-health \
      --target-group-arn ${TARGET_GROUP_ARN} \
      --region ${AWS_REGION} \
      --query "length(TargetHealthDescriptions)" \
      --output text 2>/dev/null || echo "0")
  
  echo "   Attempt $ATTEMPT/$MAX_ATTEMPTS: $HEALTHY_COUNT/$TOTAL_COUNT targets healthy"
  
  if [ $HEALTHY_COUNT -lt 1 ]; then
    sleep 5
  fi
done

if [ $HEALTHY_COUNT -ge 1 ]; then
  echo "✅ Targets are healthy!"
else
  echo "⚠️  Targets not healthy yet. Check security groups and logs."
fi

echo ""

# ============================================================================
# STEP 8: Test ALB Endpoint
# ============================================================================
echo "📋 Step 8: Test ALB Endpoint..."

echo "⏳ Waiting 10 seconds for DNS propagation..."
sleep 10

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${ALB_DNS}/health 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" == "200" ]; then
  echo "✅ ALB is responding! Health check passed"
  echo "   URL: http://${ALB_DNS}/health"
else
  echo "⚠️  ALB returned status: ${HTTP_STATUS}"
  echo "   Try: curl http://${ALB_DNS}/health"
fi

echo ""

# ============================================================================
# STEP 9: Save Configuration
# ============================================================================
echo "📋 Step 9: Save Configuration..."

cat >> vpc-config.sh <<EOF

# ALB Configuration
# Generated: $(date)

export ALB_NAME="${ALB_NAME}"
export ALB_ARN="${ALB_ARN}"
export ALB_DNS="${ALB_DNS}"
export TARGET_GROUP_NAME="${TARGET_GROUP_NAME}"
export TARGET_GROUP_ARN="${TARGET_GROUP_ARN}"
export LISTENER_ARN="${LISTENER_ARN}"
export BACKEND_URL="http://${ALB_DNS}"
EOF

echo "✅ Configuration saved to vpc-config.sh"

echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ ALB SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   ALB: ${ALB_NAME}"
echo "   DNS: ${ALB_DNS}"
echo "   Target Group: ${TARGET_GROUP_NAME}"
echo "   Healthy Targets: ${HEALTHY_COUNT}/${TOTAL_COUNT}"
echo ""
echo "🏷️  Tags:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "🔗 Endpoints:"
echo "   Health: http://${ALB_DNS}/health"
echo "   API: http://${ALB_DNS}/api"
echo ""
echo "📝 Test commands:"
echo "   curl http://${ALB_DNS}/health"
echo "   curl -H 'x-username: user1' -H 'x-password: pass1' http://${ALB_DNS}/api/products"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./08-deploy-frontend-s3.sh"
echo ""
echo "=========================================="
