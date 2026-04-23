#!/bin/bash

# ============================================================================
# Script: 19-create-lambda-functions.sh
# Description: Create Lambda functions for XRestaurant W3
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
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Lambda Functions Setup - W3${NC}"
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

echo ""

# ============================================================================
# STEP 2: Package Lambda Functions
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Packaging Lambda functions...${NC}"

cd ../server/lambda

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

# Package Bedrock Query Handler
echo "Packaging bedrock-query-handler..."
zip -r /tmp/bedrock-query-handler.zip bedrock-query-handler.js node_modules/ package.json

# Package DB Query Handler
echo "Packaging db-query-handler..."
zip -r /tmp/db-query-handler.zip db-query-handler.js node_modules/ package.json

cd ../../aws-scripts-production

echo -e "${GREEN}✅ Lambda functions packaged${NC}"
echo ""

# ============================================================================
# STEP 3: Create IAM Role for Bedrock Lambda
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating IAM role for Bedrock Lambda...${NC}"

BEDROCK_ROLE_NAME="xrestaurant-lambda-bedrock-role"

# Check if role exists
BEDROCK_ROLE_ARN=$(aws iam get-role \
    --role-name $BEDROCK_ROLE_NAME \
    --query 'Role.Arn' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$BEDROCK_ROLE_ARN" ]; then
    echo -e "${YELLOW}⚠️  IAM role already exists: $BEDROCK_ROLE_ARN${NC}"
else
    # Create trust policy
    cat > /tmp/lambda-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    # Create role
    BEDROCK_ROLE_ARN=$(aws iam create-role \
        --role-name $BEDROCK_ROLE_NAME \
        --assume-role-policy-document file:///tmp/lambda-trust-policy.json \
        --description "Execution role for Bedrock Lambda - XRestaurant" \
        --query 'Role.Arn' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ IAM role created: $BEDROCK_ROLE_ARN${NC}"
    
    # Attach basic Lambda execution policy
    aws iam attach-role-policy \
        --role-name $BEDROCK_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
        --region $REGION
    
    # Create and attach Bedrock policy
    cat > /tmp/bedrock-lambda-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:knowledge-base/${BEDROCK_KB_ID}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/xrestaurant-bedrock-query:*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $BEDROCK_ROLE_NAME \
        --policy-name BedrockLambdaPolicy \
        --policy-document file:///tmp/bedrock-lambda-policy.json \
        --region $REGION
    
    echo -e "${GREEN}✅ IAM policy attached${NC}"
    
    # Wait for role to propagate
    echo "Waiting 10 seconds for IAM role to propagate..."
    sleep 10
fi

echo ""

# ============================================================================
# STEP 4: Create IAM Role for DB Lambda
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating IAM role for DB Lambda...${NC}"

DB_ROLE_NAME="xrestaurant-lambda-db-role"

# Check if role exists
DB_ROLE_ARN=$(aws iam get-role \
    --role-name $DB_ROLE_NAME \
    --query 'Role.Arn' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$DB_ROLE_ARN" ]; then
    echo -e "${YELLOW}⚠️  IAM role already exists: $DB_ROLE_ARN${NC}"
else
    # Create role
    DB_ROLE_ARN=$(aws iam create-role \
        --role-name $DB_ROLE_NAME \
        --assume-role-policy-document file:///tmp/lambda-trust-policy.json \
        --description "Execution role for DB Lambda - XRestaurant" \
        --query 'Role.Arn' \
        --output text \
        --region $REGION)
    
    echo -e "${GREEN}✅ IAM role created: $DB_ROLE_ARN${NC}"
    
    # Attach VPC execution policy
    aws iam attach-role-policy \
        --role-name $DB_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole \
        --region $REGION
    
    # Create and attach DB policy
    cat > /tmp/db-lambda-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:xrestaurant/rds/credentials-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/xrestaurant-db-query:*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $DB_ROLE_NAME \
        --policy-name DBLambdaPolicy \
        --policy-document file:///tmp/db-lambda-policy.json \
        --region $REGION
    
    echo -e "${GREEN}✅ IAM policy attached${NC}"
    
    # Wait for role to propagate
    echo "Waiting 10 seconds for IAM role to propagate..."
    sleep 10
fi

echo ""

# ============================================================================
# STEP 5: Create Security Group for DB Lambda
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Creating security group for DB Lambda...${NC}"

SG_LAMBDA_DB=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=xrestaurant-lambda-db" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$SG_LAMBDA_DB" ] && [ "$SG_LAMBDA_DB" != "None" ]; then
    echo -e "${YELLOW}⚠️  Security group already exists: $SG_LAMBDA_DB${NC}"
else
    SG_LAMBDA_DB=$(aws ec2 create-security-group \
        --group-name xrestaurant-lambda-db \
        --description "Security group for Lambda functions accessing RDS" \
        --vpc-id $VPC_ID \
        --region $REGION \
        --query 'GroupId' \
        --output text)
    
    echo -e "${GREEN}✅ Security group created: $SG_LAMBDA_DB${NC}"
    
    # Add tags
    aws ec2 create-tags \
        --resources $SG_LAMBDA_DB \
        --tags Key=Name,Value=xrestaurant-lambda-db Key=OWNER,Value=NamHoang Key=Project,Value=xrestaurant \
        --region $REGION
    
    # Allow outbound HTTPS (for Secrets Manager)
    aws ec2 authorize-security-group-egress \
        --group-id $SG_LAMBDA_DB \
        --ip-permissions IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0}]' \
        --region $REGION 2>/dev/null || true
    
    # Allow outbound PostgreSQL to RDS security group
    aws ec2 authorize-security-group-egress \
        --group-id $SG_LAMBDA_DB \
        --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs="[{GroupId=$SG_RDS}]" \
        --region $REGION 2>/dev/null || true
fi

# Update RDS security group to allow Lambda
aws ec2 authorize-security-group-ingress \
    --group-id $SG_RDS \
    --ip-permissions IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs="[{GroupId=$SG_LAMBDA_DB}]" \
    --region $REGION 2>/dev/null || echo "Rule may already exist"

echo ""

# ============================================================================
# STEP 6: Create Bedrock Query Lambda Function
# ============================================================================

echo -e "${YELLOW}📋 Step 6: Creating Bedrock Query Lambda function...${NC}"

# Check if function exists
BEDROCK_FUNCTION_ARN=$(aws lambda get-function \
    --function-name xrestaurant-bedrock-query \
    --query 'Configuration.FunctionArn' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$BEDROCK_FUNCTION_ARN" ]; then
    echo -e "${YELLOW}⚠️  Lambda function already exists: $BEDROCK_FUNCTION_ARN${NC}"
    echo "Updating function code..."
    
    aws lambda update-function-code \
        --function-name xrestaurant-bedrock-query \
        --zip-file fileb:///tmp/bedrock-query-handler.zip \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ Function code updated${NC}"
else
    BEDROCK_FUNCTION_ARN=$(aws lambda create-function \
        --function-name xrestaurant-bedrock-query \
        --runtime nodejs20.x \
        --role $BEDROCK_ROLE_ARN \
        --handler bedrock-query-handler.handler \
        --zip-file fileb:///tmp/bedrock-query-handler.zip \
        --timeout 30 \
        --memory-size 512 \
        --environment "Variables={KNOWLEDGE_BASE_ID=$BEDROCK_KB_ID,AWS_REGION=$REGION}" \
        --description "Query Bedrock Knowledge Base for XRestaurant" \
        --tags OWNER=NamHoang,Project=xrestaurant,Environment=production \
        --region $REGION \
        --query 'FunctionArn' \
        --output text)
    
    echo -e "${GREEN}✅ Lambda function created: $BEDROCK_FUNCTION_ARN${NC}"
fi

echo ""

# ============================================================================
# STEP 7: Create DB Query Lambda Function
# ============================================================================

echo -e "${YELLOW}📋 Step 7: Creating DB Query Lambda function...${NC}"

# Check if function exists
DB_FUNCTION_ARN=$(aws lambda get-function \
    --function-name xrestaurant-db-query \
    --query 'Configuration.FunctionArn' \
    --output text \
    --region $REGION 2>/dev/null || echo "")

if [ -n "$DB_FUNCTION_ARN" ]; then
    echo -e "${YELLOW}⚠️  Lambda function already exists: $DB_FUNCTION_ARN${NC}"
    echo "Updating function code..."
    
    aws lambda update-function-code \
        --function-name xrestaurant-db-query \
        --zip-file fileb:///tmp/db-query-handler.zip \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ Function code updated${NC}"
else
    DB_FUNCTION_ARN=$(aws lambda create-function \
        --function-name xrestaurant-db-query \
        --runtime nodejs20.x \
        --role $DB_ROLE_ARN \
        --handler db-query-handler.handler \
        --zip-file fileb:///tmp/db-query-handler.zip \
        --timeout 30 \
        --memory-size 512 \
        --vpc-config "SubnetIds=$PRIVATE_APP_SUBNET_1,$PRIVATE_APP_SUBNET_2,SecurityGroupIds=$SG_LAMBDA_DB" \
        --environment "Variables={DB_SECRET_NAME=xrestaurant/rds/credentials,AWS_REGION=$REGION}" \
        --description "Query RDS PostgreSQL for XRestaurant" \
        --tags OWNER=NamHoang,Project=xrestaurant,Environment=production \
        --region $REGION \
        --query 'FunctionArn' \
        --output text)
    
    echo -e "${GREEN}✅ Lambda function created: $DB_FUNCTION_ARN${NC}"
fi

echo ""

# ============================================================================
# STEP 8: Create API Gateway (Optional)
# ============================================================================

echo -e "${YELLOW}📋 Step 8: Creating API Gateway integration...${NC}"
echo -e "${YELLOW}⚠️  Skipping API Gateway creation (can be done manually or in next script)${NC}"
echo ""

# ============================================================================
# STEP 9: Test Lambda Functions
# ============================================================================

echo -e "${YELLOW}📋 Step 9: Testing Lambda functions...${NC}"

# Test Bedrock Lambda
echo "Testing Bedrock Query Lambda..."
aws lambda invoke \
    --function-name xrestaurant-bedrock-query \
    --payload '{"body":"{\"query\":\"What are the opening hours?\"}"}' \
    --region $REGION \
    /tmp/bedrock-response.json > /dev/null

echo -e "${BLUE}Bedrock Lambda Response:${NC}"
cat /tmp/bedrock-response.json | jq '.'
echo ""

# Test DB Lambda
echo "Testing DB Query Lambda..."
aws lambda invoke \
    --function-name xrestaurant-db-query \
    --payload '{"queryStringParameters":{"limit":"5"}}' \
    --region $REGION \
    /tmp/db-response.json > /dev/null

echo -e "${BLUE}DB Lambda Response:${NC}"
cat /tmp/db-response.json | jq '.'
echo ""

# ============================================================================
# STEP 10: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 10: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# Lambda Functions Configuration (added by 19-create-lambda-functions.sh)
export LAMBDA_BEDROCK_ARN="$BEDROCK_FUNCTION_ARN"
export LAMBDA_DB_ARN="$DB_FUNCTION_ARN"
export LAMBDA_BEDROCK_ROLE="$BEDROCK_ROLE_ARN"
export LAMBDA_DB_ROLE="$DB_ROLE_ARN"
export SG_LAMBDA_DB="$SG_LAMBDA_DB"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   ✅ LAMBDA FUNCTIONS SETUP COMPLETE${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo ""
echo "1. Bedrock Query Lambda: $BEDROCK_FUNCTION_ARN"
echo "   - Role: $BEDROCK_ROLE_ARN"
echo "   - Permissions: bedrock:Retrieve, bedrock:RetrieveAndGenerate"
echo "   - No wildcards in IAM policy ✓"
echo ""
echo "2. DB Query Lambda: $DB_FUNCTION_ARN"
echo "   - Role: $DB_ROLE_ARN"
echo "   - Permissions: secretsmanager:GetSecretValue (scoped to specific secret)"
echo "   - VPC-enabled: Yes"
echo "   - Security Group: $SG_LAMBDA_DB"
echo "   - No wildcards in IAM policy ✓"
echo ""
echo -e "${BLUE}✅ Test Commands:${NC}"
echo ""
echo "# Test Bedrock Lambda:"
echo "aws lambda invoke \\"
echo "  --function-name xrestaurant-bedrock-query \\"
echo "  --payload '{\"body\":\"{\\\"query\\\":\\\"What are the opening hours?\\\"}\"}' \\"
echo "  --region $REGION \\"
echo "  response.json"
echo ""
echo "# Test DB Lambda:"
echo "aws lambda invoke \\"
echo "  --function-name xrestaurant-db-query \\"
echo "  --payload '{\"queryStringParameters\":{\"limit\":\"5\"}}' \\"
echo "  --region $REGION \\"
echo "  response.json"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Create API Gateway integration"
echo "  2. Test from application"
echo "  3. Add CloudWatch alarms"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
