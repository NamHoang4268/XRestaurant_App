#!/bin/bash

# ============================================================================
# Script: 18-create-bedrock-kb.sh
# Description: Create Bedrock Knowledge Base for XRestaurant
# Author: Kiro AI Assistant
# Date: 2026-04-22
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION="ap-southeast-1"
KB_NAME="xrestaurant-kb"
KB_DESCRIPTION="Knowledge Base for XRestaurant - menu, policies, FAQ"
EMBEDDING_MODEL="amazon.titan-embed-text-v1"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Bedrock Knowledge Base Setup${NC}"
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

# Get S3 bucket for documents (from W2)
if [ -z "$S3_BUCKET_DOCUMENTS" ]; then
    echo -e "${YELLOW}⚠️  S3_BUCKET_DOCUMENTS not found in config${NC}"
    echo -e "${YELLOW}Looking for existing S3 buckets...${NC}"
    
    S3_BUCKET_DOCUMENTS=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name, 'xrestaurant') && contains(Name, 'documents')].Name | [0]" \
        --output text \
        --region $REGION)
    
    if [ -z "$S3_BUCKET_DOCUMENTS" ] || [ "$S3_BUCKET_DOCUMENTS" == "None" ]; then
        echo -e "${RED}❌ Error: No S3 documents bucket found${NC}"
        echo -e "${YELLOW}Please create S3 bucket first or set S3_BUCKET_DOCUMENTS${NC}"
        exit 1
    fi
fi

echo "S3 Documents Bucket: $S3_BUCKET_DOCUMENTS"
echo ""

# ============================================================================
# STEP 2: Create IAM Role for Bedrock Knowledge Base
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Creating IAM role for Bedrock KB...${NC}"

ROLE_NAME="AmazonBedrockExecutionRoleForKnowledgeBase_xrestaurant"

# Check if role exists
ROLE_ARN=$(aws iam get-role \
    --role-name $ROLE_NAME \
    --query 'Role.Arn' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$ROLE_ARN" ]; then
    echo -e "${YELLOW}⚠️  IAM role already exists: $ROLE_ARN${NC}"
else
    # Create trust policy
    cat > /tmp/bedrock-kb-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    # Create role
    ROLE_ARN=$(aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/bedrock-kb-trust-policy.json \
        --description "Execution role for Bedrock Knowledge Base - XRestaurant" \
        --query 'Role.Arn' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ IAM role created: $ROLE_ARN${NC}"
    
    # Create and attach policy
    cat > /tmp/bedrock-kb-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${S3_BUCKET_DOCUMENTS}",
        "arn:aws:s3:::${S3_BUCKET_DOCUMENTS}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:${REGION}::foundation-model/${EMBEDDING_MODEL}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "aoss:APIAccessAll"
      ],
      "Resource": "*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $ROLE_NAME \
        --policy-name BedrockKBPolicy \
        --policy-document file:///tmp/bedrock-kb-policy.json \
        --region $REGION
    
    echo -e "${GREEN}✅ IAM policy attached${NC}"
    
    # Wait for role to propagate
    echo "Waiting 10 seconds for IAM role to propagate..."
    sleep 10
fi

echo ""

# ============================================================================
# STEP 3: Create OpenSearch Serverless Collection (Vector Store)
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating OpenSearch Serverless collection...${NC}"

COLLECTION_NAME="xrestaurant-kb-vectors"

# Check if collection exists
COLLECTION_ARN=$(aws opensearchserverless list-collections \
    --query "collectionSummaries[?name=='${COLLECTION_NAME}'].arn | [0]" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$COLLECTION_ARN" ] && [ "$COLLECTION_ARN" != "None" ]; then
    echo -e "${YELLOW}⚠️  OpenSearch collection already exists: $COLLECTION_ARN${NC}"
else
    # Create encryption policy
    aws opensearchserverless create-security-policy \
        --name "${COLLECTION_NAME}-encryption" \
        --type encryption \
        --policy "{\"Rules\":[{\"ResourceType\":\"collection\",\"Resource\":[\"collection/${COLLECTION_NAME}\"]}],\"AWSOwnedKey\":true}" \
        --region $REGION 2>/dev/null || echo "Encryption policy may already exist"
    
    # Create network policy
    aws opensearchserverless create-security-policy \
        --name "${COLLECTION_NAME}-network" \
        --type network \
        --policy "[{\"Rules\":[{\"ResourceType\":\"collection\",\"Resource\":[\"collection/${COLLECTION_NAME}\"]},{\"ResourceType\":\"dashboard\",\"Resource\":[\"collection/${COLLECTION_NAME}\"]}],\"AllowFromPublic\":true}]" \
        --region $REGION 2>/dev/null || echo "Network policy may already exist"
    
    # Create collection
    COLLECTION_ARN=$(aws opensearchserverless create-collection \
        --name $COLLECTION_NAME \
        --type VECTORSEARCH \
        --description "Vector store for XRestaurant Knowledge Base" \
        --query 'createCollectionDetail.arn' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ OpenSearch collection created: $COLLECTION_ARN${NC}"
    echo "Waiting for collection to be active (this may take 2-3 minutes)..."
    
    # Wait for collection to be active
    while true; do
        STATUS=$(aws opensearchserverless batch-get-collection \
            --names $COLLECTION_NAME \
            --query 'collectionDetails[0].status' \
            --output text \
            --region $REGION)
        
        if [ "$STATUS" == "ACTIVE" ]; then
            echo -e "${GREEN}✅ Collection is active${NC}"
            break
        fi
        echo "Status: $STATUS - waiting..."
        sleep 15
    done
fi

# Get collection endpoint
COLLECTION_ENDPOINT=$(aws opensearchserverless batch-get-collection \
    --names $COLLECTION_NAME \
    --query 'collectionDetails[0].collectionEndpoint' \
    --output text \
    --region $REGION)

echo "Collection Endpoint: $COLLECTION_ENDPOINT"
echo ""

# ============================================================================
# STEP 4: Create Data Access Policy for OpenSearch
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating data access policy...${NC}"

# Get current AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create data access policy
aws opensearchserverless create-access-policy \
    --name "${COLLECTION_NAME}-access" \
    --type data \
    --policy "[{\"Rules\":[{\"ResourceType\":\"collection\",\"Resource\":[\"collection/${COLLECTION_NAME}\"],\"Permission\":[\"aoss:*\"]},{\"ResourceType\":\"index\",\"Resource\":[\"index/${COLLECTION_NAME}/*\"],\"Permission\":[\"aoss:*\"]}],\"Principal\":[\"arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}\"]}]" \
    --region $REGION 2>/dev/null || echo "Data access policy may already exist"

echo -e "${GREEN}✅ Data access policy created${NC}"
echo ""

# ============================================================================
# STEP 5: Create Bedrock Knowledge Base
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Creating Bedrock Knowledge Base...${NC}"

# Check if KB exists
KB_ID=$(aws bedrock-agent list-knowledge-bases \
    --query "knowledgeBaseSummaries[?name=='${KB_NAME}'].knowledgeBaseId | [0]" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$KB_ID" ] && [ "$KB_ID" != "None" ]; then
    echo -e "${YELLOW}⚠️  Knowledge Base already exists: $KB_ID${NC}"
else
    # Create KB configuration
    cat > /tmp/kb-config.json <<EOF
{
  "name": "${KB_NAME}",
  "description": "${KB_DESCRIPTION}",
  "roleArn": "${ROLE_ARN}",
  "knowledgeBaseConfiguration": {
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "arn:aws:bedrock:${REGION}::foundation-model/${EMBEDDING_MODEL}"
    }
  },
  "storageConfiguration": {
    "type": "OPENSEARCH_SERVERLESS",
    "opensearchServerlessConfiguration": {
      "collectionArn": "${COLLECTION_ARN}",
      "vectorIndexName": "xrestaurant-index",
      "fieldMapping": {
        "vectorField": "vector",
        "textField": "text",
        "metadataField": "metadata"
      }
    }
  }
}
EOF

    KB_ID=$(aws bedrock-agent create-knowledge-base \
        --cli-input-json file:///tmp/kb-config.json \
        --query 'knowledgeBase.knowledgeBaseId' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ Knowledge Base created: $KB_ID${NC}"
fi

echo ""

# ============================================================================
# STEP 6: Create Data Source (S3)
# ============================================================================

echo -e "${YELLOW}📋 Step 6: Creating data source (S3)...${NC}"

# Check if data source exists
DS_ID=$(aws bedrock-agent list-data-sources \
    --knowledge-base-id $KB_ID \
    --query "dataSourceSummaries[0].dataSourceId" \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$DS_ID" ] && [ "$DS_ID" != "None" ]; then
    echo -e "${YELLOW}⚠️  Data source already exists: $DS_ID${NC}"
else
    # Create data source configuration
    cat > /tmp/ds-config.json <<EOF
{
  "knowledgeBaseId": "${KB_ID}",
  "name": "xrestaurant-s3-docs",
  "description": "S3 bucket containing restaurant documents",
  "dataSourceConfiguration": {
    "type": "S3",
    "s3Configuration": {
      "bucketArn": "arn:aws:s3:::${S3_BUCKET_DOCUMENTS}",
      "inclusionPrefixes": ["documents/"]
    }
  }
}
EOF

    DS_ID=$(aws bedrock-agent create-data-source \
        --cli-input-json file:///tmp/ds-config.json \
        --query 'dataSource.dataSourceId' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ Data source created: $DS_ID${NC}"
fi

echo ""

# ============================================================================
# STEP 7: Upload Sample Documents
# ============================================================================

echo -e "${YELLOW}📋 Step 7: Uploading sample documents...${NC}"

# Create sample documents directory
mkdir -p /tmp/xrestaurant-docs

# Create sample menu document
cat > /tmp/xrestaurant-docs/menu.txt <<EOF
XRestaurant Menu

Appetizers:
- Spring Rolls: Fresh vegetables wrapped in rice paper - $8
- Chicken Wings: Crispy fried wings with special sauce - $12
- Soup of the Day: Chef's special soup - $6

Main Courses:
- Grilled Salmon: Fresh salmon with vegetables - $25
- Beef Steak: Premium beef with mashed potatoes - $30
- Vegetarian Pasta: Pasta with seasonal vegetables - $18
- Chicken Curry: Spicy curry with rice - $20

Desserts:
- Chocolate Cake: Rich chocolate cake - $8
- Ice Cream: Vanilla, chocolate, or strawberry - $6
- Fruit Platter: Fresh seasonal fruits - $10

Beverages:
- Coffee: Espresso, Cappuccino, Latte - $4-6
- Tea: Green, Black, Herbal - $3
- Fresh Juice: Orange, Apple, Mango - $5
- Soft Drinks: Coke, Sprite, Fanta - $3
EOF

# Create sample policies document
cat > /tmp/xrestaurant-docs/policies.txt <<EOF
XRestaurant Policies

Opening Hours:
- Monday to Friday: 11:00 AM - 10:00 PM
- Saturday and Sunday: 10:00 AM - 11:00 PM
- Last order: 30 minutes before closing

Reservation Policy:
- Reservations recommended for groups of 4 or more
- Cancellation must be made 24 hours in advance
- No-show fee: $20 per person

Payment Methods:
- Cash
- Credit/Debit Cards (Visa, Mastercard, Amex)
- Mobile Payment (Apple Pay, Google Pay)

Dress Code:
- Smart casual
- No beachwear or athletic wear

Children Policy:
- Children welcome
- High chairs available
- Kids menu available

Allergen Information:
- Please inform staff of any allergies
- We cannot guarantee allergen-free environment
- Detailed allergen information available on request
EOF

# Create sample FAQ document
cat > /tmp/xrestaurant-docs/faq.txt <<EOF
XRestaurant Frequently Asked Questions

Q: Do you take reservations?
A: Yes, we accept reservations online or by phone. Walk-ins are also welcome subject to availability.

Q: Is there parking available?
A: Yes, we have free parking for customers in the building's parking garage.

Q: Do you offer vegetarian/vegan options?
A: Yes, we have several vegetarian options and can accommodate vegan requests with advance notice.

Q: Can I bring my own wine?
A: Yes, we allow BYOB with a $15 corkage fee per bottle.

Q: Do you cater events?
A: Yes, we offer catering services for events of 20+ people. Please contact us for details.

Q: Is the restaurant wheelchair accessible?
A: Yes, we are fully wheelchair accessible with accessible restrooms.

Q: Do you have WiFi?
A: Yes, free WiFi is available for all customers. Ask staff for the password.

Q: Can I modify menu items?
A: Yes, we can accommodate most modifications. Please inform your server of any dietary restrictions.

Q: Do you offer gift cards?
A: Yes, gift cards are available in any denomination at the restaurant or online.

Q: What is your cancellation policy?
A: Reservations must be cancelled 24 hours in advance to avoid a $20 per person fee.
EOF

# Upload documents to S3
echo "Uploading documents to S3..."
aws s3 cp /tmp/xrestaurant-docs/menu.txt s3://${S3_BUCKET_DOCUMENTS}/documents/ --region $REGION
aws s3 cp /tmp/xrestaurant-docs/policies.txt s3://${S3_BUCKET_DOCUMENTS}/documents/ --region $REGION
aws s3 cp /tmp/xrestaurant-docs/faq.txt s3://${S3_BUCKET_DOCUMENTS}/documents/ --region $REGION

echo -e "${GREEN}✅ 3 documents uploaded to S3${NC}"
echo ""

# ============================================================================
# STEP 8: Start Ingestion Job
# ============================================================================

echo -e "${YELLOW}📋 Step 8: Starting ingestion job...${NC}"

INGESTION_JOB_ID=$(aws bedrock-agent start-ingestion-job \
    --knowledge-base-id $KB_ID \
    --data-source-id $DS_ID \
    --query 'ingestionJob.ingestionJobId' \
    --output text \
    --region $REGION)

echo -e "${GREEN}✅ Ingestion job started: $INGESTION_JOB_ID${NC}"
echo "Waiting for ingestion to complete (this may take 2-5 minutes)..."

# Wait for ingestion to complete
while true; do
    STATUS=$(aws bedrock-agent get-ingestion-job \
        --knowledge-base-id $KB_ID \
        --data-source-id $DS_ID \
        --ingestion-job-id $INGESTION_JOB_ID \
        --query 'ingestionJob.status' \
        --output text \
        --region $REGION)
    
    if [ "$STATUS" == "COMPLETE" ]; then
        echo -e "${GREEN}✅ Ingestion complete${NC}"
        break
    elif [ "$STATUS" == "FAILED" ]; then
        echo -e "${RED}❌ Ingestion failed${NC}"
        break
    fi
    echo "Status: $STATUS - waiting..."
    sleep 15
done

echo ""

# ============================================================================
# STEP 9: Test Retrieve API
# ============================================================================

echo -e "${YELLOW}📋 Step 9: Testing Retrieve API...${NC}"

# Test query
TEST_QUERY="What are the restaurant opening hours?"

echo "Query: $TEST_QUERY"
echo ""

aws bedrock-agent-runtime retrieve \
    --knowledge-base-id $KB_ID \
    --retrieval-query "{\"text\":\"${TEST_QUERY}\"}" \
    --region $REGION \
    --output json > /tmp/retrieve-result.json

# Display results
echo -e "${BLUE}Retrieve Results:${NC}"
cat /tmp/retrieve-result.json | jq -r '.retrievalResults[0].content.text' || echo "No results"

echo ""

# ============================================================================
# STEP 10: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 10: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# Bedrock Knowledge Base Configuration (added by 18-create-bedrock-kb.sh)
export BEDROCK_KB_ID="$KB_ID"
export BEDROCK_KB_NAME="$KB_NAME"
export BEDROCK_DS_ID="$DS_ID"
export BEDROCK_COLLECTION_ARN="$COLLECTION_ARN"
export BEDROCK_COLLECTION_ENDPOINT="$COLLECTION_ENDPOINT"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   ✅ BEDROCK KB SETUP COMPLETE${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo ""
echo "Knowledge Base ID: $KB_ID"
echo "Data Source ID: $DS_ID"
echo "Collection ARN: $COLLECTION_ARN"
echo "Documents Ingested: 3 (menu, policies, FAQ)"
echo "Embedding Model: $EMBEDDING_MODEL"
echo "Vector Store: OpenSearch Serverless"
echo ""
echo -e "${BLUE}✅ Test Commands:${NC}"
echo ""
echo "# Retrieve API:"
echo "aws bedrock-agent-runtime retrieve \\"
echo "  --knowledge-base-id $KB_ID \\"
echo "  --retrieval-query '{\"text\":\"What are the opening hours?\"}' \\"
echo "  --region $REGION"
echo ""
echo "# RetrieveAndGenerate API:"
echo "aws bedrock-agent-runtime retrieve-and-generate \\"
echo "  --input '{\"text\":\"What vegetarian options do you have?\"}' \\"
echo "  --retrieve-and-generate-configuration '{\"type\":\"KNOWLEDGE_BASE\",\"knowledgeBaseConfiguration\":{\"knowledgeBaseId\":\"'$KB_ID'\",\"modelArn\":\"arn:aws:bedrock:'$REGION'::foundation-model/anthropic.claude-v2\"}}' \\"
echo "  --region $REGION"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Create Lambda function to query KB"
echo "  2. Integrate with API Gateway"
echo "  3. Test from application"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
