#!/bin/bash

# ============================================================================
# File: 02-create-security-groups.sh
# Description: Create Security Groups for ALB, ECS, RDS, Redis
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🔐 Create Security Groups"
echo "=========================================="
echo ""

# Load VPC configuration
if [ -f vpc-config.sh ]; then
  source vpc-config.sh
  echo "✅ Loaded VPC configuration"
else
  echo "❌ Error: vpc-config.sh not found!"
  echo "   Please run: bash ./01-create-vpc.sh first"
  exit 1
fi

# Validate required variables
if [ -z "$VPC_ID" ] || [ -z "$AWS_REGION" ] || [ -z "$OWNER" ] || [ -z "$PROJECT" ]; then
  echo "❌ Error: Missing required variables in vpc-config.sh"
  echo "   Required: VPC_ID, AWS_REGION, OWNER, PROJECT"
  exit 1
fi

echo "Configuration:"
echo "  - VPC ID: $VPC_ID"
echo "  - Region: $AWS_REGION"
echo "  - Owner: $OWNER"
echo "  - Project: $PROJECT"
echo ""

PROJECT_NAME="xrestaurant"

# ============================================================================
# STEP 1: Create SG-ALB (Application Load Balancer)
# ============================================================================
echo "📋 Step 1: Create SG-ALB..."

SG_ALB=$(aws ec2 create-security-group \
  --group-name ${PROJECT_NAME}-alb-sg \
  --description "Security group for Application Load Balancer" \
  --vpc-id $VPC_ID \
  --region $AWS_REGION \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-alb-sg},{Key=Type,Value=ALB},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
  --query 'GroupId' \
  --output text)

echo "✅ SG-ALB created: $SG_ALB"

# Allow HTTP from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region $AWS_REGION

echo "   ✅ Allow HTTP (80) from 0.0.0.0/0"

# Allow HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region $AWS_REGION

echo "   ✅ Allow HTTPS (443) from 0.0.0.0/0"
echo ""

# ============================================================================
# STEP 2: Create SG-ECS (Fargate Tasks)
# ============================================================================
echo "📋 Step 2: Create SG-ECS..."

SG_ECS=$(aws ec2 create-security-group \
  --group-name ${PROJECT_NAME}-ecs-sg \
  --description "Security group for ECS Fargate tasks" \
  --vpc-id $VPC_ID \
  --region $AWS_REGION \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-ecs-sg},{Key=Type,Value=ECS},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
  --query 'GroupId' \
  --output text)

echo "✅ SG-ECS created: $SG_ECS"

# Allow traffic from ALB on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ECS \
  --protocol tcp \
  --port 3000 \
  --source-group $SG_ALB \
  --region $AWS_REGION

echo "   ✅ Allow port 3000 from SG-ALB"
echo ""

# ============================================================================
# STEP 3: Create SG-RDS (Database)
# ============================================================================
echo "📋 Step 3: Create SG-RDS..."

SG_RDS=$(aws ec2 create-security-group \
  --group-name ${PROJECT_NAME}-rds-sg \
  --description "Security group for RDS database" \
  --vpc-id $VPC_ID \
  --region $AWS_REGION \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-rds-sg},{Key=Type,Value=RDS},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
  --query 'GroupId' \
  --output text)

echo "✅ SG-RDS created: $SG_RDS"

# Allow PostgreSQL (5432) from ECS only
aws ec2 authorize-security-group-ingress \
  --group-id $SG_RDS \
  --protocol tcp \
  --port 5432 \
  --source-group $SG_ECS \
  --region $AWS_REGION

echo "   ✅ Allow PostgreSQL (5432) from SG-ECS"
echo ""

# ============================================================================
# STEP 4: Create SG-REDIS (ElastiCache - Optional)
# ============================================================================
echo "📋 Step 4: Create SG-REDIS..."

SG_REDIS=$(aws ec2 create-security-group \
  --group-name ${PROJECT_NAME}-redis-sg \
  --description "Security group for ElastiCache Redis" \
  --vpc-id $VPC_ID \
  --region $AWS_REGION \
  --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${PROJECT_NAME}-redis-sg},{Key=Type,Value=Redis},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
  --query 'GroupId' \
  --output text)

echo "✅ SG-REDIS created: $SG_REDIS"

# Allow Redis (6379) from ECS only
aws ec2 authorize-security-group-ingress \
  --group-id $SG_REDIS \
  --protocol tcp \
  --port 6379 \
  --source-group $SG_ECS \
  --region $AWS_REGION

echo "   ✅ Allow Redis (6379) from SG-ECS"
echo ""

# ============================================================================
# STEP 5: Save Configuration
# ============================================================================
echo "📋 Step 5: Save Configuration..."

# Append to vpc-config.sh
cat >> vpc-config.sh << EOF

# Security Groups
# Generated: $(date)

export SG_ALB="$SG_ALB"
export SG_ECS="$SG_ECS"
export SG_RDS="$SG_RDS"
export SG_REDIS="$SG_REDIS"
EOF

echo "✅ Configuration saved to vpc-config.sh"
echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ SECURITY GROUPS CREATED!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   SG-ALB:   $SG_ALB (HTTP/HTTPS from internet)"
echo "   SG-ECS:   $SG_ECS (Port 3000 from ALB)"
echo "   SG-RDS:   $SG_RDS (PostgreSQL 5432 from ECS)"
echo "   SG-REDIS: $SG_REDIS (Redis 6379 from ECS)"
echo ""
echo "🏷️  All resources tagged with:"
echo "   - OWNER: $OWNER"
echo "   - PROJECT: $PROJECT"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./03-create-rds.sh"
echo ""
echo "=========================================="
