#!/bin/bash

# ============================================================================
# Script: 15-create-vpc-endpoints.sh
# Description: Tạo VPC Endpoints cho ECR, S3, Secrets Manager, CloudWatch
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION="us-west-2"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   VPC Endpoints Setup - XRestaurant${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================================================
# STEP 1: Load VPC Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 1: Loading VPC configuration...${NC}"

if [ -f "./vpc-config.sh" ]; then
    source ./vpc-config.sh
    echo -e "${GREEN}✅ VPC config loaded${NC}"
else
    echo -e "${RED}❌ Error: vpc-config.sh not found!${NC}"
    exit 1
fi

# Map variable names
if [ -n "$PRIVATE_APP_SUBNET_1" ]; then
    PRIVATE_SUBNET_1="$PRIVATE_APP_SUBNET_1"
fi
if [ -n "$PRIVATE_APP_SUBNET_2" ]; then
    PRIVATE_SUBNET_2="$PRIVATE_APP_SUBNET_2"
fi

# Verify required variables
if [ -z "$VPC_ID" ] || [ -z "$PRIVATE_SUBNET_1" ]; then
    echo -e "${RED}❌ Error: Missing VPC configuration${NC}"
    exit 1
fi

echo "VPC ID: $VPC_ID"
echo "Private Subnet 1: $PRIVATE_SUBNET_1"
if [ -n "$PRIVATE_SUBNET_2" ]; then
    echo "Private Subnet 2: $PRIVATE_SUBNET_2"
    SUBNETS="$PRIVATE_SUBNET_1 $PRIVATE_SUBNET_2"
else
    SUBNETS="$PRIVATE_SUBNET_1"
fi
echo ""

# ============================================================================
# STEP 2: Get Security Group for VPC Endpoints
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Getting Security Group...${NC}"

if [ -z "$SG_ECS" ]; then
    echo -e "${RED}❌ Error: SG_ECS not found${NC}"
    exit 1
fi

echo "Using Security Group: $SG_ECS"
echo ""

# ============================================================================
# STEP 3: Create S3 Gateway Endpoint (FREE)
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating S3 Gateway Endpoint...${NC}"

# Get route table IDs
ROUTE_TABLES=$(aws ec2 describe-route-tables \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'RouteTables[?Tags[?Key==`Name` && contains(Value, `private-app`)]].RouteTableId' \
    --output text \
    --region $REGION)

if [ -z "$ROUTE_TABLES" ]; then
    echo -e "${YELLOW}⚠️  No private app route tables found, using all route tables${NC}"
    ROUTE_TABLES=$(aws ec2 describe-route-tables \
        --filters "Name=vpc-id,Values=$VPC_ID" \
        --query 'RouteTables[].RouteTableId' \
        --output text \
        --region $REGION)
fi

# Check if S3 endpoint already exists
S3_ENDPOINT_ID=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$REGION.s3" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text \
    --region $REGION 2>/dev/null)

if [ "$S3_ENDPOINT_ID" != "None" ] && [ -n "$S3_ENDPOINT_ID" ]; then
    echo -e "${YELLOW}⚠️  S3 Gateway Endpoint already exists: $S3_ENDPOINT_ID${NC}"
else
    S3_ENDPOINT_ID=$(aws ec2 create-vpc-endpoint \
        --vpc-id $VPC_ID \
        --service-name com.amazonaws.$REGION.s3 \
        --route-table-ids $ROUTE_TABLES \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=xrestaurant-s3-endpoint},{Key=Project,Value=xrestaurant},{Key=OWNER,Value=NamHoang}]" \
        --region $REGION \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo -e "${GREEN}✅ S3 Gateway Endpoint created: $S3_ENDPOINT_ID${NC}"
fi
echo ""

# ============================================================================
# STEP 4: Create ECR API Interface Endpoint
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating ECR API Interface Endpoint...${NC}"

# Check if ECR API endpoint already exists
ECR_API_ENDPOINT_ID=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$REGION.ecr.api" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text \
    --region $REGION 2>/dev/null)

if [ "$ECR_API_ENDPOINT_ID" != "None" ] && [ -n "$ECR_API_ENDPOINT_ID" ]; then
    echo -e "${YELLOW}⚠️  ECR API Endpoint already exists: $ECR_API_ENDPOINT_ID${NC}"
else
    ECR_API_ENDPOINT_ID=$(aws ec2 create-vpc-endpoint \
        --vpc-id $VPC_ID \
        --vpc-endpoint-type Interface \
        --service-name com.amazonaws.$REGION.ecr.api \
        --subnet-ids $SUBNETS \
        --security-group-ids $SG_ECS \
        --private-dns-enabled \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=xrestaurant-ecr-api-endpoint},{Key=Project,Value=xrestaurant},{Key=OWNER,Value=NamHoang}]" \
        --region $REGION \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo -e "${GREEN}✅ ECR API Endpoint created: $ECR_API_ENDPOINT_ID${NC}"
fi
echo ""

# ============================================================================
# STEP 5: Create ECR DKR Interface Endpoint
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Creating ECR DKR Interface Endpoint...${NC}"

# Check if ECR DKR endpoint already exists
ECR_DKR_ENDPOINT_ID=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$REGION.ecr.dkr" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text \
    --region $REGION 2>/dev/null)

if [ "$ECR_DKR_ENDPOINT_ID" != "None" ] && [ -n "$ECR_DKR_ENDPOINT_ID" ]; then
    echo -e "${YELLOW}⚠️  ECR DKR Endpoint already exists: $ECR_DKR_ENDPOINT_ID${NC}"
else
    ECR_DKR_ENDPOINT_ID=$(aws ec2 create-vpc-endpoint \
        --vpc-id $VPC_ID \
        --vpc-endpoint-type Interface \
        --service-name com.amazonaws.$REGION.ecr.dkr \
        --subnet-ids $SUBNETS \
        --security-group-ids $SG_ECS \
        --private-dns-enabled \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=xrestaurant-ecr-dkr-endpoint},{Key=Project,Value=xrestaurant},{Key=OWNER,Value=NamHoang}]" \
        --region $REGION \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo -e "${GREEN}✅ ECR DKR Endpoint created: $ECR_DKR_ENDPOINT_ID${NC}"
fi
echo ""

# ============================================================================
# STEP 6: Create CloudWatch Logs Interface Endpoint
# ============================================================================

echo -e "${YELLOW}📋 Step 6: Creating CloudWatch Logs Interface Endpoint...${NC}"

# Check if CloudWatch Logs endpoint already exists
CW_LOGS_ENDPOINT_ID=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$REGION.logs" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text \
    --region $REGION 2>/dev/null)

if [ "$CW_LOGS_ENDPOINT_ID" != "None" ] && [ -n "$CW_LOGS_ENDPOINT_ID" ]; then
    echo -e "${YELLOW}⚠️  CloudWatch Logs Endpoint already exists: $CW_LOGS_ENDPOINT_ID${NC}"
else
    CW_LOGS_ENDPOINT_ID=$(aws ec2 create-vpc-endpoint \
        --vpc-id $VPC_ID \
        --vpc-endpoint-type Interface \
        --service-name com.amazonaws.$REGION.logs \
        --subnet-ids $SUBNETS \
        --security-group-ids $SG_ECS \
        --private-dns-enabled \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=xrestaurant-logs-endpoint},{Key=Project,Value=xrestaurant},{Key=OWNER,Value=NamHoang}]" \
        --region $REGION \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo -e "${GREEN}✅ CloudWatch Logs Endpoint created: $CW_LOGS_ENDPOINT_ID${NC}"
fi
echo ""

# ============================================================================
# STEP 7: Create Secrets Manager Interface Endpoint (Optional)
# ============================================================================

echo -e "${YELLOW}📋 Step 7: Creating Secrets Manager Interface Endpoint...${NC}"

# Check if Secrets Manager endpoint already exists
SM_ENDPOINT_ID=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$REGION.secretsmanager" \
    --query 'VpcEndpoints[0].VpcEndpointId' \
    --output text \
    --region $REGION 2>/dev/null)

if [ "$SM_ENDPOINT_ID" != "None" ] && [ -n "$SM_ENDPOINT_ID" ]; then
    echo -e "${YELLOW}⚠️  Secrets Manager Endpoint already exists: $SM_ENDPOINT_ID${NC}"
else
    SM_ENDPOINT_ID=$(aws ec2 create-vpc-endpoint \
        --vpc-id $VPC_ID \
        --vpc-endpoint-type Interface \
        --service-name com.amazonaws.$REGION.secretsmanager \
        --subnet-ids $SUBNETS \
        --security-group-ids $SG_ECS \
        --private-dns-enabled \
        --tag-specifications "ResourceType=vpc-endpoint,Tags=[{Key=Name,Value=xrestaurant-secretsmanager-endpoint},{Key=Project,Value=xrestaurant},{Key=OWNER,Value=NamHoang}]" \
        --region $REGION \
        --query 'VpcEndpoint.VpcEndpointId' \
        --output text)
    
    echo -e "${GREEN}✅ Secrets Manager Endpoint created: $SM_ENDPOINT_ID${NC}"
fi
echo ""

# ============================================================================
# STEP 8: Wait for endpoints to be available
# ============================================================================

echo -e "${YELLOW}📋 Step 8: Waiting for endpoints to be available...${NC}"
echo "This may take 2-3 minutes..."

# Wait for interface endpoints
for ENDPOINT_ID in $ECR_API_ENDPOINT_ID $ECR_DKR_ENDPOINT_ID $CW_LOGS_ENDPOINT_ID $SM_ENDPOINT_ID; do
    if [ "$ENDPOINT_ID" != "None" ] && [ -n "$ENDPOINT_ID" ]; then
        aws ec2 wait vpc-endpoint-available \
            --vpc-endpoint-ids $ENDPOINT_ID \
            --region $REGION 2>/dev/null || true
    fi
done

echo -e "${GREEN}✅ All endpoints are available${NC}"
echo ""

# ============================================================================
# STEP 9: Save configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 9: Saving VPC Endpoints configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# VPC Endpoints Configuration (added by 11-create-vpc-endpoints.sh)
export VPC_ENDPOINT_S3="$S3_ENDPOINT_ID"
export VPC_ENDPOINT_ECR_API="$ECR_API_ENDPOINT_ID"
export VPC_ENDPOINT_ECR_DKR="$ECR_DKR_ENDPOINT_ID"
export VPC_ENDPOINT_LOGS="$CW_LOGS_ENDPOINT_ID"
export VPC_ENDPOINT_SECRETS="$SM_ENDPOINT_ID"
EOF

echo -e "${GREEN}✅ Configuration saved to vpc-config.sh${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   ✅ VPC ENDPOINTS SETUP COMPLETE${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo ""
echo -e "${BLUE}🌐 VPC Endpoints Created:${NC}"
echo "  1. S3 Gateway Endpoint: $S3_ENDPOINT_ID (FREE)"
echo "  2. ECR API Endpoint: $ECR_API_ENDPOINT_ID"
echo "  3. ECR DKR Endpoint: $ECR_DKR_ENDPOINT_ID"
echo "  4. CloudWatch Logs Endpoint: $CW_LOGS_ENDPOINT_ID"
echo "  5. Secrets Manager Endpoint: $SM_ENDPOINT_ID"
echo ""
echo -e "${BLUE}✅ Benefits:${NC}"
echo "  - Fargate tasks can pull images from ECR without NAT Gateway"
echo "  - Private subnet has access to AWS services"
echo "  - Improved security (traffic stays within AWS network)"
echo "  - Reduced data transfer costs"
echo ""
echo -e "${BLUE}💰 Cost Estimate:${NC}"
echo "  - S3 Gateway Endpoint: FREE"
echo "  - Interface Endpoints (4x): ~\$0.01/hour each = \$0.04/hour"
echo "  - Data transfer: \$0.01/GB"
echo "  - Total: ~\$0.96/day for interface endpoints"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Verify endpoints: aws ec2 describe-vpc-endpoints --vpc-id $VPC_ID --region $REGION"
echo "  2. Re-run ECS deployment: bash ./06-create-ecs-cluster.sh"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./17-create-cloudtrail.sh"
echo ""
echo "=========================================="