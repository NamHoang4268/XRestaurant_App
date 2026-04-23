#!/bin/bash

# ============================================================================
# File: 08-deploy-frontend-s3.sh
# Description: Build and Deploy Frontend to S3 Static Website
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "🌐 Deploy Frontend to S3"
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
echo "  - Account: $ACCOUNT_ID"
echo "  - Backend URL: $BACKEND_URL"
echo ""

FRONTEND_DIR="../client"
BUILD_DIR="../client/dist"

# ============================================================================
# STEP 1: Check Frontend Directory
# ============================================================================
echo "📋 Step 1: Check Frontend Directory..."

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ Error: Frontend directory not found: $FRONTEND_DIR"
  exit 1
fi

echo "✅ Frontend directory found"
echo ""

# ============================================================================
# STEP 2: Create Production Environment File
# ============================================================================
echo "📋 Step 2: Create Production Environment..."

# Check if CloudFront is configured
if [ -n "$CLOUDFRONT_URL" ]; then
  API_URL="$CLOUDFRONT_URL"
  FRONTEND_PUBLIC_URL="$CLOUDFRONT_URL"
  echo "✅ Using CloudFront URL"
else
  API_URL="$BACKEND_URL"
  FRONTEND_PUBLIC_URL="$FRONTEND_URL"
  echo "⚠️  Using direct ALB URL (CloudFront not configured)"
fi

cat > ${FRONTEND_DIR}/.env.production <<EOF
# Production Environment
VITE_API_URL=${API_URL}
VITE_FRONTEND_URL=${FRONTEND_PUBLIC_URL}

# AWS Cognito Configuration
VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
VITE_COGNITO_APP_CLIENT_ID=${COGNITO_APP_CLIENT_ID}
VITE_COGNITO_APP_CLIENT_SECRET=${COGNITO_APP_CLIENT_SECRET}
VITE_COGNITO_REGION=${AWS_REGION}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
EOF

echo "✅ Environment file created"
echo "   API URL: ${API_URL}"
echo ""

# ============================================================================
# STEP 3: Install Dependencies
# ============================================================================
echo "📋 Step 3: Install Dependencies..."

if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
  echo "⚠️  Installing dependencies (2-5 minutes)..."
  cd $FRONTEND_DIR
  npm install
  cd - > /dev/null
  echo "✅ Dependencies installed"
else
  echo "✅ Dependencies already installed"
fi

echo ""

# ============================================================================
# STEP 4: Build Frontend
# ============================================================================
echo "📋 Step 4: Build Frontend..."
echo "⏳ This may take 1-2 minutes..."

cd $FRONTEND_DIR

# Clean previous build
if [ -d "dist" ]; then
  rm -rf dist
fi

# Build
npm run build

if [ ! -d "dist" ]; then
  echo "❌ Error: Build failed"
  exit 1
fi

cd - > /dev/null

echo "✅ Frontend built successfully"
echo ""

# ============================================================================
# STEP 5: Configure S3 Bucket
# ============================================================================
echo "📋 Step 5: Configure S3 Bucket..."

# Bucket should already exist from step 04
if ! aws s3 ls "s3://${FRONTEND_BUCKET}" 2>/dev/null; then
  echo "❌ Error: Bucket not found: ${FRONTEND_BUCKET}"
  echo "   Run: bash ./04-create-s3-buckets.sh"
  exit 1
fi

echo "✅ Bucket exists: ${FRONTEND_BUCKET}"

# Enable static website hosting
aws s3 website s3://${FRONTEND_BUCKET}/ \
    --index-document index.html \
    --error-document index.html \
    --region ${AWS_REGION}

echo "✅ Static website hosting enabled"

# Set public access
aws s3api put-public-access-block \
    --bucket ${FRONTEND_BUCKET} \
    --public-access-block-configuration \
        "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
    --region ${AWS_REGION}

# Bucket policy
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${FRONTEND_BUCKET}/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
    --bucket ${FRONTEND_BUCKET} \
    --policy file:///tmp/bucket-policy.json \
    --region ${AWS_REGION}

echo "✅ Bucket configured for public access"
echo ""

# ============================================================================
# STEP 6: Upload Files to S3
# ============================================================================
echo "📋 Step 6: Upload Files to S3..."
echo "⏳ This may take 1-2 minutes..."

# Sync all files except HTML (with cache)
aws s3 sync $BUILD_DIR s3://${FRONTEND_BUCKET}/ \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "*.html" \
    --region ${AWS_REGION}

# Upload HTML files (no cache)
aws s3 sync $BUILD_DIR s3://${FRONTEND_BUCKET}/ \
    --exclude "*" \
    --include "*.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --region ${AWS_REGION}

echo "✅ Files uploaded"
echo ""

# ============================================================================
# STEP 7: Test Website
# ============================================================================
echo "📋 Step 7: Test Website..."

echo "⏳ Waiting 5 seconds for S3 propagation..."
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${FRONTEND_URL} 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" == "200" ]; then
  echo "✅ Website is accessible!"
else
  echo "⚠️  Website returned status: $HTTP_STATUS"
  echo "   Try accessing in 1-2 minutes"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo "=========================================="
echo "✅ FRONTEND DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   Bucket: ${FRONTEND_BUCKET}"
echo "   URL: ${FRONTEND_URL}"
echo "   API: ${BACKEND_URL}"
echo ""
echo "🏷️  Tags:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "📝 Test:"
echo "   Open: ${FRONTEND_URL}"
echo ""
echo "📝 Update frontend (after code changes):"
echo "   cd ../client && npm run build && cd -"
echo "   aws s3 sync ../client/dist s3://${FRONTEND_BUCKET}/ --delete --region ${AWS_REGION}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./09-create-cloudfront.sh"
echo ""
echo "=========================================="
