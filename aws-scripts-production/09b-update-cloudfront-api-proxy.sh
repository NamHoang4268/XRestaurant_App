#!/bin/bash

# ============================================
# Script 09c: Update CloudFront to Proxy API
# ============================================
# Purpose: Fix Mixed Content error by proxying API through CloudFront
# - Adds /api/* origin pointing to ALB
# - Frontend calls https://cloudfront.net/api/* instead of http://alb/api/*
# - Solves HTTPS → HTTP mixed content blocking
# ============================================

export AWS_PAGER=""

# Source configuration
source ./vpc-config.sh

echo "============================================"
echo "Updating CloudFront to Proxy API Requests"
echo "============================================"
echo ""
echo "Problem: Mixed Content Error"
echo "  Frontend (HTTPS) → Backend (HTTP) is blocked by browser"
echo ""
echo "Solution: CloudFront proxies API requests"
echo "  Frontend (HTTPS) → CloudFront (HTTPS) → Backend (HTTP)"
echo ""

# ============================================
# Get current distribution config
# ============================================

echo "Fetching current CloudFront distribution config..."

aws cloudfront get-distribution-config \
    --id ${CLOUDFRONT_DISTRIBUTION_ID} \
    --region us-east-1 > /tmp/cf-config.json

if [ $? -ne 0 ]; then
    echo "✗ Failed to fetch CloudFront config"
    exit 1
fi

echo "✓ Config fetched"

# Extract ETag for update
ETAG=$(cat /tmp/cf-config.json | python3 -c "import sys, json; print(json.load(sys.stdin)['ETag'])")
echo "  ETag: $ETAG"

# ============================================
# Update config using Python
# ============================================

echo ""
echo "Adding API origin and cache behavior..."

python3 << 'PYTHON_SCRIPT'
import json
import sys

# Read current config
with open('/tmp/cf-config.json', 'r') as f:
    data = json.load(f)

config = data['DistributionConfig']

# Check if API origin already exists
api_origin_exists = False
for origin in config['Origins']['Items']:
    if origin['Id'] == 'ALB-API':
        api_origin_exists = True
        print("✓ API origin already exists")
        break

# Add API origin if not exists
if not api_origin_exists:
    alb_domain = "xrestaurant-alb-977783244.ap-southeast-1.elb.amazonaws.com"
    
    api_origin = {
        "Id": "ALB-API",
        "DomainName": alb_domain,
        "OriginPath": "",
        "CustomHeaders": {
            "Quantity": 0
        },
        "CustomOriginConfig": {
            "HTTPPort": 80,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "http-only",
            "OriginSslProtocols": {
                "Quantity": 1,
                "Items": ["TLSv1.2"]
            },
            "OriginReadTimeout": 30,
            "OriginKeepaliveTimeout": 5
        }
    }
    
    config['Origins']['Items'].append(api_origin)
    config['Origins']['Quantity'] = len(config['Origins']['Items'])
    print("✓ Added API origin")

# Initialize CacheBehaviors if not exists
if 'CacheBehaviors' not in config:
    config['CacheBehaviors'] = {'Quantity': 0, 'Items': []}
elif 'Items' not in config['CacheBehaviors']:
    config['CacheBehaviors']['Items'] = []

# Check if /api/* cache behavior already exists
api_behavior_exists = False
for behavior in config['CacheBehaviors']['Items']:
    if behavior['PathPattern'] == '/api/*':
        api_behavior_exists = True
        print("✓ API cache behavior already exists")
        break

# Add /api/* cache behavior if not exists
if not api_behavior_exists:
    api_behavior = {
        "PathPattern": "/api/*",
        "TargetOriginId": "ALB-API",
        "TrustedSigners": {
            "Enabled": False,
            "Quantity": 0
        },
        "TrustedKeyGroups": {
            "Enabled": False,
            "Quantity": 0
        },
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 7,
            "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            "CachedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"]
            }
        },
        "SmoothStreaming": False,
        "Compress": False,
        "LambdaFunctionAssociations": {
            "Quantity": 0
        },
        "FunctionAssociations": {
            "Quantity": 0
        },
        "FieldLevelEncryptionId": "",
        "ForwardedValues": {
            "QueryString": True,
            "Cookies": {
                "Forward": "all"
            },
            "Headers": {
                "Quantity": 4,
                "Items": ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers", "Authorization"]
            },
            "QueryStringCacheKeys": {
                "Quantity": 0
            }
        },
        "MinTTL": 0,
        "DefaultTTL": 0,
        "MaxTTL": 0
    }
    
    config['CacheBehaviors']['Items'].append(api_behavior)
    config['CacheBehaviors']['Quantity'] = len(config['CacheBehaviors']['Items'])
    print("✓ Added API cache behavior")

# Write updated config
with open('/tmp/cf-config-updated.json', 'w') as f:
    json.dump(config, f, indent=2)

print("✓ Configuration updated")
PYTHON_SCRIPT

if [ $? -ne 0 ]; then
    echo "✗ Failed to update config"
    exit 1
fi

# ============================================
# Update CloudFront distribution
# ============================================

echo ""
echo "Updating CloudFront distribution..."

UPDATE_OUTPUT=$(aws cloudfront update-distribution \
    --id ${CLOUDFRONT_DISTRIBUTION_ID} \
    --distribution-config file:///tmp/cf-config-updated.json \
    --if-match "$ETAG" \
    --region us-east-1 2>&1)

if [ $? -ne 0 ]; then
    echo "✗ Failed to update CloudFront distribution"
    echo ""
    echo "Error details:"
    echo "$UPDATE_OUTPUT"
    echo ""
    exit 1
fi

echo "✓ CloudFront distribution updated"

# ============================================
# Wait for deployment
# ============================================

echo ""
echo "Waiting for CloudFront deployment (this may take 5-10 minutes)..."
echo ""

START_TIME=$(date +%s)
DOTS=0

while true; do
    STATUS=$(aws cloudfront get-distribution \
        --id ${CLOUDFRONT_DISTRIBUTION_ID} \
        --query 'Distribution.Status' \
        --output text \
        --region us-east-1 2>/dev/null)
    
    if [ "$STATUS" = "Deployed" ]; then
        echo ""
        echo ""
        echo "✅ CloudFront deployment COMPLETE!"
        
        ELAPSED=$(($(date +%s) - START_TIME))
        MINUTES=$((ELAPSED / 60))
        SECONDS=$((ELAPSED % 60))
        echo "   Deployment took: ${MINUTES}m ${SECONDS}s"
        break
    fi
    
    # Progress indicator
    printf "\r   Status: InProgress "
    for ((i=0; i<DOTS; i++)); do printf "."; done
    printf "   "
    
    DOTS=$((DOTS + 1))
    if [ $DOTS -gt 3 ]; then DOTS=0; fi
    
    sleep 10
done

# ============================================
# Update frontend environment variable
# ============================================

echo ""
echo "============================================"
echo "Updating Frontend API URL"
echo "============================================"
echo ""

# Update .env.production
if [ -f "../client/.env.production" ]; then
    echo "Updating .env.production..."
    
    # Backup original
    cp ../client/.env.production ../client/.env.production.backup
    
    # Update VITE_API_URL
    sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://djezxf7soso5m.cloudfront.net|g' ../client/.env.production
    
    echo "✓ Updated VITE_API_URL to https://djezxf7soso5m.cloudfront.net"
    echo ""
else
    echo "⚠️  .env.production not found, creating it..."
    cat > ../client/.env.production << 'EOF'
# Production Environment
VITE_API_URL=https://djezxf7soso5m.cloudfront.net
VITE_FRONTEND_URL=https://djezxf7soso5m.cloudfront.net
EOF
    echo "✓ Created .env.production"
    echo ""
fi

# ============================================
# Rebuild and redeploy frontend
# ============================================

echo "============================================"
echo "Rebuilding Frontend"
echo "============================================"
echo ""

cd ../client

echo "Running npm run build..."
npm run build

if [ $? -ne 0 ]; then
    echo "✗ Frontend build failed"
    cd ../aws-scripts-production
    exit 1
fi

echo "✓ Frontend built successfully"
echo ""

cd ../aws-scripts-production

# ============================================
# Redeploy to S3
# ============================================

echo "============================================"
echo "Redeploying Frontend to S3"
echo "============================================"
echo ""

bash ./08-deploy-frontend-s3.sh

if [ $? -ne 0 ]; then
    echo "✗ Frontend deployment failed"
    exit 1
fi

echo ""
echo "✓ Frontend redeployed successfully"
echo ""

# ============================================
# Cleanup
# ============================================

rm -f /tmp/cf-config.json /tmp/cf-config-updated.json

echo "============================================"
echo "CloudFront API Proxy Setup Complete"
echo "============================================"
echo ""
echo "✅ CloudFront now proxies API requests to backend"
echo ""
echo "Test API through CloudFront:"
echo "  curl https://djezxf7soso5m.cloudfront.net/api/category/get-category"
echo ""
echo "After updating frontend, your app will work on HTTPS!"
echo ""
