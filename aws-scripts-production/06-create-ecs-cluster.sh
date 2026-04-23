#!/bin/bash

# ============================================================================
# File: 06-create-ecs-cluster.sh
# Description: Create ECS Cluster, Task Definition, and Service
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🚀 Create ECS Cluster & Service"
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

CLUSTER_NAME="xrestaurant-cluster"
SERVICE_NAME="xrestaurant-backend-service"
TASK_FAMILY="xrestaurant-backend-task"
CONTAINER_NAME="xrestaurant-backend"
CONTAINER_PORT=3000
DESIRED_COUNT=2

# Subnets for ECS tasks
SUBNETS="${PRIVATE_APP_SUBNET_1},${PRIVATE_APP_SUBNET_2}"

# ============================================================================
# STEP 1: Verify ECR Image
# ============================================================================
echo "📋 Step 1: Verify ECR Image..."

if aws ecr describe-images \
    --repository-name ${ECR_REPOSITORY_NAME} \
    --image-ids imageTag=${ECR_IMAGE_TAG} \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECR image found: ${ECR_REPOSITORY_URI}:${ECR_IMAGE_TAG}"
else
  echo "❌ Error: ECR image not found!"
  echo "   Please run: bash ./05-create-ecr-push-image.sh"
  exit 1
fi

echo ""

# ============================================================================
# STEP 2: Create ECS Cluster
# ============================================================================
echo "📋 Step 2: Create ECS Cluster..."

# Check if cluster exists and is ACTIVE
CLUSTER_STATUS=$(aws ecs describe-clusters \
    --clusters ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --query 'clusters[0].status' \
    --output text 2>/dev/null || echo "NONE")

if [ "$CLUSTER_STATUS" = "ACTIVE" ]; then
  echo "⚠️  Cluster already exists: ${CLUSTER_NAME}"
elif [ "$CLUSTER_STATUS" = "INACTIVE" ]; then
  echo "⚠️  Cluster exists but INACTIVE (being deleted)"
  echo "   Waiting for deletion to complete (30 seconds)..."
  sleep 30
  
  # Create new cluster
  aws ecs create-cluster \
    --cluster-name ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --tags key=Name,value=${CLUSTER_NAME} key=OWNER,value=${OWNER} key=PROJECT,value=${PROJECT} \
    --capacity-providers FARGATE \
    --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
    > /dev/null

  echo "✅ ECS Cluster created: ${CLUSTER_NAME}"
else
  # Cluster doesn't exist, create it
  aws ecs create-cluster \
    --cluster-name ${CLUSTER_NAME} \
    --region ${AWS_REGION} \
    --tags key=Name,value=${CLUSTER_NAME} key=OWNER,value=${OWNER} key=PROJECT,value=${PROJECT} \
    --capacity-providers FARGATE \
    --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
    > /dev/null

  echo "✅ ECS Cluster created: ${CLUSTER_NAME}"
fi

echo ""

# ============================================================================
# STEP 3: Create IAM Roles
# ============================================================================
echo "📋 Step 3: Create IAM Roles..."

EXECUTION_ROLE_NAME="xrestaurant-ecs-execution-role"
TASK_ROLE_NAME="xrestaurant-ecs-task-role"

# Trust policy for ECS tasks
cat > /tmp/ecs-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create Execution Role
if aws iam get-role --role-name ${EXECUTION_ROLE_NAME} &>/dev/null; then
  echo "⚠️  Execution role already exists"
  EXECUTION_ROLE_ARN=$(aws iam get-role --role-name ${EXECUTION_ROLE_NAME} --query 'Role.Arn' --output text)
else
  EXECUTION_ROLE_ARN=$(aws iam create-role \
    --role-name ${EXECUTION_ROLE_NAME} \
    --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
    --tags Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
    --query 'Role.Arn' \
    --output text)

  aws iam attach-role-policy \
    --role-name ${EXECUTION_ROLE_NAME} \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

  echo "✅ Execution role created"
fi

# Create Task Role with S3 access
if aws iam get-role --role-name ${TASK_ROLE_NAME} &>/dev/null; then
  echo "⚠️  Task role already exists"
  TASK_ROLE_ARN=$(aws iam get-role --role-name ${TASK_ROLE_NAME} --query 'Role.Arn' --output text)
else
  TASK_ROLE_ARN=$(aws iam create-role \
    --role-name ${TASK_ROLE_NAME} \
    --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
    --tags Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
    --query 'Role.Arn' \
    --output text)

  # Task policy for S3 access
  cat > /tmp/ecs-task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${MEDIA_BUCKET}/*",
        "arn:aws:s3:::${MEDIA_BUCKET}",
        "arn:aws:s3:::${DOCUMENTS_BUCKET}/*",
        "arn:aws:s3:::${DOCUMENTS_BUCKET}"
      ]
    }
  ]
}
EOF

  aws iam put-role-policy \
    --role-name ${TASK_ROLE_NAME} \
    --policy-name xrestaurant-s3-access \
    --policy-document file:///tmp/ecs-task-policy.json

  echo "✅ Task role created with S3 access"
fi

echo "   Execution Role: ${EXECUTION_ROLE_ARN}"
echo "   Task Role: ${TASK_ROLE_ARN}"

# Wait for IAM propagation
echo "⏳ Waiting for IAM roles to propagate (10 seconds)..."
sleep 10

echo ""

# ============================================================================
# STEP 4: Create CloudWatch Log Group
# ============================================================================
echo "📋 Step 4: Create CloudWatch Log Group..."

LOG_GROUP="/ecs/xrestaurant-backend"

if aws logs describe-log-groups \
    --log-group-name-prefix ${LOG_GROUP} \
    --region ${AWS_REGION} \
    --query "logGroups[?logGroupName=='${LOG_GROUP}']" \
    --output text | grep -q "${LOG_GROUP}"; then
  echo "⚠️  Log group already exists"
else
  aws logs create-log-group \
    --log-group-name ${LOG_GROUP} \
    --region ${AWS_REGION}

  aws logs put-retention-policy \
    --log-group-name ${LOG_GROUP} \
    --retention-in-days 7 \
    --region ${AWS_REGION}

  echo "✅ Log group created: ${LOG_GROUP}"
fi

echo ""

# ============================================================================
# STEP 5: Register Task Definition
# ============================================================================
echo "📋 Step 5: Register Task Definition..."

cat > /tmp/task-definition.json <<EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${CONTAINER_NAME}",
      "image": "${ECR_REPOSITORY_URI}:${ECR_IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": ${CONTAINER_PORT},
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
          "value": "${CONTAINER_PORT}"
        },
        {
          "name": "AWS_REGION",
          "value": "${AWS_REGION}"
        },
        {
          "name": "MEDIA_BUCKET",
          "value": "${MEDIA_BUCKET}"
        },
        {
          "name": "DOCUMENTS_BUCKET",
          "value": "${DOCUMENTS_BUCKET}"
        },
        {
          "name": "FRONTEND_URL",
          "value": "${FRONTEND_URL}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${CONTAINER_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-definition.json \
  --region ${AWS_REGION} \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "✅ Task definition registered"
echo "   ARN: ${TASK_DEF_ARN}"

echo ""

# ============================================================================
# STEP 6: Create/Update ECS Service
# ============================================================================
echo "📋 Step 6: Create ECS Service..."

# Check if service exists and is ACTIVE
SERVICE_STATUS=$(aws ecs describe-services \
    --cluster ${CLUSTER_NAME} \
    --services ${SERVICE_NAME} \
    --region ${AWS_REGION} \
    --query 'services[0].status' \
    --output text 2>/dev/null || echo "NONE")

if [ "$SERVICE_STATUS" = "ACTIVE" ]; then
  echo "⚠️  Service already exists, updating..."
  
  aws ecs update-service \
    --cluster ${CLUSTER_NAME} \
    --service ${SERVICE_NAME} \
    --task-definition ${TASK_FAMILY} \
    --region ${AWS_REGION} \
    > /dev/null
  
  echo "✅ Service updated"
elif [ "$SERVICE_STATUS" = "INACTIVE" ] || [ "$SERVICE_STATUS" = "DRAINING" ]; then
  echo "⚠️  Service exists but ${SERVICE_STATUS} (being deleted)"
  echo "   Waiting for deletion to complete (30 seconds)..."
  sleep 30
  
  # Create new service
  aws ecs create-service \
    --cluster ${CLUSTER_NAME} \
    --service-name ${SERVICE_NAME} \
    --task-definition ${TASK_FAMILY} \
    --desired-count ${DESIRED_COUNT} \
    --launch-type FARGATE \
    --platform-version LATEST \
    --network-configuration "awsvpcConfiguration={
      subnets=[${SUBNETS}],
      securityGroups=[${SG_ECS}],
      assignPublicIp=DISABLED
    }" \
    --enable-execute-command \
    --tags key=Name,value=${SERVICE_NAME} key=OWNER,value=${OWNER} key=PROJECT,value=${PROJECT} \
    --region ${AWS_REGION} \
    > /dev/null

  echo "✅ ECS Service created: ${SERVICE_NAME}"
else
  # Service doesn't exist, create it
  aws ecs create-service \
    --cluster ${CLUSTER_NAME} \
    --service-name ${SERVICE_NAME} \
    --task-definition ${TASK_FAMILY} \
    --desired-count ${DESIRED_COUNT} \
    --launch-type FARGATE \
    --platform-version LATEST \
    --network-configuration "awsvpcConfiguration={
      subnets=[${SUBNETS}],
      securityGroups=[${SG_ECS}],
      assignPublicIp=DISABLED
    }" \
    --enable-execute-command \
    --tags key=Name,value=${SERVICE_NAME} key=OWNER,value=${OWNER} key=PROJECT,value=${PROJECT} \
    --region ${AWS_REGION} \
    > /dev/null

  echo "✅ ECS Service created: ${SERVICE_NAME}"
fi

echo ""

# ============================================================================
# STEP 7: Wait for Service Stability
# ============================================================================
echo "📋 Step 7: Wait for Service Stability..."
echo "⏳ This may take 2-3 minutes..."

aws ecs wait services-stable \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --region ${AWS_REGION}

echo "✅ Service is stable"

echo ""

# ============================================================================
# STEP 8: Get Service Status
# ============================================================================
echo "📋 Step 8: Get Service Status..."

RUNNING_COUNT=$(aws ecs describe-services \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --region ${AWS_REGION} \
  --query 'services[0].runningCount' \
  --output text)

echo "✅ Running tasks: ${RUNNING_COUNT}/${DESIRED_COUNT}"

echo ""

# ============================================================================
# STEP 9: Save Configuration
# ============================================================================
echo "📋 Step 9: Save Configuration..."

cat >> vpc-config.sh <<EOF

# ECS Configuration
# Generated: $(date)

export ECS_CLUSTER="${CLUSTER_NAME}"
export ECS_SERVICE="${SERVICE_NAME}"
export ECS_TASK_FAMILY="${TASK_FAMILY}"
export ECS_EXECUTION_ROLE_ARN="${EXECUTION_ROLE_ARN}"
export ECS_TASK_ROLE_ARN="${TASK_ROLE_ARN}"
export ECS_LOG_GROUP="${LOG_GROUP}"
EOF

echo "✅ Configuration saved to vpc-config.sh"

echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ ECS CLUSTER & SERVICE COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   Cluster: ${CLUSTER_NAME}"
echo "   Service: ${SERVICE_NAME}"
echo "   Running: ${RUNNING_COUNT}/${DESIRED_COUNT} tasks"
echo "   CPU: 512 (0.5 vCPU per task)"
echo "   Memory: 1024 MB (1 GB per task)"
echo "   Port: ${CONTAINER_PORT}"
echo ""
echo "🏷️  Tags:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "📝 View logs:"
echo "   aws logs tail ${LOG_GROUP} --follow --region ${AWS_REGION}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./07-create-alb.sh"
echo ""
echo "=========================================="
