#!/bin/bash

# ============================================================================
# File: 20-update-ecs-postgres.sh
# Description: Update ECS Task Definition and IAM Roles for PostgreSQL
# Author: Kiro AI Assistant
# Date: 2026-04-19
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🐘 Update ECS for PostgreSQL Migration"
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
echo "  - Account: $(aws sts get-caller-identity --query Account --output text)"
echo "  - Cluster: ${ECS_CLUSTER:-xrestaurant-cluster}"
echo "  - Service: ${ECS_SERVICE:-xrestaurant-backend-service}"
echo ""

CLUSTER_NAME="${ECS_CLUSTER:-xrestaurant-cluster}"
SERVICE_NAME="${ECS_SERVICE:-xrestaurant-backend-service}"
TASK_FAMILY="xrestaurant-backend-postgres"
EXECUTION_ROLE_NAME="xrestaurant-ecs-execution-role"
TASK_ROLE_NAME="xrestaurant-ecs-task-role"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ============================================================================
# STEP 1: Update IAM Task Role for Secrets Manager Access
# ============================================================================
echo "📋 Step 1: Update IAM Task Role..."

# Check if role exists
if ! aws iam get-role --role-name ${TASK_ROLE_NAME} &>/dev/null; then
  echo "❌ Error: Task role ${TASK_ROLE_NAME} not found!"
  echo "   Please run: bash ./06-create-ecs-cluster.sh first"
  exit 1
fi

# Add Secrets Manager policy
cat > /tmp/secrets-manager-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:xrestaurant/rds/credentials-*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name ${TASK_ROLE_NAME} \
  --policy-name xrestaurant-secrets-manager-access \
  --policy-document file:///tmp/secrets-manager-policy.json

echo "✅ Added Secrets Manager permissions to task role"

# Add CloudWatch Logs policy for Winston
cat > /tmp/cloudwatch-logs-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": [
        "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/ecs/xrestaurant-backend:*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name ${TASK_ROLE_NAME} \
  --policy-name xrestaurant-cloudwatch-logs-access \
  --policy-document file:///tmp/cloudwatch-logs-policy.json

echo "✅ Added CloudWatch Logs permissions to task role"

# Wait for IAM propagation
echo "⏳ Waiting for IAM changes to propagate (10 seconds)..."
sleep 10

echo ""

# ============================================================================
# STEP 2: Verify ECR Image
# ============================================================================
echo "📋 Step 2: Verify PostgreSQL ECR Image..."

ECR_IMAGE_TAG="${1:-postgres-v1}"
ECR_REPOSITORY_NAME="${ECR_REPOSITORY_NAME:-xrestaurant-backend}"

if aws ecr describe-images \
    --repository-name ${ECR_REPOSITORY_NAME} \
    --image-ids imageTag=${ECR_IMAGE_TAG} \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECR image found: ${ECR_REPOSITORY_NAME}:${ECR_IMAGE_TAG}"
else
  echo "❌ Error: ECR image not found!"
  echo "   Please build and push the image first:"
  echo "   cd ../server && ./docker-build.sh ${ECR_IMAGE_TAG}"
  exit 1
fi

ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}:${ECR_IMAGE_TAG}"

echo ""

# ============================================================================
# STEP 3: Prepare Task Definition
# ============================================================================
echo "📋 Step 3: Prepare Task Definition..."

EXECUTION_ROLE_ARN=$(aws iam get-role --role-name ${EXECUTION_ROLE_NAME} --query 'Role.Arn' --output text)
TASK_ROLE_ARN=$(aws iam get-role --role-name ${TASK_ROLE_NAME} --query 'Role.Arn' --output text)

# Replace placeholders in task definition
sed -e "s|ACCOUNT_ID|${AWS_ACCOUNT_ID}|g" \
    -e "s|postgres-v1|${ECR_IMAGE_TAG}|g" \
    task-definition-postgres.json > /tmp/task-definition-postgres.json

echo "✅ Task definition prepared"
echo "   Image: ${ECR_IMAGE_URI}"
echo "   Execution Role: ${EXECUTION_ROLE_ARN}"
echo "   Task Role: ${TASK_ROLE_ARN}"

echo ""

# ============================================================================
# STEP 4: Register Task Definition
# ============================================================================
echo "📋 Step 4: Register Task Definition..."

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-definition-postgres.json \
  --region ${AWS_REGION} \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

TASK_DEF_REVISION=$(echo ${TASK_DEF_ARN} | awk -F: '{print $NF}')

echo "✅ Task definition registered"
echo "   ARN: ${TASK_DEF_ARN}"
echo "   Revision: ${TASK_DEF_REVISION}"

echo ""

# ============================================================================
# STEP 5: Update ECS Service
# ============================================================================
echo "📋 Step 5: Update ECS Service..."

# Check if service exists
if ! aws ecs describe-services \
    --cluster ${CLUSTER_NAME} \
    --services ${SERVICE_NAME} \
    --region ${AWS_REGION} \
    --query 'services[0].status' \
    --output text | grep -q "ACTIVE"; then
  echo "❌ Error: Service ${SERVICE_NAME} not found or not active!"
  echo "   Please run: bash ./06-create-ecs-cluster.sh first"
  exit 1
fi

# Update service with new task definition
aws ecs update-service \
  --cluster ${CLUSTER_NAME} \
  --service ${SERVICE_NAME} \
  --task-definition ${TASK_FAMILY}:${TASK_DEF_REVISION} \
  --force-new-deployment \
  --region ${AWS_REGION} \
  > /dev/null

echo "✅ Service updated with new task definition"
echo "   Cluster: ${CLUSTER_NAME}"
echo "   Service: ${SERVICE_NAME}"
echo "   Task Definition: ${TASK_FAMILY}:${TASK_DEF_REVISION}"

echo ""

# ============================================================================
# STEP 6: Monitor Deployment
# ============================================================================
echo "📋 Step 6: Monitor Deployment..."
echo "⏳ Waiting for service to stabilize (this may take 3-5 minutes)..."
echo ""

# Show deployment progress
echo "Deployment events:"
aws ecs describe-services \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --region ${AWS_REGION} \
  --query 'services[0].events[0:5].[createdAt,message]' \
  --output table

echo ""
echo "⏳ Waiting for service stability..."

# Wait for service to stabilize
if aws ecs wait services-stable \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --region ${AWS_REGION}; then
  echo "✅ Service is stable"
else
  echo "⚠️  Service stabilization timed out"
  echo "   Check service status manually:"
  echo "   aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME}"
fi

echo ""

# ============================================================================
# STEP 7: Verify Deployment
# ============================================================================
echo "📋 Step 7: Verify Deployment..."

# Get service status
SERVICE_INFO=$(aws ecs describe-services \
  --cluster ${CLUSTER_NAME} \
  --services ${SERVICE_NAME} \
  --region ${AWS_REGION} \
  --query 'services[0]')

RUNNING_COUNT=$(echo ${SERVICE_INFO} | jq -r '.runningCount')
DESIRED_COUNT=$(echo ${SERVICE_INFO} | jq -r '.desiredCount')
DEPLOYMENT_COUNT=$(echo ${SERVICE_INFO} | jq -r '.deployments | length')

echo "Service Status:"
echo "  - Running tasks: ${RUNNING_COUNT}/${DESIRED_COUNT}"
echo "  - Active deployments: ${DEPLOYMENT_COUNT}"

# Get task IDs
TASK_ARNS=$(aws ecs list-tasks \
  --cluster ${CLUSTER_NAME} \
  --service-name ${SERVICE_NAME} \
  --region ${AWS_REGION} \
  --query 'taskArns' \
  --output text)

if [ -n "$TASK_ARNS" ]; then
  echo ""
  echo "Running Tasks:"
  for TASK_ARN in $TASK_ARNS; do
    TASK_ID=$(echo $TASK_ARN | awk -F/ '{print $NF}')
    TASK_STATUS=$(aws ecs describe-tasks \
      --cluster ${CLUSTER_NAME} \
      --tasks ${TASK_ARN} \
      --region ${AWS_REGION} \
      --query 'tasks[0].lastStatus' \
      --output text)
    echo "  - ${TASK_ID}: ${TASK_STATUS}"
  done
fi

echo ""

# ============================================================================
# STEP 8: Test Health Endpoint
# ============================================================================
echo "📋 Step 8: Test Health Endpoint..."

# Get ALB DNS (if available)
if [ -n "${ALB_DNS}" ]; then
  echo "Testing health endpoint: http://${ALB_DNS}/health"
  
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://${ALB_DNS}/health || echo "000")
  
  if [ "$HEALTH_STATUS" = "200" ]; then
    echo "✅ Health check passed (HTTP 200)"
    
    # Show health response
    echo ""
    echo "Health Response:"
    curl -s http://${ALB_DNS}/health | jq '.'
  else
    echo "⚠️  Health check returned HTTP ${HEALTH_STATUS}"
    echo "   The service may still be starting up"
    echo "   Check logs: aws logs tail /aws/ecs/xrestaurant-backend --follow"
  fi
else
  echo "⚠️  ALB DNS not found in vpc-config.sh"
  echo "   Run: bash ./07-create-alb.sh to create ALB"
  echo "   Or test health endpoint manually after ALB is created"
fi

echo ""

# ============================================================================
# STEP 9: Show Logs Command
# ============================================================================
echo "📋 Step 9: Monitoring Commands..."

echo "View logs:"
echo "  aws logs tail /aws/ecs/xrestaurant-backend --follow --region ${AWS_REGION}"
echo ""
echo "View service status:"
echo "  aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION}"
echo ""
echo "View tasks:"
echo "  aws ecs list-tasks --cluster ${CLUSTER_NAME} --service-name ${SERVICE_NAME} --region ${AWS_REGION}"
echo ""
echo "Execute command in container:"
echo "  aws ecs execute-command --cluster ${CLUSTER_NAME} --task TASK_ID --container xrestaurant-backend --interactive --command \"/bin/sh\""
echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ ECS UPDATE COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   Task Definition: ${TASK_FAMILY}:${TASK_DEF_REVISION}"
echo "   Image: ${ECR_IMAGE_URI}"
echo "   Running: ${RUNNING_COUNT}/${DESIRED_COUNT} tasks"
echo "   Database: PostgreSQL (RDS)"
echo "   Secrets: AWS Secrets Manager"
echo ""
echo "🔐 IAM Permissions Added:"
echo "   - Secrets Manager (read credentials)"
echo "   - CloudWatch Logs (write logs)"
echo "   - S3 (existing)"
echo ""
echo "📝 Next Steps:"
echo "   1. Monitor logs for database connection"
echo "   2. Verify health endpoint returns 200"
echo "   3. Test API endpoints"
echo "   4. Run integration tests"
echo ""
echo "=========================================="
