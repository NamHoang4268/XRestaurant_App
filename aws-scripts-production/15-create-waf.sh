#!/bin/bash

# ============================================================================
# Script: 14-create-waf.sh
# Description: Tạo AWS WAF Web ACL và attach vào CloudFront Distribution
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
REGION="us-east-1"  # WAF for CloudFront must be in us-east-1
WEB_ACL_NAME="xrestaurant-waf"
WEB_ACL_DESCRIPTION="WAF for XRestaurant CloudFront Distribution"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   AWS WAF Setup${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================================================
# STEP 1: Load Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 1: Loading configuration...${NC}"

if [ -f "./vpc-config.sh" ]; then
    source ./vpc-config.sh
    echo -e "${GREEN}✅ Config loaded${NC}"
else
    echo -e "${RED}❌ Error: vpc-config.sh not found!${NC}"
    exit 1
fi

# Validate CloudFront distribution exists
if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo -e "${RED}❌ Error: CLOUDFRONT_DISTRIBUTION_ID not found${NC}"
    echo -e "${RED}   Please run 09-create-cloudfront.sh first${NC}"
    exit 1
fi

echo -e "${GREEN}   CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID${NC}"
echo ""

# ============================================================================
# STEP 2: Create WAF Web ACL
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Creating WAF Web ACL...${NC}"

# Check if Web ACL already exists
EXISTING_WEB_ACL=$(aws wafv2 list-web-acls \
    --scope CLOUDFRONT \
    --region $REGION \
    --query "WebACLs[?Name=='$WEB_ACL_NAME'].Id" \
    --output text 2>/dev/null || echo "")

EXISTING_WEB_ACL=$(echo "$EXISTING_WEB_ACL" | tr -d '[:space:]')

if [ -n "$EXISTING_WEB_ACL" ] && [ "$EXISTING_WEB_ACL" != "None" ]; then
    echo -e "${YELLOW}⚠️  Web ACL already exists${NC}"
    WEB_ACL_ID=$EXISTING_WEB_ACL
    
    # Get Web ACL ARN
    WEB_ACL_ARN=$(aws wafv2 list-web-acls \
        --scope CLOUDFRONT \
        --region $REGION \
        --query "WebACLs[?Name=='$WEB_ACL_NAME'].ARN" \
        --output text)
    
    echo -e "${GREEN}   Web ACL ID: $WEB_ACL_ID${NC}"
    echo -e "${GREEN}   Web ACL ARN: $WEB_ACL_ARN${NC}"
else
    # Create Web ACL with managed rules
    cat > /tmp/waf-web-acl.json <<EOF
{
  "Name": "$WEB_ACL_NAME",
  "Scope": "CLOUDFRONT",
  "DefaultAction": {
    "Allow": {}
  },
  "Description": "$WEB_ACL_DESCRIPTION",
  "Rules": [
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 1,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "OverrideAction": {
        "None": {}
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSManagedRulesCommonRuleSetMetric"
      }
    },
    {
      "Name": "AWSManagedRulesKnownBadInputsRuleSet",
      "Priority": 2,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesKnownBadInputsRuleSet"
        }
      },
      "OverrideAction": {
        "None": {}
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSManagedRulesKnownBadInputsRuleSetMetric"
      }
    },
    {
      "Name": "RateLimitRule",
      "Priority": 3,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 2000,
          "AggregateKeyType": "IP"
        }
      },
      "Action": {
        "Block": {}
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "RateLimitRuleMetric"
      }
    },
    {
      "Name": "GeoBlockRule",
      "Priority": 4,
      "Statement": {
        "GeoMatchStatement": {
          "CountryCodes": ["KP", "IR", "SY"]
        }
      },
      "Action": {
        "Block": {}
      },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "GeoBlockRuleMetric"
      }
    }
  ],
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "XRestaurantWebACL"
  }
}
EOF

    WEB_ACL_ID=$(aws wafv2 create-web-acl \
        --cli-input-json file:///tmp/waf-web-acl.json \
        --region $REGION \
        --query 'Summary.Id' \
        --output text)
    
    WEB_ACL_ARN=$(aws wafv2 create-web-acl \
        --cli-input-json file:///tmp/waf-web-acl.json \
        --region $REGION \
        --query 'Summary.ARN' \
        --output text 2>/dev/null || \
        aws wafv2 list-web-acls \
            --scope CLOUDFRONT \
            --region $REGION \
            --query "WebACLs[?Name=='$WEB_ACL_NAME'].ARN" \
            --output text)
    
    echo -e "${GREEN}✅ Web ACL created${NC}"
    echo -e "${GREEN}   Web ACL ID: $WEB_ACL_ID${NC}"
    echo -e "${GREEN}   Web ACL ARN: $WEB_ACL_ARN${NC}"
fi

echo ""

# ============================================================================
# STEP 3: Associate Web ACL with CloudFront Distribution
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Associating WAF with CloudFront...${NC}"

# Check if already associated
CURRENT_WEB_ACL=$(aws cloudfront get-distribution \
    --id $CLOUDFRONT_DISTRIBUTION_ID \
    --query 'Distribution.DistributionConfig.WebACLId' \
    --output text 2>/dev/null || echo "")

if [ "$CURRENT_WEB_ACL" == "$WEB_ACL_ARN" ]; then
    echo -e "${YELLOW}⚠️  WAF already associated with CloudFront${NC}"
else
    # Get current distribution config and ETAG
    ETAG=$(aws cloudfront get-distribution-config \
        --id $CLOUDFRONT_DISTRIBUTION_ID \
        --query 'ETag' \
        --output text)
    
    # Get distribution config
    aws cloudfront get-distribution-config \
        --id $CLOUDFRONT_DISTRIBUTION_ID \
        --query 'DistributionConfig' \
        --output json > /tmp/cf-config-base.json
    
    # Update WebACLId using sed (simple text replacement)
    sed "s|\"WebACLId\": \"[^\"]*\"|\"WebACLId\": \"$WEB_ACL_ARN\"|g" /tmp/cf-config-base.json > /tmp/cf-config-updated.json
    
    # Update distribution
    aws cloudfront update-distribution \
        --id $CLOUDFRONT_DISTRIBUTION_ID \
        --distribution-config file:///tmp/cf-config-updated.json \
        --if-match $ETAG \
        --output json > /dev/null
    
    echo -e "${GREEN}✅ WAF associated with CloudFront${NC}"
    echo -e "${YELLOW}   CloudFront is updating (may take 5-10 minutes)...${NC}"
fi

echo ""

# ============================================================================
# STEP 4: Create CloudWatch Dashboard for WAF Metrics
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating CloudWatch Dashboard...${NC}"

DASHBOARD_NAME="XRestaurant-WAF-Dashboard"

cat > /tmp/waf-dashboard.json <<EOF
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "AWS/WAFV2", "AllowedRequests", { "stat": "Sum", "label": "Allowed Requests" } ],
          [ ".", "BlockedRequests", { "stat": "Sum", "label": "Blocked Requests" } ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "$REGION",
        "title": "WAF Request Status",
        "period": 300
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "AWS/WAFV2", "BlockedRequests", { "stat": "Sum" } ]
        ],
        "view": "singleValue",
        "region": "$REGION",
        "title": "Total Blocked Requests",
        "period": 300
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [ "AWS/WAFV2", "CountedRequests", { "stat": "Sum", "label": "Rate Limit Hits" } ]
        ],
        "view": "timeSeries",
        "region": "$REGION",
        "title": "Rate Limit Activity",
        "period": 300
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard \
    --dashboard-name $DASHBOARD_NAME \
    --dashboard-body file:///tmp/waf-dashboard.json \
    --region $REGION > /dev/null

echo -e "${GREEN}✅ CloudWatch Dashboard created: $DASHBOARD_NAME${NC}"
echo ""

# ============================================================================
# STEP 5: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# WAF Configuration
# Generated: $(date)

export WEB_ACL_NAME="$WEB_ACL_NAME"
export WEB_ACL_ID="$WEB_ACL_ID"
export WEB_ACL_ARN="$WEB_ACL_ARN"
export WAF_DASHBOARD="$DASHBOARD_NAME"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ WAF SETUP COMPLETE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}📋 Summary:${NC}"
echo ""
echo -e "${GREEN}🛡️  WAF Web ACL:${NC}"
echo -e "   Name: $WEB_ACL_NAME"
echo -e "   ID: $WEB_ACL_ID"
echo -e "   Region: $REGION (required for CloudFront)"
echo ""
echo -e "${GREEN}🔒 Security Rules:${NC}"
echo -e "   1. AWS Managed Rules - Common Rule Set"
echo -e "      - SQL injection protection"
echo -e "      - XSS (Cross-site scripting) protection"
echo -e "      - Local file inclusion protection"
echo -e "      - Remote file inclusion protection"
echo ""
echo -e "   2. AWS Managed Rules - Known Bad Inputs"
echo -e "      - Known malicious inputs"
echo -e "      - CVE-based protections"
echo ""
echo -e "   3. Rate Limiting Rule"
echo -e "      - Limit: 2,000 requests per 5 minutes per IP"
echo -e "      - Action: Block"
echo -e "      - Protects against DDoS"
echo ""
echo -e "   4. Geo Blocking Rule"
echo -e "      - Blocked countries: North Korea, Iran, Syria"
echo -e "      - Action: Block"
echo ""
echo -e "${GREEN}🎯 Protected Resource:${NC}"
echo -e "   CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
echo -e "   Domain: $CLOUDFRONT_DOMAIN"
echo ""
echo -e "${GREEN}📊 Monitoring:${NC}"
echo -e "   CloudWatch Dashboard: $DASHBOARD_NAME"
echo -e "   Metrics: Allowed/Blocked/Counted requests"
echo -e "   Sampled requests: Enabled"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "   1. View WAF metrics:"
echo -e "      https://console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=$DASHBOARD_NAME"
echo ""
echo -e "   2. View sampled requests:"
echo -e "      aws wafv2 get-sampled-requests \\"
echo -e "        --web-acl-arn $WEB_ACL_ARN \\"
echo -e "        --rule-metric-name AWSManagedRulesCommonRuleSetMetric \\"
echo -e "        --scope CLOUDFRONT \\"
echo -e "        --time-window StartTime=\$(date -u -d '1 hour ago' +%s),EndTime=\$(date -u +%s) \\"
echo -e "        --max-items 100 \\"
echo -e "        --region $REGION"
echo ""
echo -e "   3. Test WAF protection:"
echo -e "      # Normal request (should pass)"
echo -e "      curl https://$CLOUDFRONT_DOMAIN"
echo ""
echo -e "      # SQL injection attempt (should be blocked)"
echo -e "      curl 'https://$CLOUDFRONT_DOMAIN?id=1%20OR%201=1'"
echo ""
echo -e "      # XSS attempt (should be blocked)"
echo -e "      curl 'https://$CLOUDFRONT_DOMAIN?search=<script>alert(1)</script>'"
echo ""
echo -e "   4. Continue with Step 15: ./15-create-vpc-endpoints.sh"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NOTES:${NC}"
echo -e "${YELLOW}   - WAF for CloudFront must be in us-east-1 region${NC}"
echo -e "${YELLOW}   - CloudFront update takes 5-10 minutes to propagate${NC}"
echo -e "${YELLOW}   - Rate limit: 2,000 requests per 5 min per IP${NC}"
echo -e "${YELLOW}   - Blocked requests return 403 Forbidden${NC}"
echo -e "${YELLOW}   - WAF logs can be sent to S3/CloudWatch/Kinesis${NC}"
echo ""
echo -e "${GREEN}🔧 Useful Commands:${NC}"
echo -e "   # List Web ACLs:"
echo -e "   aws wafv2 list-web-acls --scope CLOUDFRONT --region $REGION"
echo ""
echo -e "   # Get Web ACL details:"
echo -e "   aws wafv2 get-web-acl --id $WEB_ACL_ID --scope CLOUDFRONT --region $REGION"
echo ""
echo -e "   # View blocked requests:"
echo -e "   aws wafv2 get-sampled-requests \\"
echo -e "     --web-acl-arn $WEB_ACL_ARN \\"
echo -e "     --rule-metric-name BlockedRequests \\"
echo -e "     --scope CLOUDFRONT \\"
echo -e "     --time-window StartTime=\$(date -u -d '1 hour ago' +%s),EndTime=\$(date -u +%s) \\"
echo -e "     --max-items 100 \\"
echo -e "     --region $REGION"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./16-create-vpc-endpoints.sh"
echo ""
echo "=========================================="
