#!/bin/bash

# ============================================================================
# Script: 03-create-rds.sh
# Description: Tạo RDS PostgreSQL cho XRestaurant (demo architecture)
# Note: Backend vẫn dùng mock data, RDS chỉ để show architecture
# Author: Kiro AI Assistant
# Date: 2026-04-16
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
DB_INSTANCE_ID="xrestaurant-db"
DB_NAME="xrestaurant"
DB_USERNAME="xrestaurant_admin"
DB_PASSWORD="XRestaurant2026!"  # Change this in production!
DB_SUBNET_GROUP="xrestaurant-db-subnet-group"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   RDS PostgreSQL Setup${NC}"
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
# STEP 2: Create DB Subnet Group
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Creating DB Subnet Group...${NC}"

# Check if subnet group exists
EXISTING_SUBNET_GROUP=$(aws rds describe-db-subnet-groups \
    --db-subnet-group-name $DB_SUBNET_GROUP \
    --region $REGION \
    --query 'DBSubnetGroups[0].DBSubnetGroupName' \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_SUBNET_GROUP" != "None" ] && [ -n "$EXISTING_SUBNET_GROUP" ]; then
    echo -e "${YELLOW}⚠️  DB Subnet Group already exists${NC}"
else
    aws rds create-db-subnet-group \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --db-subnet-group-description "Subnet group for XRestaurant RDS" \
        --subnet-ids $PRIVATE_DATA_SUBNET_1 $PRIVATE_DATA_SUBNET_2 \
        --tags Key=OWNER,Value=NamHoang Key=Project,Value=xrestaurant Key=Environment,Value=production \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ DB Subnet Group created${NC}"
fi

echo -e "${GREEN}   Subnet Group: $DB_SUBNET_GROUP${NC}"
echo -e "${GREEN}   Subnets: $PRIVATE_DATA_SUBNET_1, $PRIVATE_DATA_SUBNET_2${NC}"
echo ""

# ============================================================================
# STEP 3: Create RDS PostgreSQL Instance
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating RDS PostgreSQL instance...${NC}"
echo -e "${YELLOW}   This may take 10-15 minutes...${NC}"

# Check if RDS instance exists
EXISTING_RDS=$(aws rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE_ID \
    --region $REGION \
    --query 'DBInstances[0].DBInstanceIdentifier' \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_RDS" != "None" ] && [ -n "$EXISTING_RDS" ]; then
    echo -e "${YELLOW}⚠️  RDS instance already exists${NC}"
    
    # Get RDS endpoint
    RDS_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    RDS_PORT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].Endpoint.Port' \
        --output text)
    
    echo -e "${GREEN}   Endpoint: $RDS_ENDPOINT${NC}"
    echo -e "${GREEN}   Port: $RDS_PORT${NC}"
else
    aws rds create-db-instance \
        --db-instance-identifier $DB_INSTANCE_ID \
        --db-instance-class db.t3.micro \
        --engine postgres \
        --engine-version 15.10 \
        --master-username $DB_USERNAME \
        --master-user-password $DB_PASSWORD \
        --allocated-storage 20 \
        --storage-type gp3 \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --vpc-security-group-ids $SG_RDS \
        --backup-retention-period 7 \
        --preferred-backup-window "03:00-04:00" \
        --preferred-maintenance-window "mon:04:00-mon:05:00" \
        --multi-az \
        --no-publicly-accessible \
        --db-name $DB_NAME \
        --tags Key=OWNER,Value=NamHoang Key=Project,Value=xrestaurant Key=Environment,Value=production \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ RDS instance creation initiated${NC}"
    echo -e "${YELLOW}   Waiting for RDS to become available (this takes ~10 minutes)...${NC}"
    
    # Wait for RDS to be available
    aws rds wait db-instance-available \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION
    
    # Get RDS endpoint
    RDS_ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    RDS_PORT=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].Endpoint.Port' \
        --output text)
    
    echo -e "${GREEN}✅ RDS instance is now available${NC}"
    echo -e "${GREEN}   Endpoint: $RDS_ENDPOINT${NC}"
    echo -e "${GREEN}   Port: $RDS_PORT${NC}"
fi

echo ""

# ============================================================================
# STEP 4: Store DB Password in Secrets Manager (Optional)
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Storing DB credentials in Secrets Manager...${NC}"

SECRET_NAME="xrestaurant/rds/credentials"

# Check if secret exists
EXISTING_SECRET=$(aws secretsmanager describe-secret \
    --secret-id $SECRET_NAME \
    --region $REGION \
    --query 'Name' \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_SECRET" != "None" ] && [ -n "$EXISTING_SECRET" ]; then
    echo -e "${YELLOW}⚠️  Secret already exists${NC}"
else
    # Create secret
    SECRET_VALUE=$(cat <<EOF
{
  "username": "$DB_USERNAME",
  "password": "$DB_PASSWORD",
  "engine": "postgres",
  "host": "$RDS_ENDPOINT",
  "port": $RDS_PORT,
  "dbname": "$DB_NAME"
}
EOF
)

    aws secretsmanager create-secret \
        --name $SECRET_NAME \
        --description "RDS credentials for XRestaurant" \
        --secret-string "$SECRET_VALUE" \
        --tags Key=OWNER,Value=NamHoang Key=Project,Value=xrestaurant \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ Secret created in Secrets Manager${NC}"
fi

echo -e "${GREEN}   Secret Name: $SECRET_NAME${NC}"
echo ""

# ============================================================================
# STEP 5: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# RDS Configuration (added by 03-create-rds.sh)
export DB_INSTANCE_ID="$DB_INSTANCE_ID"
export DB_NAME="$DB_NAME"
export DB_USERNAME="$DB_USERNAME"
export DB_ENDPOINT="$RDS_ENDPOINT"
export DB_PORT="$RDS_PORT"
export DB_SECRET_NAME="$SECRET_NAME"
export DB_SUBNET_GROUP="$DB_SUBNET_GROUP"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ RDS POSTGRESQL SETUP COMPLETE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}📋 Summary:${NC}"
echo ""
echo -e "${GREEN}🗄️  RDS Instance:${NC}"
echo -e "   Instance ID: $DB_INSTANCE_ID"
echo -e "   Engine: PostgreSQL 15.10"
echo -e "   Instance Class: db.t3.micro"
echo -e "   Storage: 20 GB (gp3)"
echo -e "   Multi-AZ: Enabled (High Availability)"
echo ""
echo -e "${GREEN}🔗 Connection:${NC}"
echo -e "   Endpoint: $RDS_ENDPOINT"
echo -e "   Port: $RDS_PORT"
echo -e "   Database: $DB_NAME"
echo -e "   Username: $DB_USERNAME"
echo -e "   Password: $DB_PASSWORD"
echo ""
echo -e "${GREEN}🔒 Security:${NC}"
echo -e "   Location: Private subnets (no public access)"
echo -e "   Security Group: $SG_RDS"
echo -e "   Credentials: Stored in Secrets Manager"
echo -e "   Secret Name: $SECRET_NAME"
echo ""
echo -e "${GREEN}💾 Backup:${NC}"
echo -e "   Retention: 7 days"
echo -e "   Backup Window: 03:00-04:00 UTC"
echo -e "   Maintenance Window: Monday 04:00-05:00 UTC"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "   1. Connect from ECS (backend):"
echo -e "      Connection string:"
echo -e "      postgresql://$DB_USERNAME:$DB_PASSWORD@$RDS_ENDPOINT:$RDS_PORT/$DB_NAME"
echo ""
echo -e "   2. Test connection from bastion/ECS:"
echo -e "      psql -h $RDS_ENDPOINT -U $DB_USERNAME -d $DB_NAME"
echo ""
echo -e "   3. Get credentials from Secrets Manager:"
echo -e "      aws secretsmanager get-secret-value \\"
echo -e "        --secret-id $SECRET_NAME \\"
echo -e "        --region $REGION \\"
echo -e "        --query SecretString \\"
echo -e "        --output text"
echo ""
echo -e "   4. Create tables (when ready to use):"
echo -e "      psql -h $RDS_ENDPOINT -U $DB_USERNAME -d $DB_NAME -f schema.sql"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NOTES:${NC}"
echo -e "${YELLOW}   - RDS is in PRIVATE subnets (no internet access)${NC}"
echo -e "${YELLOW}   - Only ECS tasks can connect (via SG_RDS)${NC}"
echo -e "${YELLOW}   - Password is stored in Secrets Manager${NC}"
echo -e "${YELLOW}   - Backend currently uses MOCK DATA (not connected to RDS)${NC}"
echo -e "${YELLOW}   - RDS is ready for future use when needed${NC}"
echo ""
echo -e "${GREEN}🔧 Useful Commands:${NC}"
echo -e "   # Check RDS status:"
echo -e "   aws rds describe-db-instances \\"
echo -e "     --db-instance-identifier $DB_INSTANCE_ID \\"
echo -e "     --region $REGION"
echo ""
echo -e "   # Get connection info:"
echo -e "   aws rds describe-db-instances \\"
echo -e "     --db-instance-identifier $DB_INSTANCE_ID \\"
echo -e "     --query 'DBInstances[0].Endpoint' \\"
echo -e "     --region $REGION"
echo ""
echo -e "   # Stop RDS (to save cost when not using):"
echo -e "   aws rds stop-db-instance \\"
echo -e "     --db-instance-identifier $DB_INSTANCE_ID \\"
echo -e "     --region $REGION"
echo ""
echo -e "   # Start RDS:"
echo -e "   aws rds start-db-instance \\"
echo -e "     --db-instance-identifier $DB_INSTANCE_ID \\"
echo -e "     --region $REGION"
echo ""
echo -e "   # Delete RDS (when done with demo):"
echo -e "   aws rds delete-db-instance \\"
echo -e "     --db-instance-identifier $DB_INSTANCE_ID \\"
echo -e "     --skip-final-snapshot \\"
echo -e "     --region $REGION"
echo ""
echo -e "${GREEN}💰 Cost Estimate:${NC}"
echo -e "   db.t3.micro Multi-AZ: ~\$0.036/hour (~\$26/month)"
echo -e "   Storage 20GB: ~\$2.30/month"
echo -e "   Total: ~\$28/month"
echo -e "   Note: AWS Academy account is FREE for 72 hours"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
