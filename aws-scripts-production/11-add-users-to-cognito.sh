#!/bin/bash

# ============================================================================
# File: 11-add-users-to-cognito.sh
# Description: Add demo users to Cognito User Pool
# Author: Kiro AI Assistant
# Date: 2026-04-17
# ============================================================================

set -e

# Source configuration
source ./vpc-config.sh

echo "=========================================="
echo "👥 Add Demo Users to Cognito"
echo "=========================================="

# Check if Cognito config exists
if [ -z "${COGNITO_USER_POOL_ID}" ]; then
    echo "❌ Cognito User Pool not found!"
    echo "Please run script 10-create-cognito.sh first"
    exit 1
fi

USER_POOL_ID="${COGNITO_USER_POOL_ID}"
echo "✅ User Pool ID: ${USER_POOL_ID}"

echo "✅ User Pool ID: ${USER_POOL_ID}"

# ============================================================================
# Create user1 (Viewer - chỉ xem)
# ============================================================================
echo ""
echo "📋 Creating user1 (Viewer)..."

# Nhập username và password cho user1
read -p "Enter username for user1 (e.g., user1): " USER1_NAME
read -sp "Enter password for user1: " USER1_PASS
echo ""

# Create user1
aws cognito-idp admin-create-user \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER1_NAME} \
    --user-attributes Name=email,Value=${USER1_NAME}@xrestaurant.demo Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --region ${AWS_REGION}

# Set permanent password
aws cognito-idp admin-set-user-password \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER1_NAME} \
    --password ${USER1_PASS} \
    --permanent \
    --region ${AWS_REGION}

# Add to Viewers group
aws cognito-idp admin-add-user-to-group \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER1_NAME} \
    --group-name Viewers \
    --region ${AWS_REGION}

echo "✅ user1 created and added to Viewers group"

# ============================================================================
# Create user2 (Admin - toàn quyền)
# ============================================================================
echo ""
echo "📋 Creating user2 (Admin)..."

# Nhập username và password cho user2
read -p "Enter username for user2 (e.g., user2): " USER2_NAME
read -sp "Enter password for user2: " USER2_PASS
echo ""

# Create user2
aws cognito-idp admin-create-user \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER2_NAME} \
    --user-attributes Name=email,Value=${USER2_NAME}@xrestaurant.demo Name=email_verified,Value=true \
    --message-action SUPPRESS \
    --region ${AWS_REGION}

# Set permanent password
aws cognito-idp admin-set-user-password \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER2_NAME} \
    --password ${USER2_PASS} \
    --permanent \
    --region ${AWS_REGION}

# Add to Admins group
aws cognito-idp admin-add-user-to-group \
    --user-pool-id ${USER_POOL_ID} \
    --username ${USER2_NAME} \
    --group-name Admins \
    --region ${AWS_REGION}

echo "✅ user2 created and added to Admins group"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "=========================================="
echo "✅ Users Created Successfully!"
echo "=========================================="
echo ""
echo "👥 Demo Users:"
echo "   ${USER1_NAME}: Viewer (chỉ xem)"
echo "   ${USER2_NAME}: Admin (toàn quyền)"
echo ""
echo "🔐 Cognito User Pool ID: ${USER_POOL_ID}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./12-setup-monitoring.sh"
echo ""
echo "=========================================="