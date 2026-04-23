#!/bin/bash

# ============================================
# Script 09: Create CloudFront Distribution
# ============================================
# Purpose: Create CloudFront distribution for S3 frontend
# - Improves performance with edge caching
# - Provides HTTPS support
# - Custom domain support (optional)
# - Handles existing distribution gracefully
# ============================================

export AWS_PAGER=""

# Source configuration
source ./vpc-config.sh

echo "============================================"
echo "Creating CloudFront Distribution"
echo "============================================"

# Check if distribution already exists
EXISTING_DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Origins.Items[?DomainName=='${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com']].Id | [0]" \
    --output text \
    --region us-east-1)

if [ "$EXISTING_DIST" != "None" ] && [ -n "$EXISTING_DIST" ]; then
    echo "✓ CloudFront distribution already exists: $EXISTING_DIST"
    
    # Get distribution details
    DIST_DOMAIN=$(aws cloudfront get-distribution \
        --id "$EXISTING_DIST" \
        --query "Distribution.DomainName" \
        --output text \
        --region us-east-1)
    
    DIST_STATUS=$(aws cloudfront get-distribution \
        --id "$EXISTING_DIST" \
        --query "Distribution.Status" \
        --output text \
        --region us-east-1)
    
    echo "  Distribution ID: $EXISTING_DIST"
    echo "  Domain: $DIST_DOMAIN"
    echo "  Status: $DIST_STATUS"
    echo ""
    
    # Set variables for CORS update section
    DISTRIBUTION_ID="$EXISTING_DIST"
    SKIP_CLOUDFRONT_CREATION=true
else
    SKIP_CLOUDFRONT_CREATION=false
fi

if [ "$SKIP_CLOUDFRONT_CREATION" = "false" ]; then
    echo "Creating new CloudFront distribution..."

# Create CloudFront distribution configuration
DIST_CONFIG=$(cat <<EOF
{
  "CallerReference": "xrestaurant-frontend-$(date +%s)",
  "Comment": "XRestaurant Frontend Distribution",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-${FRONTEND_BUCKET}",
        "DomainName": "${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "DefaultRootObject": "index.html",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${FRONTEND_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "CloudFrontDefaultCertificate": true,
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
EOF
)

# Create distribution
DISTRIBUTION_ID=$(aws cloudfront create-distribution \
    --distribution-config "$DIST_CONFIG" \
    --query "Distribution.Id" \
    --output text \
    --region us-east-1)

if [ -z "$DISTRIBUTION_ID" ]; then
    echo "✗ Failed to create CloudFront distribution"
    exit 1
fi

echo "✓ CloudFront distribution created: $DISTRIBUTION_ID"

# Get distribution domain
DIST_DOMAIN=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query "Distribution.DomainName" \
    --output text \
    --region us-east-1)

echo "  Distribution ID: $DISTRIBUTION_ID"
echo "  Domain: $DIST_DOMAIN"
echo "  Status: Deploying (this may take 15-20 minutes)"

# Tag the distribution (skip if fails - AWS Academy limitation)
aws cloudfront tag-resource \
    --resource "arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${DISTRIBUTION_ID}" \
    --tags "Items=[{Key=OWNER,Value=${OWNER}},{Key=PROJECT,Value=${PROJECT}}]" \
    --region us-east-1 2>/dev/null || echo "  Note: Tagging skipped (AWS Academy limitation)"

fi  # End of SKIP_CLOUDFRONT_CREATION check

# ============================================
# Check Deployment Status (for both new and existing)
# ============================================

echo "Checking deployment status..."
CURRENT_STATUS=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query 'Distribution.Status' \
    --output text \
    --region us-east-1)

echo "Current Status: $CURRENT_STATUS"
echo ""

if [ "$CURRENT_STATUS" = "Deployed" ]; then
    echo "✅ CloudFront is already DEPLOYED and ready!"
    echo ""
    echo "Test your app now:"
    echo "  https://$DIST_DOMAIN"
    echo ""
else
    echo "⏳ CloudFront is deploying (typically takes 15-20 minutes)..."
    echo ""
    echo "Options:"
    echo "  1. Wait here for deployment to complete (recommended)"
    echo "  2. Continue with other tasks and check later"
    echo ""
    read -p "Wait for deployment? (y/n): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "Waiting for CloudFront deployment..."
        echo "This may take 15-20 minutes. You can press Ctrl+C to cancel and check later."
        echo ""
        
        START_TIME=$(date +%s)
        DOTS=0
        
        while true; do
            STATUS=$(aws cloudfront get-distribution \
                --id "$DISTRIBUTION_ID" \
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
                echo ""
                echo "🎉 Your app is now available at:"
                echo "   https://$DIST_DOMAIN"
                echo ""
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
    else
        echo ""
        echo "Continuing without waiting..."
        echo ""
        echo "To check status later, run:"
        echo "  aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status' --output text --region us-east-1"
        echo ""
        echo "Or use the helper script:"
        echo "  bash ./check-cloudfront-status.sh"
        echo ""
    fi
fi

echo ""
echo "============================================"
echo "CloudFront Setup Complete"
echo "============================================"
echo ""
echo "✅ CloudFront Distribution: https://$DIST_DOMAIN"
echo ""
echo "⚠️  CRITICAL NEXT STEP: Configure API Proxy"
echo ""
echo "To fix Mixed Content errors (HTTPS → HTTP), you MUST run:"
echo "  bash ./09b-update-cloudfront-api-proxy.sh"
echo ""
echo "This will:"
echo "  - Add ALB as CloudFront origin"
echo "  - Configure /api/* routing"
echo "  - Update frontend to use CloudFront URL"
echo "  - Rebuild and redeploy frontend"
echo ""
echo "Without this step, your frontend CANNOT call backend APIs!"
echo ""
read -p "Press Enter to run 09b now (RECOMMENDED) or Ctrl+C to skip: "

echo ""
bash ./09b-update-cloudfront-api-proxy.sh

echo ""
echo "============================================"
echo "Deployment Complete"
echo "============================================"
echo ""
echo "Test your application:"
echo "  CloudFront URL: https://$DIST_DOMAIN"
echo "  S3 URL: $FRONTEND_URL"
echo ""
echo "Next steps:"
echo "  1. Setup Cognito authentication: bash ./10-create-cognito.sh"
echo "  2. Add test users: bash ./11-add-users-to-cognito.sh"
echo "  3. Rebuild frontend with Cognito config"
echo "     cd ../client && npm run build"
echo "     cd ../aws-scripts-production && bash ./08-deploy-frontend-s3.sh"
echo "     # Invalidate CloudFront cache"
echo "       aws cloudfront create-invalidation --distribution-id E21QEA9U9HQRM7 --paths "/*" --region us-east-1"
echo ""
echo "=========================================="
