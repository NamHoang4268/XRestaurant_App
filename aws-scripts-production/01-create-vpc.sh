#!/bin/bash

# ============================================================================
# File: 01-create-vpc.sh
# Description: Create VPC with 1 NAT Gateway (optimized for shared account)
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

AWS_REGION="us-west-2"
VPC_NAME="xrestaurant-vpc"
VPC_CIDR="10.0.0.0/16"

# Tags
OWNER="NamHoang"
PROJECT="XRestaurant"

echo "=========================================="
echo "🏗️  Create VPC Infrastructure"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  - VPC Name: ${VPC_NAME}"
echo "  - VPC CIDR: ${VPC_CIDR}"
echo "  - Region: ${AWS_REGION}"
echo "  - NAT Gateways: 1 (shared account optimization)"
echo "  - Owner: ${OWNER}"
echo "  - Project: ${PROJECT}"
echo ""

# ============================================================================
# STEP 1: Create VPC
# ============================================================================
echo "📋 Step 1: Create VPC..."

VPC_ID=$(aws ec2 create-vpc \
    --cidr-block ${VPC_CIDR} \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${VPC_NAME}},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'Vpc.VpcId' \
    --output text)

echo "✅ VPC created: ${VPC_ID}"

# Enable DNS hostnames
aws ec2 modify-vpc-attribute \
    --vpc-id ${VPC_ID} \
    --enable-dns-hostnames \
    --region ${AWS_REGION}

echo "✅ DNS hostnames enabled"

# ============================================================================
# STEP 2: Create Internet Gateway
# ============================================================================
echo ""
echo "📋 Step 2: Create Internet Gateway..."

IGW_ID=$(aws ec2 create-internet-gateway \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${VPC_NAME}-igw},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'InternetGateway.InternetGatewayId' \
    --output text)

echo "✅ Internet Gateway created: ${IGW_ID}"

# Attach IGW to VPC
aws ec2 attach-internet-gateway \
    --vpc-id ${VPC_ID} \
    --internet-gateway-id ${IGW_ID} \
    --region ${AWS_REGION}

echo "✅ Internet Gateway attached to VPC"

# ============================================================================
# STEP 3: Create Subnets
# ============================================================================
echo ""
echo "📋 Step 3: Create Subnets..."

# Public Subnets
PUBLIC_SUBNET_1=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.1.0/24 \
    --availability-zone ${AWS_REGION}a \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-public-1a},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Public}]" \
    --query 'Subnet.SubnetId' \
    --output text)

PUBLIC_SUBNET_2=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.2.0/24 \
    --availability-zone ${AWS_REGION}b \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-public-1b},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Public}]" \
    --query 'Subnet.SubnetId' \
    --output text)

echo "✅ Public subnets created:"
echo "   - ${PUBLIC_SUBNET_1} (${AWS_REGION}a)"
echo "   - ${PUBLIC_SUBNET_2} (${AWS_REGION}b)"

# Private App Subnets
PRIVATE_APP_SUBNET_1=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.11.0/24 \
    --availability-zone ${AWS_REGION}a \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-private-app-1a},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Private-App}]" \
    --query 'Subnet.SubnetId' \
    --output text)

PRIVATE_APP_SUBNET_2=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.12.0/24 \
    --availability-zone ${AWS_REGION}b \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-private-app-1b},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Private-App}]" \
    --query 'Subnet.SubnetId' \
    --output text)

echo "✅ Private app subnets created:"
echo "   - ${PRIVATE_APP_SUBNET_1} (${AWS_REGION}a)"
echo "   - ${PRIVATE_APP_SUBNET_2} (${AWS_REGION}b)"

# Private Data Subnets
PRIVATE_DATA_SUBNET_1=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.21.0/24 \
    --availability-zone ${AWS_REGION}a \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-private-data-1a},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Private-Data}]" \
    --query 'Subnet.SubnetId' \
    --output text)

PRIVATE_DATA_SUBNET_2=$(aws ec2 create-subnet \
    --vpc-id ${VPC_ID} \
    --cidr-block 10.0.22.0/24 \
    --availability-zone ${AWS_REGION}b \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${VPC_NAME}-private-data-1b},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}},{Key=Type,Value=Private-Data}]" \
    --query 'Subnet.SubnetId' \
    --output text)

echo "✅ Private data subnets created:"
echo "   - ${PRIVATE_DATA_SUBNET_1} (${AWS_REGION}a)"
echo "   - ${PRIVATE_DATA_SUBNET_2} (${AWS_REGION}b)"

# ============================================================================
# STEP 4: Create NAT Gateway (Only 1 for shared account)
# ============================================================================
echo ""
echo "📋 Step 4: Create NAT Gateway (1 only)..."

# Allocate Elastic IP
EIP_ALLOC_ID=$(aws ec2 allocate-address \
    --domain vpc \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${VPC_NAME}-eip-nat-1a},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'AllocationId' \
    --output text)

echo "✅ Elastic IP allocated: ${EIP_ALLOC_ID}"

# Create NAT Gateway in Public Subnet 1
NAT_GW_ID=$(aws ec2 create-nat-gateway \
    --subnet-id ${PUBLIC_SUBNET_1} \
    --allocation-id ${EIP_ALLOC_ID} \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=${VPC_NAME}-nat-1a},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'NatGateway.NatGatewayId' \
    --output text)

echo "✅ NAT Gateway created: ${NAT_GW_ID}"
echo "⏳ Waiting for NAT Gateway to be available (2-3 minutes)..."

aws ec2 wait nat-gateway-available \
    --nat-gateway-ids ${NAT_GW_ID} \
    --region ${AWS_REGION}

echo "✅ NAT Gateway is available"

# ============================================================================
# STEP 5: Create Route Tables
# ============================================================================
echo ""
echo "📋 Step 5: Create Route Tables..."

# Public Route Table
PUBLIC_RT_ID=$(aws ec2 create-route-table \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${VPC_NAME}-public-rt},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'RouteTable.RouteTableId' \
    --output text)

echo "✅ Public route table created: ${PUBLIC_RT_ID}"

# Add route to Internet Gateway
aws ec2 create-route \
    --route-table-id ${PUBLIC_RT_ID} \
    --destination-cidr-block 0.0.0.0/0 \
    --gateway-id ${IGW_ID} \
    --region ${AWS_REGION}

echo "✅ Route to IGW added"

# Associate public subnets
aws ec2 associate-route-table \
    --route-table-id ${PUBLIC_RT_ID} \
    --subnet-id ${PUBLIC_SUBNET_1} \
    --region ${AWS_REGION}

aws ec2 associate-route-table \
    --route-table-id ${PUBLIC_RT_ID} \
    --subnet-id ${PUBLIC_SUBNET_2} \
    --region ${AWS_REGION}

echo "✅ Public subnets associated with public route table"

# Private Route Table (for both AZs - using single NAT)
PRIVATE_RT_ID=$(aws ec2 create-route-table \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${VPC_NAME}-private-rt},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --query 'RouteTable.RouteTableId' \
    --output text)

echo "✅ Private route table created: ${PRIVATE_RT_ID}"

# Add route to NAT Gateway
aws ec2 create-route \
    --route-table-id ${PRIVATE_RT_ID} \
    --destination-cidr-block 0.0.0.0/0 \
    --nat-gateway-id ${NAT_GW_ID} \
    --region ${AWS_REGION}

echo "✅ Route to NAT Gateway added"

# Associate private app subnets
aws ec2 associate-route-table \
    --route-table-id ${PRIVATE_RT_ID} \
    --subnet-id ${PRIVATE_APP_SUBNET_1} \
    --region ${AWS_REGION}

aws ec2 associate-route-table \
    --route-table-id ${PRIVATE_RT_ID} \
    --subnet-id ${PRIVATE_APP_SUBNET_2} \
    --region ${AWS_REGION}

# Associate private data subnets
aws ec2 associate-route-table \
    --route-table-id ${PRIVATE_RT_ID} \
    --subnet-id ${PRIVATE_DATA_SUBNET_1} \
    --region ${AWS_REGION}

aws ec2 associate-route-table \
    --route-table-id ${PRIVATE_RT_ID} \
    --subnet-id ${PRIVATE_DATA_SUBNET_2} \
    --region ${AWS_REGION}

echo "✅ Private subnets associated with private route table"

# ============================================================================
# STEP 6: Save Configuration
# ============================================================================
echo ""
echo "📋 Step 6: Save Configuration..."

cat > vpc-config.sh <<EOF
# VPC Configuration
# Generated: $(date)

export AWS_REGION="${AWS_REGION}"
export VPC_ID="${VPC_ID}"
export VPC_NAME="${VPC_NAME}"
export IGW_ID="${IGW_ID}"

# Public Subnets
export PUBLIC_SUBNET_1="${PUBLIC_SUBNET_1}"
export PUBLIC_SUBNET_2="${PUBLIC_SUBNET_2}"

# Private App Subnets
export PRIVATE_APP_SUBNET_1="${PRIVATE_APP_SUBNET_1}"
export PRIVATE_APP_SUBNET_2="${PRIVATE_APP_SUBNET_2}"

# Private Data Subnets
export PRIVATE_DATA_SUBNET_1="${PRIVATE_DATA_SUBNET_1}"
export PRIVATE_DATA_SUBNET_2="${PRIVATE_DATA_SUBNET_2}"

# NAT Gateway (Single)
export NAT_GW_ID="${NAT_GW_ID}"
export EIP_ALLOC_ID="${EIP_ALLOC_ID}"

# Route Tables
export PUBLIC_RT_ID="${PUBLIC_RT_ID}"
export PRIVATE_RT_ID="${PRIVATE_RT_ID}"

# Tags
export OWNER="${OWNER}"
export PROJECT="${PROJECT}"
EOF

echo "✅ Configuration saved to vpc-config.sh"

# ============================================================================
# COMPLETE
# ============================================================================
echo ""
echo "=========================================="
echo "✅ VPC INFRASTRUCTURE CREATED!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   VPC ID: ${VPC_ID}"
echo "   VPC Name: ${VPC_NAME}"
echo "   CIDR: ${VPC_CIDR}"
echo "   Region: ${AWS_REGION}"
echo ""
echo "🌐 Subnets:"
echo "   Public:"
echo "     - ${PUBLIC_SUBNET_1} (${AWS_REGION}a)"
echo "     - ${PUBLIC_SUBNET_2} (${AWS_REGION}b)"
echo "   Private App:"
echo "     - ${PRIVATE_APP_SUBNET_1} (${AWS_REGION}a)"
echo "     - ${PRIVATE_APP_SUBNET_2} (${AWS_REGION}b)"
echo "   Private Data:"
echo "     - ${PRIVATE_DATA_SUBNET_1} (${AWS_REGION}a)"
echo "     - ${PRIVATE_DATA_SUBNET_2} (${AWS_REGION}b)"
echo ""
echo "🔀 NAT Gateway:"
echo "   - ${NAT_GW_ID} (${AWS_REGION}a)"
echo "   - Note: Single NAT for cost optimization"
echo "   - Both AZs route through this NAT"
echo ""
echo "🏷️  Tags:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./02-create-security-groups.sh"
echo ""
echo "=========================================="
