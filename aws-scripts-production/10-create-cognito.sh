#!/bin/bash

# ============================================================================
# Script: 12-create-cognito.sh
# Description: Tạo Amazon Cognito User Pool cho XRestaurant Authentication
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
REGION="us-west-2"
USER_POOL_NAME="xrestaurant-users"
APP_CLIENT_NAME="xrestaurant-web-client"
DOMAIN_PREFIX="xrestaurant-$(date +%s)"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Amazon Cognito Setup${NC}"
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

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}   Account ID: $ACCOUNT_ID${NC}"
echo ""

# ============================================================================
# STEP 2: Create Cognito User Pool
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Creating Cognito User Pool...${NC}"

# Check if user pool already exists
EXISTING_POOL=$(aws cognito-idp list-user-pools \
    --max-results 60 \
    --region $REGION \
    --query "UserPools[?Name=='$USER_POOL_NAME'].Id" \
    --output text 2>/dev/null || echo "")

EXISTING_POOL=$(echo "$EXISTING_POOL" | tr -d '[:space:]')

if [ -n "$EXISTING_POOL" ] && [ "$EXISTING_POOL" != "None" ]; then
    echo -e "${YELLOW}⚠️  User Pool already exists${NC}"
    USER_POOL_ID=$EXISTING_POOL
    
    # Get User Pool ARN
    USER_POOL_ARN=$(aws cognito-idp describe-user-pool \
        --user-pool-id $USER_POOL_ID \
        --region $REGION \
        --query 'UserPool.Arn' \
        --output text)
    
    echo -e "${GREEN}   User Pool ID: $USER_POOL_ID${NC}"
    echo -e "${GREEN}   User Pool ARN: $USER_POOL_ARN${NC}"
else
    # Create User Pool
    USER_POOL_ID=$(aws cognito-idp create-user-pool \
        --pool-name $USER_POOL_NAME \
        --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
        --auto-verified-attributes email \
        --username-attributes email \
        --mfa-configuration OFF \
        --account-recovery-setting "RecoveryMechanisms=[{Priority=1,Name=verified_email}]" \
        --user-attribute-update-settings "AttributesRequireVerificationBeforeUpdate=[email]" \
        --schema \
            "Name=email,AttributeDataType=String,Required=true,Mutable=true" \
            "Name=name,AttributeDataType=String,Required=true,Mutable=true" \
            "Name=phone_number,AttributeDataType=String,Required=false,Mutable=true" \
        --region $REGION \
        --query 'UserPool.Id' \
        --output text)
    
    # Get User Pool ARN
    USER_POOL_ARN=$(aws cognito-idp describe-user-pool \
        --user-pool-id $USER_POOL_ID \
        --region $REGION \
        --query 'UserPool.Arn' \
        --output text)
    
    echo -e "${GREEN}✅ User Pool created${NC}"
    echo -e "${GREEN}   User Pool ID: $USER_POOL_ID${NC}"
    echo -e "${GREEN}   User Pool ARN: $USER_POOL_ARN${NC}"
fi

echo ""

# ============================================================================
# STEP 3: Create User Pool Domain
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating User Pool Domain...${NC}"

# Check if domain already exists
EXISTING_DOMAIN=$(aws cognito-idp describe-user-pool \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --query 'UserPool.Domain' \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_DOMAIN" != "None" ] && [ -n "$EXISTING_DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  Domain already exists: $EXISTING_DOMAIN${NC}"
    COGNITO_DOMAIN=$EXISTING_DOMAIN
else
    # Create domain
    aws cognito-idp create-user-pool-domain \
        --domain $DOMAIN_PREFIX \
        --user-pool-id $USER_POOL_ID \
        --region $REGION > /dev/null
    
    COGNITO_DOMAIN=$DOMAIN_PREFIX
    echo -e "${GREEN}✅ Domain created: $COGNITO_DOMAIN${NC}"
fi

HOSTED_UI_URL="https://${COGNITO_DOMAIN}.auth.${REGION}.amazoncognito.com"
echo -e "${GREEN}   Hosted UI URL: $HOSTED_UI_URL${NC}"
echo ""

# ============================================================================
# STEP 4: Create App Client
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating App Client...${NC}"

# Check if app client already exists
EXISTING_CLIENT=$(aws cognito-idp list-user-pool-clients \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --query "UserPoolClients[?ClientName=='$APP_CLIENT_NAME'].ClientId" \
    --output text 2>/dev/null || echo "")

EXISTING_CLIENT=$(echo "$EXISTING_CLIENT" | tr -d '[:space:]')

if [ -n "$EXISTING_CLIENT" ] && [ "$EXISTING_CLIENT" != "None" ]; then
    echo -e "${YELLOW}⚠️  App Client already exists${NC}"
    APP_CLIENT_ID=$EXISTING_CLIENT
    
    # Get client secret
    APP_CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
        --user-pool-id $USER_POOL_ID \
        --client-id $APP_CLIENT_ID \
        --region $REGION \
        --query 'UserPoolClient.ClientSecret' \
        --output text 2>/dev/null || echo "None")
    
    echo -e "${GREEN}   App Client ID: $APP_CLIENT_ID${NC}"
else
    # Get CloudFront URL for callback
    if [ -n "$CLOUDFRONT_DOMAIN" ]; then
        CALLBACK_URL="https://${CLOUDFRONT_DOMAIN}/callback"
        LOGOUT_URL="https://${CLOUDFRONT_DOMAIN}/logout"
    else
        CALLBACK_URL="http://localhost:3000/callback"
        LOGOUT_URL="http://localhost:3000/logout"
    fi
    
    # Create app client
    APP_CLIENT_OUTPUT=$(aws cognito-idp create-user-pool-client \
        --user-pool-id $USER_POOL_ID \
        --client-name $APP_CLIENT_NAME \
        --generate-secret \
        --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
        --supported-identity-providers COGNITO \
        --callback-urls "$CALLBACK_URL" "http://localhost:3000/callback" \
        --logout-urls "$LOGOUT_URL" "http://localhost:3000/logout" \
        --allowed-o-auth-flows code implicit \
        --allowed-o-auth-scopes openid email profile \
        --allowed-o-auth-flows-user-pool-client \
        --region $REGION \
        --output json)
    
    APP_CLIENT_ID=$(echo "$APP_CLIENT_OUTPUT" | grep -o '"ClientId": "[^"]*"' | cut -d'"' -f4)
    APP_CLIENT_SECRET=$(echo "$APP_CLIENT_OUTPUT" | grep -o '"ClientSecret": "[^"]*"' | cut -d'"' -f4)
    
    echo -e "${GREEN}✅ App Client created${NC}"
    echo -e "${GREEN}   App Client ID: $APP_CLIENT_ID${NC}"
    echo -e "${GREEN}   App Client Secret: $APP_CLIENT_SECRET${NC}"
fi

echo ""

# ============================================================================
# STEP 5: Create User Groups
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Creating User Groups...${NC}"

# Create Admin group
ADMIN_GROUP_EXISTS=$(aws cognito-idp list-groups \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --query "Groups[?GroupName=='Admins'].GroupName" \
    --output text 2>/dev/null || echo "")

if [ -z "$ADMIN_GROUP_EXISTS" ]; then
    aws cognito-idp create-group \
        --group-name Admins \
        --user-pool-id $USER_POOL_ID \
        --description "Restaurant administrators with full access" \
        --precedence 1 \
        --region $REGION > /dev/null
    echo -e "${GREEN}✅ Admin group created${NC}"
else
    echo -e "${YELLOW}⚠️  Admin group already exists${NC}"
fi

# Create Staff group
STAFF_GROUP_EXISTS=$(aws cognito-idp list-groups \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --query "Groups[?GroupName=='Staff'].GroupName" \
    --output text 2>/dev/null || echo "")

if [ -z "$STAFF_GROUP_EXISTS" ]; then
    aws cognito-idp create-group \
        --group-name Staff \
        --user-pool-id $USER_POOL_ID \
        --description "Restaurant staff (waiters, kitchen)" \
        --precedence 2 \
        --region $REGION > /dev/null
    echo -e "${GREEN}✅ Staff group created${NC}"
else
    echo -e "${YELLOW}⚠️  Staff group already exists${NC}"
fi

# Create Customers group
CUSTOMER_GROUP_EXISTS=$(aws cognito-idp list-groups \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --query "Groups[?GroupName=='Customers'].GroupName" \
    --output text 2>/dev/null || echo "")

if [ -z "$CUSTOMER_GROUP_EXISTS" ]; then
    aws cognito-idp create-group \
        --group-name Customers \
        --user-pool-id $USER_POOL_ID \
        --description "Restaurant customers" \
        --precedence 3 \
        --region $REGION > /dev/null
    echo -e "${GREEN}✅ Customer group created${NC}"
else
    echo -e "${YELLOW}⚠️  Customer group already exists${NC}"
fi

echo ""

# ============================================================================
# STEP 6: Create IAM Roles for Cognito Identity Pool (Optional)
# ============================================================================

echo -e "${YELLOW}📋 Step 6: Creating IAM Roles for authenticated users...${NC}"

# Create authenticated role
AUTH_ROLE_NAME="Cognito_XRestaurant_Auth_Role"

AUTH_ROLE_EXISTS=$(aws iam get-role \
    --role-name $AUTH_ROLE_NAME \
    --region $REGION \
    --query 'Role.Arn' \
    --output text 2>/dev/null || echo "")

if [ -z "$AUTH_ROLE_EXISTS" ]; then
    # Create trust policy
    cat > /tmp/cognito-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "$USER_POOL_ID"
        }
      }
    }
  ]
}
EOF

    AUTH_ROLE_ARN=$(aws iam create-role \
        --role-name $AUTH_ROLE_NAME \
        --assume-role-policy-document file:///tmp/cognito-trust-policy.json \
        --description "Role for authenticated Cognito users" \
        --query 'Role.Arn' \
        --output text)
    
    # Attach basic policy
    cat > /tmp/cognito-auth-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::xrestaurant-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "execute-api:Invoke"
      ],
      "Resource": "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:*/*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $AUTH_ROLE_NAME \
        --policy-name CognitoAuthPolicy \
        --policy-document file:///tmp/cognito-auth-policy.json
    
    echo -e "${GREEN}✅ IAM Role created: $AUTH_ROLE_ARN${NC}"
else
    AUTH_ROLE_ARN=$AUTH_ROLE_EXISTS
    echo -e "${YELLOW}⚠️  IAM Role already exists: $AUTH_ROLE_ARN${NC}"
fi

echo ""

# ============================================================================
# STEP 7: Create Test User (Optional)
# ============================================================================

echo -e "${YELLOW}📋 Step 7: Creating test user...${NC}"

TEST_USER_EMAIL="admin@xrestaurant.com"
TEST_USER_PASSWORD="Admin@123"

# Check if user exists
USER_EXISTS=$(aws cognito-idp list-users \
    --user-pool-id $USER_POOL_ID \
    --region $REGION \
    --filter "email = \"$TEST_USER_EMAIL\"" \
    --query 'Users[0].Username' \
    --output text 2>/dev/null || echo "None")

if [ "$USER_EXISTS" == "None" ] || [ -z "$USER_EXISTS" ]; then
    # Create user
    aws cognito-idp admin-create-user \
        --user-pool-id $USER_POOL_ID \
        --username $TEST_USER_EMAIL \
        --user-attributes Name=email,Value=$TEST_USER_EMAIL Name=email_verified,Value=true Name=name,Value="Admin User" \
        --temporary-password $TEST_USER_PASSWORD \
        --message-action SUPPRESS \
        --region $REGION > /dev/null
    
    # Set permanent password
    aws cognito-idp admin-set-user-password \
        --user-pool-id $USER_POOL_ID \
        --username $TEST_USER_EMAIL \
        --password $TEST_USER_PASSWORD \
        --permanent \
        --region $REGION > /dev/null
    
    # Add to Admins group
    aws cognito-idp admin-add-user-to-group \
        --user-pool-id $USER_POOL_ID \
        --username $TEST_USER_EMAIL \
        --group-name Admins \
        --region $REGION
    
    echo -e "${GREEN}✅ Test user created${NC}"
    echo -e "${GREEN}   Email: $TEST_USER_EMAIL${NC}"
    echo -e "${GREEN}   Password: $TEST_USER_PASSWORD${NC}"
    echo -e "${GREEN}   Group: Admins${NC}"
else
    echo -e "${YELLOW}⚠️  Test user already exists: $TEST_USER_EMAIL${NC}"
fi

echo ""

# ============================================================================
# STEP 8: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 8: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# Cognito Configuration
# Generated: $(date)

export COGNITO_USER_POOL_ID="$USER_POOL_ID"
export COGNITO_USER_POOL_ARN="$USER_POOL_ARN"
export COGNITO_APP_CLIENT_ID="$APP_CLIENT_ID"
export COGNITO_APP_CLIENT_SECRET="$APP_CLIENT_SECRET"
export COGNITO_DOMAIN="$COGNITO_DOMAIN"
export COGNITO_HOSTED_UI_URL="$HOSTED_UI_URL"
export COGNITO_AUTH_ROLE_ARN="$AUTH_ROLE_ARN"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ COGNITO SETUP COMPLETE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}📋 Summary:${NC}"
echo ""
echo -e "${GREEN}👥 User Pool:${NC}"
echo -e "   Name: $USER_POOL_NAME"
echo -e "   ID: $USER_POOL_ID"
echo -e "   ARN: $USER_POOL_ARN"
echo -e "   Region: $REGION"
echo ""
echo -e "${GREEN}📱 App Client:${NC}"
echo -e "   Name: $APP_CLIENT_NAME"
echo -e "   Client ID: $APP_CLIENT_ID"
echo -e "   Client Secret: $APP_CLIENT_SECRET"
echo ""
echo -e "${GREEN}🌐 Hosted UI:${NC}"
echo -e "   Domain: $COGNITO_DOMAIN"
echo -e "   URL: $HOSTED_UI_URL"
echo -e "   Login: $HOSTED_UI_URL/login?client_id=$APP_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback"
echo ""
echo -e "${GREEN}👤 User Groups:${NC}"
echo -e "   1. Admins (precedence: 1)"
echo -e "   2. Staff (precedence: 2)"
echo -e "   3. Customers (precedence: 3)"
echo ""
echo -e "${GREEN}🔑 Test User:${NC}"
echo -e "   Email: $TEST_USER_EMAIL"
echo -e "   Password: $TEST_USER_PASSWORD"
echo -e "   Group: Admins"
echo ""
echo -e "${GREEN}🔒 Security Features:${NC}"
echo -e "   - Password policy: Min 8 chars, uppercase, lowercase, numbers"
echo -e "   - Email verification required"
echo -e "   - MFA: Optional (can be enabled)"
echo -e "   - Account recovery: Email"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "   1. Test Hosted UI login:"
echo -e "      $HOSTED_UI_URL/login?client_id=$APP_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback"
echo ""
echo -e "   2. Integrate with frontend:"
echo -e "      - Install: npm install amazon-cognito-identity-js"
echo -e "      - User Pool ID: $USER_POOL_ID"
echo -e "      - App Client ID: $APP_CLIENT_ID"
echo ""
echo -e "   3. Integrate with backend (JWT verification):"
echo -e "      - JWKS URL: https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json"
echo -e "      - Issuer: https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}"
echo ""
echo -e "   4. Continue with Step 13: ./13-create-sns-sqs-lambda.sh"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NOTES:${NC}"
echo -e "${YELLOW}   - Store Client Secret securely (never commit to git)${NC}"
echo -e "${YELLOW}   - Test user password should be changed in production${NC}"
echo -e "${YELLOW}   - Enable MFA for production environments${NC}"
echo -e "${YELLOW}   - Configure custom email templates for better UX${NC}"
echo ""
echo -e "${GREEN}🔧 Useful Commands:${NC}"
echo -e "   # List users:"
echo -e "   aws cognito-idp list-users --user-pool-id $USER_POOL_ID --region $REGION"
echo ""
echo -e "   # Create new user:"
echo -e "   aws cognito-idp admin-create-user \\"
echo -e "     --user-pool-id $USER_POOL_ID \\"
echo -e "     --username user@example.com \\"
echo -e "     --user-attributes Name=email,Value=user@example.com Name=name,Value=\"User Name\" \\"
echo -e "     --region $REGION"
echo ""
echo -e "   # Add user to group:"
echo -e "   aws cognito-idp admin-add-user-to-group \\"
echo -e "     --user-pool-id $USER_POOL_ID \\"
echo -e "     --username user@example.com \\"
echo -e "     --group-name Customers \\"
echo -e "     --region $REGION"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./11-add-users-to-cognito.sh"
echo ""
echo "=========================================="
