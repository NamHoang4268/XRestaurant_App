d#!/bin/bash

# Docker Build Script for XRestaurant Backend
# Supports both MongoDB and PostgreSQL versions

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-west-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
ECR_REPOSITORY="xrestaurant-backend"
IMAGE_TAG="${1:-latest}"
DOCKERFILE="${2:-Dockerfile.postgres}"

echo -e "${GREEN}=== XRestaurant Backend Docker Build ===${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if AWS account ID is available
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Unable to get AWS Account ID${NC}"
    echo "Please configure AWS CLI: aws configure"
    exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  AWS Region: $AWS_REGION"
echo "  AWS Account: $AWS_ACCOUNT_ID"
echo "  ECR Repository: $ECR_REPOSITORY"
echo "  Image Tag: $IMAGE_TAG"
echo "  Dockerfile: $DOCKERFILE"
echo ""

# Construct ECR URI
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"

# Step 1: Login to ECR
echo -e "${YELLOW}Step 1: Logging in to Amazon ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI
echo -e "${GREEN}✓ Logged in to ECR${NC}"
echo ""

# Step 2: Build Docker image
echo -e "${YELLOW}Step 2: Building Docker image...${NC}"
echo "  Building: $ECR_URI:$IMAGE_TAG"
docker build -f $DOCKERFILE -t $ECR_URI:$IMAGE_TAG .

# Also tag as latest if not already
if [ "$IMAGE_TAG" != "latest" ]; then
    docker tag $ECR_URI:$IMAGE_TAG $ECR_URI:latest
    echo "  Tagged as: $ECR_URI:latest"
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Step 3: Push to ECR
echo -e "${YELLOW}Step 3: Pushing image to ECR...${NC}"
docker push $ECR_URI:$IMAGE_TAG

if [ "$IMAGE_TAG" != "latest" ]; then
    docker push $ECR_URI:latest
fi

echo -e "${GREEN}✓ Image pushed to ECR${NC}"
echo ""

# Step 4: Display image info
echo -e "${GREEN}=== Build Complete ===${NC}"
echo ""
echo "Image URI: $ECR_URI:$IMAGE_TAG"
echo ""
echo "To deploy this image to ECS:"
echo "  1. Update ECS task definition with new image URI"
echo "  2. Update ECS service to use new task definition"
echo ""
echo "Or use the deployment script:"
echo "  ./deploy-to-ecs.sh $IMAGE_TAG"
echo ""
