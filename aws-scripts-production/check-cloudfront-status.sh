#!/bin/bash

# ============================================
# Check CloudFront Distribution Status
# ============================================

export AWS_PAGER=""

DISTRIBUTION_ID="E21QEA9U9HQRM7"

echo "Checking CloudFront distribution status..."
echo ""

STATUS=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query 'Distribution.Status' \
    --output text \
    --region us-east-1)

DOMAIN=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' \
    --output text \
    --region us-east-1)

echo "Distribution ID: $DISTRIBUTION_ID"
echo "Domain: $DOMAIN"
echo "Status: $STATUS"
echo ""

if [ "$STATUS" = "Deployed" ]; then
    echo "✅ CloudFront is DEPLOYED and ready!"
    echo ""
    echo "Test your app:"
    echo "  https://$DOMAIN"
    echo ""
else
    echo "⏳ CloudFront is still deploying..."
    echo ""
    echo "This usually takes 15-20 minutes."
    echo "Run this script again to check status."
    echo ""
fi
