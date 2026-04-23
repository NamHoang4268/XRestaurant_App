#!/bin/bash

# ============================================================================
# File: 05-create-ecr-push-image.sh
# Description: Create ECR Repository and Push Docker Image (Mock Data Backend)
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "📦 Create ECR & Push Docker Image"
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
echo "  - Account ID: $ACCOUNT_ID"
echo "  - Owner: $OWNER"
echo "  - Project: $PROJECT"
echo ""

REPOSITORY_NAME="xrestaurant-backend"
IMAGE_TAG="s3-mock"

# ============================================================================
# STEP 1: Check Docker
# ============================================================================
echo "📋 Step 1: Check Docker..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo ""
  echo "❌ ERROR: Docker not found!"
  echo ""
  echo "⚠️  PLEASE START DOCKER DESKTOP FIRST!"
  echo ""
  echo "Steps:"
  echo "  1. Open Docker Desktop on Windows"
  echo "  2. Wait for Docker to start (green icon)"
  echo "  3. Run this script again"
  echo ""
  exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
  echo ""
  echo "❌ ERROR: Docker daemon not running!"
  echo ""
  echo "⚠️  PLEASE START DOCKER DESKTOP FIRST!"
  echo ""
  echo "Steps:"
  echo "  1. Open Docker Desktop on Windows"
  echo "  2. Wait for Docker to start (green icon)"
  echo "  3. Run this script again"
  echo ""
  exit 1
fi

echo "✅ Docker is running"

echo ""

# ============================================================================
# STEP 2: Build Docker Image
# ============================================================================
echo "📋 Step 2: Build Docker Image..."

cd ../server

echo "Building image with Dockerfile.s3-mock..."
docker build -f Dockerfile.s3-mock -t ${REPOSITORY_NAME}:${IMAGE_TAG} .

echo "✅ Docker image built: ${REPOSITORY_NAME}:${IMAGE_TAG}"

# Also tag as 'latest'
docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${REPOSITORY_NAME}:latest

echo "✅ Tagged as: ${REPOSITORY_NAME}:latest"

cd ../aws-scripts-production

echo ""

# ============================================================================
# STEP 3: Create ECR Repository
# ============================================================================
echo "📋 Step 3: Create ECR Repository..."

# Check if repository exists
if aws ecr describe-repositories --repository-names ${REPOSITORY_NAME} --region ${AWS_REGION} 2>/dev/null; then
  echo "⚠️  Repository already exists: ${REPOSITORY_NAME}"
  REPOSITORY_URI=$(aws ecr describe-repositories \
    --repository-names ${REPOSITORY_NAME} \
    --region ${AWS_REGION} \
    --query 'repositories[0].repositoryUri' \
    --output text)
else
  # Create repository
  REPOSITORY_URI=$(aws ecr create-repository \
    --repository-name ${REPOSITORY_NAME} \
    --region ${AWS_REGION} \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    --tags Key=Name,Value=${REPOSITORY_NAME} Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
    --query 'repository.repositoryUri' \
    --output text)
  
  echo "✅ Repository created: ${REPOSITORY_NAME}"
fi

echo "   URI: ${REPOSITORY_URI}"

echo ""

# ============================================================================
# STEP 4: Login to ECR
# ============================================================================
echo "📋 Step 4: Login to ECR..."

aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "✅ Logged in to ECR"

echo ""

# ============================================================================
# STEP 5: Tag and Push Images
# ============================================================================
echo "📋 Step 5: Tag and Push Images..."

# Tag images for ECR
docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${REPOSITORY_URI}:${IMAGE_TAG}
docker tag ${REPOSITORY_NAME}:latest ${REPOSITORY_URI}:latest

echo "✅ Images tagged for ECR"

# Push images
echo "Pushing ${IMAGE_TAG} tag..."
docker push ${REPOSITORY_URI}:${IMAGE_TAG}

echo "Pushing latest tag..."
docker push ${REPOSITORY_URI}:latest

echo "✅ Images pushed to ECR"

echo ""

# ============================================================================
# STEP 6: Verify Images
# ============================================================================
echo "📋 Step 6: Verify Images..."

aws ecr list-images \
  --repository-name ${REPOSITORY_NAME} \
  --region ${AWS_REGION} \
  --query 'imageIds[*].imageTag' \
  --output table

echo ""

# ============================================================================
# STEP 7: Save Configuration
# ============================================================================
echo "📋 Step 7: Save Configuration..."

# Append to vpc-config.sh
cat >> vpc-config.sh << EOF

# ECR Repository
# Generated: $(date)

export ECR_REPOSITORY_NAME="${REPOSITORY_NAME}"
export ECR_REPOSITORY_URI="${REPOSITORY_URI}"
export ECR_IMAGE_TAG="${IMAGE_TAG}"
EOF

echo "✅ Configuration saved to vpc-config.sh"

echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ ECR & DOCKER IMAGE COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   Repository: ${REPOSITORY_NAME}"
echo "   URI: ${REPOSITORY_URI}"
echo "   Tags: ${IMAGE_TAG}, latest"
echo "   Backend: Mock Data + S3"
echo ""
echo "🏷️  Tags:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./06-create-ecs-cluster.sh"
echo ""
echo "=========================================="
