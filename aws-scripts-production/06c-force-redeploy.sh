#!/bin/bash

# ============================================================================
# Script: 06c-force-redeploy.sh
# Description: Force ECS to pull new image and redeploy
# Author: Kiro AI Assistant
# Date: 2026-04-17
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REGION="ap-southeast-1"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   Force ECS Redeployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Load config
if [ -f "./vpc-config.sh" ]; then
    source ./vpc-config.sh
else
    echo -e "${RED}❌ Error: vpc-config.sh not found!${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Forcing new deployment...${NC}"
echo -e "${YELLOW}   This will pull the latest :rds image from ECR${NC}"
echo ""

aws ecs update-service \
    --cluster $ECS_CLUSTER \
    --service $ECS_SERVICE \
    --force-new-deployment \
    --region $REGION > /dev/null

echo -e "${GREEN}✅ Deployment triggered${NC}"
echo ""

echo -e "${YELLOW}📋 Waiting for new tasks to start (2-3 minutes)...${NC}"
echo ""

sleep 10

echo -e "${YELLOW}📋 Current deployment status:${NC}"
aws ecs describe-services \
    --cluster $ECS_CLUSTER \
    --services $ECS_SERVICE \
    --region $REGION \
    --query 'services[0].deployments[*].[status,desiredCount,runningCount,createdAt]' \
    --output table

echo ""
echo -e "${GREEN}✅ Deployment in progress!${NC}"
echo ""
echo -e "${YELLOW}📝 Monitor logs:${NC}"
echo -e "   aws logs tail /ecs/xrestaurant-backend --follow --region ap-southeast-1"
echo ""
echo -e "${YELLOW}📝 Look for:${NC}"
echo -e "   - New task ID starting"
echo -e "   - Message: ✅ Connected to PostgreSQL database"
echo -e "   - Health check returning 200 (not 500)"
echo ""
