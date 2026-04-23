#!/bin/bash

# ============================================================================
# File: 04-create-s3-buckets.sh
# Description: Create 4 S3 buckets for XRestaurant
# Author: Kiro AI Assistant
# Date: 2026-04-18
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

echo "=========================================="
echo "📦 Create S3 Buckets (4 buckets)"
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

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Configuration:"
echo "  - Region: $AWS_REGION"
echo "  - Account ID: $ACCOUNT_ID"
echo "  - Owner: $OWNER"
echo "  - Project: $PROJECT"
echo ""

# Bucket names
FRONTEND_BUCKET="xrestaurant-frontend-${ACCOUNT_ID}"
MEDIA_BUCKET="xrestaurant-media-${ACCOUNT_ID}"
DOCUMENTS_BUCKET="xrestaurant-documents-${ACCOUNT_ID}"
SNAPSHOTS_BUCKET="xrestaurant-snapshots-${ACCOUNT_ID}"

# ============================================================================
# STEP 1: Create Frontend Bucket (Public - for HTML, CSS, JS)
# ============================================================================
echo "📋 Step 1: Create Frontend Bucket (Public)..."

# Check if bucket exists
if aws s3api head-bucket --bucket ${FRONTEND_BUCKET} 2>/dev/null; then
  echo "⚠️  Frontend bucket already exists: ${FRONTEND_BUCKET}"
else
  aws s3api create-bucket \
    --bucket ${FRONTEND_BUCKET} \
    --region ${AWS_REGION} \
    --create-bucket-configuration LocationConstraint=${AWS_REGION}
  echo "✅ Frontend bucket created: ${FRONTEND_BUCKET}"
fi

# Add tags
aws s3api put-bucket-tagging \
  --bucket ${FRONTEND_BUCKET} \
  --tagging "TagSet=[{Key=Name,Value=${FRONTEND_BUCKET}},{Key=Type,Value=Frontend},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]"

echo "   ✅ Tags updated"

# Enable static website hosting
aws s3api put-bucket-website \
  --bucket ${FRONTEND_BUCKET} \
  --website-configuration '{
    "IndexDocument": {"Suffix": "index.html"},
    "ErrorDocument": {"Key": "error.html"}
  }'

echo "   ✅ Static website hosting enabled"

# Unblock public access
aws s3api put-public-access-block \
  --bucket ${FRONTEND_BUCKET} \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo "   ✅ Public access enabled"

# Add bucket policy for public read
cat > /tmp/frontend-bucket-policy.json <<EOF
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
  --policy file:///tmp/frontend-bucket-policy.json

echo "   ✅ Public read policy applied"

rm /tmp/frontend-bucket-policy.json

FRONTEND_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
echo "   🌐 Website URL: ${FRONTEND_URL}"

echo ""

# ============================================================================
# STEP 2: Create Media Bucket (Public - for product images)
# ============================================================================
echo "📋 Step 2: Create Media Bucket (Public)..."

# Check if bucket exists
if aws s3api head-bucket --bucket ${MEDIA_BUCKET} 2>/dev/null; then
  echo "⚠️  Media bucket already exists: ${MEDIA_BUCKET}"
else
  aws s3api create-bucket \
    --bucket ${MEDIA_BUCKET} \
    --region ${AWS_REGION} \
    --create-bucket-configuration LocationConstraint=${AWS_REGION}
  echo "✅ Media bucket created: ${MEDIA_BUCKET}"
fi

# Add tags
aws s3api put-bucket-tagging \
  --bucket ${MEDIA_BUCKET} \
  --tagging "TagSet=[{Key=Name,Value=${MEDIA_BUCKET}},{Key=Type,Value=Media},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]"

echo "   ✅ Tags updated"

# Unblock public access
aws s3api put-public-access-block \
  --bucket ${MEDIA_BUCKET} \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

echo "   ✅ Public access enabled"

# Add bucket policy for public read
cat > /tmp/media-bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${MEDIA_BUCKET}/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket ${MEDIA_BUCKET} \
  --policy file:///tmp/media-bucket-policy.json

echo "   ✅ Public read policy applied"

rm /tmp/media-bucket-policy.json

# Enable CORS
cat > /tmp/cors-config.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

aws s3api put-bucket-cors \
  --bucket ${MEDIA_BUCKET} \
  --cors-configuration file:///tmp/cors-config.json

echo "   ✅ CORS enabled"

rm /tmp/cors-config.json

echo ""

# ============================================================================
# STEP 3: Create Documents Bucket (Private - for invoices, Excel files)
# ============================================================================
echo "📋 Step 3: Create Documents Bucket (Private)..."

# Check if bucket exists
if aws s3api head-bucket --bucket ${DOCUMENTS_BUCKET} 2>/dev/null; then
  echo "⚠️  Documents bucket already exists: ${DOCUMENTS_BUCKET}"
else
  aws s3api create-bucket \
    --bucket ${DOCUMENTS_BUCKET} \
    --region ${AWS_REGION} \
    --create-bucket-configuration LocationConstraint=${AWS_REGION}
  echo "✅ Documents bucket created: ${DOCUMENTS_BUCKET}"
fi

# Add tags
aws s3api put-bucket-tagging \
  --bucket ${DOCUMENTS_BUCKET} \
  --tagging "TagSet=[{Key=Name,Value=${DOCUMENTS_BUCKET}},{Key=Type,Value=Documents},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]"

echo "   ✅ Tags updated"
echo "   🔒 Bucket is private (default)"

echo ""

# ============================================================================
# STEP 4: Create Snapshots Bucket (Private - for RDS backups)
# ============================================================================
echo "📋 Step 4: Create Snapshots Bucket (Private)..."

# Check if bucket exists
if aws s3api head-bucket --bucket ${SNAPSHOTS_BUCKET} 2>/dev/null; then
  echo "⚠️  Snapshots bucket already exists: ${SNAPSHOTS_BUCKET}"
else
  aws s3api create-bucket \
    --bucket ${SNAPSHOTS_BUCKET} \
    --region ${AWS_REGION} \
    --create-bucket-configuration LocationConstraint=${AWS_REGION}
  echo "✅ Snapshots bucket created: ${SNAPSHOTS_BUCKET}"
fi

# Add tags
aws s3api put-bucket-tagging \
  --bucket ${SNAPSHOTS_BUCKET} \
  --tagging "TagSet=[{Key=Name,Value=${SNAPSHOTS_BUCKET}},{Key=Type,Value=Snapshots},{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]"

echo "   ✅ Tags updated"

# Enable versioning for backup safety
aws s3api put-bucket-versioning \
  --bucket ${SNAPSHOTS_BUCKET} \
  --versioning-configuration Status=Enabled

echo "   ✅ Versioning enabled"
echo "   🔒 Bucket is private (default)"

echo ""

# ============================================================================
# STEP 5: Save Configuration
# ============================================================================
echo "📋 Step 5: Save Configuration..."

# Append to vpc-config.sh
cat >> vpc-config.sh << EOF

# S3 Buckets
# Generated: $(date)

export FRONTEND_BUCKET="${FRONTEND_BUCKET}"
export FRONTEND_URL="${FRONTEND_URL}"
export MEDIA_BUCKET="${MEDIA_BUCKET}"
export DOCUMENTS_BUCKET="${DOCUMENTS_BUCKET}"
export SNAPSHOTS_BUCKET="${SNAPSHOTS_BUCKET}"
export ACCOUNT_ID="${ACCOUNT_ID}"
EOF

echo "✅ Configuration saved to vpc-config.sh"
echo ""

# ============================================================================
# COMPLETE
# ============================================================================
echo "=========================================="
echo "✅ S3 BUCKETS CREATED!"
echo "=========================================="
echo ""
echo "📊 Summary (4 buckets):"
echo ""
echo "1️⃣  Frontend Bucket (Public)"
echo "   Name: ${FRONTEND_BUCKET}"
echo "   URL:  ${FRONTEND_URL}"
echo "   Use:  HTML, CSS, JS files"
echo ""
echo "2️⃣  Media Bucket (Public)"
echo "   Name: ${MEDIA_BUCKET}"
echo "   URL:  https://${MEDIA_BUCKET}.s3.${AWS_REGION}.amazonaws.com/"
echo "   Use:  Product images, photos"
echo ""
echo "3️⃣  Documents Bucket (Private)"
echo "   Name: ${DOCUMENTS_BUCKET}"
echo "   Use:  Invoices, Excel files (signed URLs only)"
echo ""
echo "4️⃣  Snapshots Bucket (Private)"
echo "   Name: ${SNAPSHOTS_BUCKET}"
echo "   Use:  RDS backups, database snapshots"
echo "   Note: Versioning enabled for safety"
echo ""
echo "🏷️  All resources tagged with:"
echo "   - OWNER: ${OWNER}"
echo "   - PROJECT: ${PROJECT}"
echo ""
echo "📝 Test uploads:"
echo "   # Frontend"
echo "   aws s3 cp index.html s3://${FRONTEND_BUCKET}/"
echo ""
echo "   # Media"
echo "   aws s3 cp product.jpg s3://${MEDIA_BUCKET}/"
echo ""
echo "   # Documents"
echo "   aws s3 cp invoice.xlsx s3://${DOCUMENTS_BUCKET}/"
echo ""
echo "   # Snapshots"
echo "   aws s3 cp backup.sql s3://${SNAPSHOTS_BUCKET}/"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./05-create-ecr-push-image.sh"
echo ""
echo "=========================================="
