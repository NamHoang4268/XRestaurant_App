#!/bin/bash

# ============================================================================
# File: 21-1-verify-infrastructure.sh
# Description: Verify infrastructure is ready for PostgreSQL migration
# Author: Kiro AI Assistant
# Date: 2026-04-19
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🔍 Verify Infrastructure for PostgreSQL"
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

echo ""

# Track verification status
ERRORS=0
WARNINGS=0

# ============================================================================
# STEP 1: Verify RDS Instance
# ============================================================================
echo "📋 Step 1: Verify RDS Instance..."

RDS_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier xrestaurant-db \
  --region ${AWS_REGION} \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$RDS_STATUS" = "available" ]; then
  echo "✅ RDS instance is available"
  
  # Get RDS details
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier xrestaurant-db \
    --region ${AWS_REGION} \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)
  
  RDS_PORT=$(aws rds describe-db-instances \
    --db-instance-identifier xrestaurant-db \
    --region ${AWS_REGION} \
    --query 'DBInstances[0].Endpoint.Port' \
    --output text)
  
  echo "   Endpoint: ${RDS_ENDPOINT}:${RDS_PORT}"
elif [ "$RDS_STATUS" = "NOT_FOUND" ]; then
  echo "❌ RDS instance not found!"
  echo "   Run: bash ./03-create-rds.sh"
  ERRORS=$((ERRORS + 1))
else
  echo "⚠️  RDS instance status: ${RDS_STATUS}"
  echo "   Wait for status to be 'available'"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================================================
# STEP 2: Verify Secrets Manager
# ============================================================================
echo "📋 Step 2: Verify Secrets Manager..."

if aws secretsmanager describe-secret \
    --secret-id xrestaurant/rds/credentials \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ Secrets Manager secret exists"
  
  # Verify secret has required fields
  SECRET_VALUE=$(aws secretsmanager get-secret-value \
    --secret-id xrestaurant/rds/credentials \
    --region ${AWS_REGION} \
    --query 'SecretString' \
    --output text)
  
  if echo "$SECRET_VALUE" | jq -e '.host and .username and .password and .dbname' &>/dev/null; then
    echo "   ✅ Secret has all required fields"
  else
    echo "   ⚠️  Secret missing required fields"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "❌ Secrets Manager secret not found!"
  echo "   Secret should be created by RDS script"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 3: Verify Security Groups
# ============================================================================
echo "📋 Step 3: Verify Security Groups..."

# Check RDS security group
if aws ec2 describe-security-groups \
    --group-ids ${SG_RDS} \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ RDS security group exists: ${SG_RDS}"
  
  # Check if ECS can access RDS
  INGRESS_RULE=$(aws ec2 describe-security-groups \
    --group-ids ${SG_RDS} \
    --region ${AWS_REGION} \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`].UserIdGroupPairs[?GroupId==\`${SG_ECS}\`]" \
    --output text)
  
  if [ -n "$INGRESS_RULE" ]; then
    echo "   ✅ ECS can access RDS (port 5432)"
  else
    echo "   ⚠️  ECS cannot access RDS"
    echo "   Add ingress rule: ECS SG -> RDS SG port 5432"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "❌ RDS security group not found!"
  ERRORS=$((ERRORS + 1))
fi

# Check ECS security group
if aws ec2 describe-security-groups \
    --group-ids ${SG_ECS} \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECS security group exists: ${SG_ECS}"
else
  echo "❌ ECS security group not found!"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 4: Verify VPC and Subnets
# ============================================================================
echo "📋 Step 4: Verify VPC and Subnets..."

# Check VPC
if aws ec2 describe-vpcs \
    --vpc-ids ${VPC_ID} \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ VPC exists: ${VPC_ID}"
else
  echo "❌ VPC not found!"
  ERRORS=$((ERRORS + 1))
fi

# Check private subnets
for SUBNET in ${PRIVATE_APP_SUBNET_1} ${PRIVATE_APP_SUBNET_2}; do
  if aws ec2 describe-subnets \
      --subnet-ids ${SUBNET} \
      --region ${AWS_REGION} &>/dev/null; then
    echo "✅ Private subnet exists: ${SUBNET}"
  else
    echo "❌ Private subnet not found: ${SUBNET}"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# ============================================================================
# STEP 5: Verify ECR Repository
# ============================================================================
echo "📋 Step 5: Verify ECR Repository..."

if aws ecr describe-repositories \
    --repository-names xrestaurant-backend \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECR repository exists"
  
  # Check if PostgreSQL image exists
  if aws ecr describe-images \
      --repository-name xrestaurant-backend \
      --image-ids imageTag=postgres-v1 \
      --region ${AWS_REGION} &>/dev/null; then
    echo "   ✅ PostgreSQL image exists (postgres-v1)"
  else
    echo "   ⚠️  PostgreSQL image not found"
    echo "   Build and push: cd ../server && ./docker-build.sh postgres-v1"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "❌ ECR repository not found!"
  echo "   Run: bash ./05-create-ecr-push-image.sh"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 6: Verify ECS Cluster
# ============================================================================
echo "📋 Step 6: Verify ECS Cluster..."

CLUSTER_STATUS=$(aws ecs describe-clusters \
  --clusters xrestaurant-cluster \
  --region ${AWS_REGION} \
  --query 'clusters[0].status' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$CLUSTER_STATUS" = "ACTIVE" ]; then
  echo "✅ ECS cluster is active"
  
  # Check service
  SERVICE_STATUS=$(aws ecs describe-services \
    --cluster xrestaurant-cluster \
    --services xrestaurant-backend-service \
    --region ${AWS_REGION} \
    --query 'services[0].status' \
    --output text 2>/dev/null || echo "NOT_FOUND")
  
  if [ "$SERVICE_STATUS" = "ACTIVE" ]; then
    echo "   ✅ ECS service is active"
  else
    echo "   ⚠️  ECS service not found or not active"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "❌ ECS cluster not found or not active!"
  echo "   Run: bash ./06-create-ecs-cluster.sh"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 7: Verify IAM Roles
# ============================================================================
echo "📋 Step 7: Verify IAM Roles..."

# Check execution role
if aws iam get-role \
    --role-name xrestaurant-ecs-execution-role \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECS execution role exists"
else
  echo "❌ ECS execution role not found!"
  ERRORS=$((ERRORS + 1))
fi

# Check task role
if aws iam get-role \
    --role-name xrestaurant-ecs-task-role \
    --region ${AWS_REGION} &>/dev/null; then
  echo "✅ ECS task role exists"
  
  # Check Secrets Manager policy
  if aws iam get-role-policy \
      --role-name xrestaurant-ecs-task-role \
      --policy-name xrestaurant-secrets-manager-access \
      --region ${AWS_REGION} &>/dev/null; then
    echo "   ✅ Secrets Manager policy attached"
  else
    echo "   ⚠️  Secrets Manager policy not attached"
    echo "   Run: bash ./20-update-ecs-postgres.sh"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "❌ ECS task role not found!"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 8: Verify CloudWatch Log Group
# ============================================================================
echo "📋 Step 8: Verify CloudWatch Log Group..."

if aws logs describe-log-groups \
    --log-group-name-prefix /aws/ecs/xrestaurant-backend \
    --region ${AWS_REGION} \
    --query "logGroups[?logGroupName=='/aws/ecs/xrestaurant-backend']" \
    --output text | grep -q "/aws/ecs/xrestaurant-backend"; then
  echo "✅ CloudWatch log group exists"
else
  echo "⚠️  CloudWatch log group not found"
  echo "   Will be created automatically"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================================================
# STEP 9: Network Connectivity Test (Optional)
# ============================================================================
echo "📋 Step 9: Network Connectivity Test..."

if [ "$RDS_STATUS" = "available" ] && [ "$CLUSTER_STATUS" = "ACTIVE" ]; then
  echo "⏳ Testing network connectivity from ECS to RDS..."
  echo "   (This requires a running ECS task)"
  
  # Get a running task
  TASK_ARN=$(aws ecs list-tasks \
    --cluster xrestaurant-cluster \
    --service-name xrestaurant-backend-service \
    --desired-status RUNNING \
    --region ${AWS_REGION} \
    --query 'taskArns[0]' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$TASK_ARN" ] && [ "$TASK_ARN" != "None" ]; then
    echo "   Found running task: ${TASK_ARN}"
    echo "   ⚠️  Manual test required:"
    echo "   aws ecs execute-command --cluster xrestaurant-cluster --task ${TASK_ARN} --container xrestaurant-backend --interactive --command \"nc -zv ${RDS_ENDPOINT} 5432\""
  else
    echo "   ⚠️  No running tasks found"
    echo "   Network test will be performed after deployment"
  fi
else
  echo "⚠️  Skipping network test (RDS or ECS not ready)"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "=========================================="
echo "📊 VERIFICATION SUMMARY"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "✅ All checks passed!"
  echo ""
  echo "Infrastructure is ready for PostgreSQL migration."
  echo ""
  echo "Next steps:"
  echo "  1. Run schema initialization: bash ./21-2-init-schema.sh"
  echo "  2. Run data migration: bash ./21-3-migrate-data.sh"
  echo "  3. Deploy application: bash ./21-4-deploy-app.sh"
  EXIT_CODE=0
elif [ $ERRORS -eq 0 ]; then
  echo "⚠️  ${WARNINGS} warning(s) found"
  echo ""
  echo "Infrastructure is mostly ready, but some warnings need attention."
  echo "Review warnings above and fix if necessary."
  echo ""
  echo "You can proceed with caution:"
  echo "  1. Run schema initialization: bash ./21-2-init-schema.sh"
  EXIT_CODE=0
else
  echo "❌ ${ERRORS} error(s) and ${WARNINGS} warning(s) found"
  echo ""
  echo "Infrastructure is NOT ready for PostgreSQL migration."
  echo "Fix errors above before proceeding."
  echo ""
  echo "Common fixes:"
  echo "  - RDS not found: bash ./03-create-rds.sh"
  echo "  - ECR not found: bash ./05-create-ecr-push-image.sh"
  echo "  - ECS not found: bash ./06-create-ecs-cluster.sh"
  echo "  - IAM policies: bash ./20-update-ecs-postgres.sh"
  EXIT_CODE=1
fi

echo ""
echo "=========================================="

exit $EXIT_CODE
