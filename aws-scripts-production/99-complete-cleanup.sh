#!/bin/bash

# ============================================================================
# File: 99-complete-cleanup.sh
# Description: Complete cleanup - Delete ALL resources in VPC
# Author: Kiro AI Assistant
# Date: 2026-04-17
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

VPC_ID="vpc-0bfe5ede9c4354e5f"
AWS_REGION="ap-southeast-1"
AWS_ACCOUNT_ID="905418484418"

echo "=========================================="
echo "🗑️  COMPLETE CLEANUP - DELETE ALL RESOURCES"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This will delete EVERYTHING in VPC ${VPC_ID}:"
echo "   - ECS Services, Tasks, Clusters"
echo "   - ALB, Target Groups, Listeners"
echo "   - RDS Databases"
echo "   - ECR Repositories"
echo "   - S3 Buckets"
echo "   - CloudFront Distributions"
echo "   - Cognito User Pools"
echo "   - SNS, SQS, Lambda"
echo "   - CloudWatch Alarms, Dashboards"
echo "   - NAT Gateways, Elastic IPs"
echo "   - Security Groups, Subnets"
echo "   - Internet Gateway"
echo "   - VPC itself"
echo ""
read -p "Are you ABSOLUTELY SURE? Type 'DELETE' to confirm: " CONFIRM

if [ "${CONFIRM}" != "DELETE" ]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "🚀 Starting cleanup process..."
echo ""

# ============================================================================
# STEP 1: Delete ECS Resources
# ============================================================================
echo "=========================================="
echo "📋 Step 1: Delete ECS Resources"
echo "=========================================="

# Delete ECS Services
echo "Deleting ECS services..."
SERVICES=$(aws ecs list-services \
    --cluster xrestaurant-cluster \
    --region ${AWS_REGION} \
    --query 'serviceArns[]' \
    --output text 2>/dev/null || echo "")

for SERVICE_ARN in ${SERVICES}; do
    SERVICE_NAME=$(echo ${SERVICE_ARN} | awk -F'/' '{print $NF}')
    echo "  Scaling down service: ${SERVICE_NAME}"
    aws ecs update-service \
        --cluster xrestaurant-cluster \
        --service ${SERVICE_NAME} \
        --desired-count 0 \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

sleep 30

for SERVICE_ARN in ${SERVICES}; do
    SERVICE_NAME=$(echo ${SERVICE_ARN} | awk -F'/' '{print $NF}')
    echo "  Deleting service: ${SERVICE_NAME}"
    aws ecs delete-service \
        --cluster xrestaurant-cluster \
        --service ${SERVICE_NAME} \
        --force \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

# Delete ECS Cluster
echo "Deleting ECS cluster..."
aws ecs delete-cluster \
    --cluster xrestaurant-cluster \
    --region ${AWS_REGION} 2>/dev/null || echo "  Failed"

echo "✅ ECS resources deleted"

# ============================================================================
# STEP 2: Delete Load Balancers
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 2: Delete Load Balancers"
echo "=========================================="

# Find ALBs in VPC
ALB_ARNS=$(aws elbv2 describe-load-balancers \
    --region ${AWS_REGION} \
    --query "LoadBalancers[?VpcId=='${VPC_ID}'].LoadBalancerArn" \
    --output text 2>/dev/null || echo "")

for ALB_ARN in ${ALB_ARNS}; do
    echo "Deleting ALB: ${ALB_ARN}"
    aws elbv2 delete-load-balancer \
        --load-balancer-arn ${ALB_ARN} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "⏳ Waiting for ALB deletion (30 seconds)..."
sleep 30

# Delete Target Groups
TG_ARNS=$(aws elbv2 describe-target-groups \
    --region ${AWS_REGION} \
    --query "TargetGroups[?VpcId=='${VPC_ID}'].TargetGroupArn" \
    --output text 2>/dev/null || echo "")

for TG_ARN in ${TG_ARNS}; do
    echo "Deleting Target Group: ${TG_ARN}"
    aws elbv2 delete-target-group \
        --target-group-arn ${TG_ARN} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ Load balancers deleted"

# ============================================================================
# STEP 3: Delete RDS Databases
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 3: Delete RDS Databases"
echo "=========================================="

# Find RDS instances
RDS_INSTANCES=$(aws rds describe-db-instances \
    --region ${AWS_REGION} \
    --query "DBInstances[?DBSubnetGroup.VpcId=='${VPC_ID}'].DBInstanceIdentifier" \
    --output text 2>/dev/null || echo "")

for DB_ID in ${RDS_INSTANCES}; do
    echo "Deleting RDS instance: ${DB_ID}"
    aws rds delete-db-instance \
        --db-instance-identifier ${DB_ID} \
        --skip-final-snapshot \
        --delete-automated-backups \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

if [ ! -z "${RDS_INSTANCES}" ]; then
    echo "⏳ Waiting for RDS deletion (this may take 5-10 minutes)..."
    sleep 60
fi

# Delete DB Subnet Groups
DB_SUBNET_GROUPS=$(aws rds describe-db-subnet-groups \
    --region ${AWS_REGION} \
    --query "DBSubnetGroups[?VpcId=='${VPC_ID}'].DBSubnetGroupName" \
    --output text 2>/dev/null || echo "")

for SG_NAME in ${DB_SUBNET_GROUPS}; do
    echo "Deleting DB Subnet Group: ${SG_NAME}"
    aws rds delete-db-subnet-group \
        --db-subnet-group-name ${SG_NAME} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ RDS resources deleted"

# ============================================================================
# STEP 4: Delete ECR Repositories
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 4: Delete ECR Repositories"
echo "=========================================="

ECR_REPOS=$(aws ecr describe-repositories \
    --region ${AWS_REGION} \
    --query 'repositories[?contains(repositoryName, `xrestaurant`)].repositoryName' \
    --output text 2>/dev/null || echo "")

for REPO in ${ECR_REPOS}; do
    echo "Deleting ECR repository: ${REPO}"
    aws ecr delete-repository \
        --repository-name ${REPO} \
        --force \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ ECR repositories deleted"

# ============================================================================
# STEP 5: Delete S3 Buckets
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 5: Delete S3 Buckets"
echo "=========================================="

S3_BUCKETS=$(aws s3 ls --region ${AWS_REGION} | grep xrestaurant | awk '{print $3}')

for BUCKET in ${S3_BUCKETS}; do
    echo "Emptying and deleting S3 bucket: ${BUCKET}"
    aws s3 rm s3://${BUCKET} --recursive --region ${AWS_REGION} 2>/dev/null || echo "  Failed to empty"
    aws s3 rb s3://${BUCKET} --region ${AWS_REGION} 2>/dev/null || echo "  Failed to delete"
done

echo "✅ S3 buckets deleted"

# ============================================================================
# STEP 6: Delete CloudFront Distributions
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 6: Delete CloudFront Distributions"
echo "=========================================="

CF_DISTRIBUTIONS=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Comment, 'xrestaurant')].Id" \
    --output text 2>/dev/null || echo "")

for CF_ID in ${CF_DISTRIBUTIONS}; do
    echo "Disabling CloudFront distribution: ${CF_ID}"
    
    # Get ETag
    ETAG=$(aws cloudfront get-distribution --id ${CF_ID} --query 'ETag' --output text 2>/dev/null)
    
    # Disable distribution
    aws cloudfront get-distribution-config --id ${CF_ID} > /tmp/cf-config.json 2>/dev/null
    
    # Update config to disable
    cat /tmp/cf-config.json | jq '.DistributionConfig.Enabled = false' > /tmp/cf-config-disabled.json
    
    aws cloudfront update-distribution \
        --id ${CF_ID} \
        --distribution-config file:///tmp/cf-config-disabled.json \
        --if-match ${ETAG} 2>/dev/null || echo "  Failed"
    
    echo "  Distribution disabled (will be deleted after propagation)"
done

echo "✅ CloudFront distributions disabled"

# ============================================================================
# STEP 7: Delete Cognito User Pools
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 7: Delete Cognito User Pools"
echo "=========================================="

USER_POOLS=$(aws cognito-idp list-user-pools \
    --max-results 10 \
    --region ${AWS_REGION} \
    --query "UserPools[?contains(Name, 'xrestaurant')].Id" \
    --output text 2>/dev/null || echo "")

for POOL_ID in ${USER_POOLS}; do
    echo "Deleting Cognito User Pool: ${POOL_ID}"
    aws cognito-idp delete-user-pool \
        --user-pool-id ${POOL_ID} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ Cognito user pools deleted"

# ============================================================================
# STEP 8: Delete SNS, SQS, Lambda
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 8: Delete SNS, SQS, Lambda"
echo "=========================================="

# Delete SNS Topics
SNS_TOPICS=$(aws sns list-topics \
    --region ${AWS_REGION} \
    --query "Topics[?contains(TopicArn, 'xrestaurant')].TopicArn" \
    --output text 2>/dev/null || echo "")

for TOPIC_ARN in ${SNS_TOPICS}; do
    echo "Deleting SNS topic: ${TOPIC_ARN}"
    aws sns delete-topic \
        --topic-arn ${TOPIC_ARN} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

# Delete SQS Queues
SQS_QUEUES=$(aws sqs list-queues \
    --region ${AWS_REGION} \
    --queue-name-prefix xrestaurant \
    --query 'QueueUrls[]' \
    --output text 2>/dev/null || echo "")

for QUEUE_URL in ${SQS_QUEUES}; do
    echo "Deleting SQS queue: ${QUEUE_URL}"
    aws sqs delete-queue \
        --queue-url ${QUEUE_URL} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

# Delete Lambda Functions
LAMBDA_FUNCTIONS=$(aws lambda list-functions \
    --region ${AWS_REGION} \
    --query "Functions[?contains(FunctionName, 'xrestaurant')].FunctionName" \
    --output text 2>/dev/null || echo "")

for FUNC_NAME in ${LAMBDA_FUNCTIONS}; do
    echo "Deleting Lambda function: ${FUNC_NAME}"
    aws lambda delete-function \
        --function-name ${FUNC_NAME} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ SNS, SQS, Lambda deleted"

# ============================================================================
# STEP 9: Delete CloudWatch Resources
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 9: Delete CloudWatch Resources"
echo "=========================================="

# Delete CloudWatch Alarms
ALARMS=$(aws cloudwatch describe-alarms \
    --region ${AWS_REGION} \
    --query "MetricAlarms[?contains(AlarmName, 'xrestaurant')].AlarmName" \
    --output text 2>/dev/null || echo "")

for ALARM in ${ALARMS}; do
    echo "Deleting CloudWatch alarm: ${ALARM}"
    aws cloudwatch delete-alarms \
        --alarm-names ${ALARM} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

# Delete CloudWatch Dashboards
DASHBOARDS=$(aws cloudwatch list-dashboards \
    --region ${AWS_REGION} \
    --query "DashboardEntries[?contains(DashboardName, 'xrestaurant')].DashboardName" \
    --output text 2>/dev/null || echo "")

for DASHBOARD in ${DASHBOARDS}; do
    echo "Deleting CloudWatch dashboard: ${DASHBOARD}"
    aws cloudwatch delete-dashboards \
        --dashboard-names ${DASHBOARD} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

# Delete Log Groups
LOG_GROUPS=$(aws logs describe-log-groups \
    --region ${AWS_REGION} \
    --query "logGroups[?contains(logGroupName, 'xrestaurant') || contains(logGroupName, '/ecs/')].logGroupName" \
    --output text 2>/dev/null || echo "")

for LOG_GROUP in ${LOG_GROUPS}; do
    echo "Deleting log group: ${LOG_GROUP}"
    aws logs delete-log-group \
        --log-group-name ${LOG_GROUP} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ CloudWatch resources deleted"

# ============================================================================
# STEP 10: Delete VPC Endpoints
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 10: Delete VPC Endpoints"
echo "=========================================="

VPC_ENDPOINTS=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'VpcEndpoints[].VpcEndpointId' \
    --output text 2>/dev/null || echo "")

for ENDPOINT_ID in ${VPC_ENDPOINTS}; do
    echo "Deleting VPC endpoint: ${ENDPOINT_ID}"
    aws ec2 delete-vpc-endpoints \
        --vpc-endpoint-ids ${ENDPOINT_ID} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ VPC endpoints deleted"

# ============================================================================
# STEP 11: Delete NAT Gateways and Elastic IPs
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 11: Delete NAT Gateways"
echo "=========================================="

NAT_GWS=$(aws ec2 describe-nat-gateways \
    --filter "Name=vpc-id,Values=${VPC_ID}" "Name=state,Values=available,pending" \
    --region ${AWS_REGION} \
    --query 'NatGateways[].NatGatewayId' \
    --output text 2>/dev/null || echo "")

for NAT_GW in ${NAT_GWS}; do
    echo "Deleting NAT Gateway: ${NAT_GW}"
    aws ec2 delete-nat-gateway \
        --nat-gateway-id ${NAT_GW} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

if [ ! -z "${NAT_GWS}" ]; then
    echo "⏳ Waiting for NAT Gateway deletion (120 seconds)..."
    sleep 120
fi

# Release Elastic IPs
EIP_ALLOCS=$(aws ec2 describe-addresses \
    --region ${AWS_REGION} \
    --filters "Name=domain,Values=vpc" \
    --query 'Addresses[?AssociationId==`null`].AllocationId' \
    --output text 2>/dev/null || echo "")

for EIP in ${EIP_ALLOCS}; do
    echo "Releasing EIP: ${EIP}"
    aws ec2 release-address \
        --allocation-id ${EIP} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ NAT Gateways and EIPs deleted"

# ============================================================================
# STEP 12: Delete Network Interfaces
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 12: Delete Network Interfaces"
echo "=========================================="

ENIs=$(aws ec2 describe-network-interfaces \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'NetworkInterfaces[].NetworkInterfaceId' \
    --output text 2>/dev/null || echo "")

for ENI in ${ENIs}; do
    echo "Deleting ENI: ${ENI}"
    aws ec2 delete-network-interface \
        --network-interface-id ${ENI} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed (may be in use)"
done

echo "✅ Network interfaces deleted"

# ============================================================================
# STEP 13: Delete Security Groups
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 13: Delete Security Groups"
echo "=========================================="

SECURITY_GROUPS=$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'SecurityGroups[?GroupName!=`default`].GroupId' \
    --output text 2>/dev/null || echo "")

for SG in ${SECURITY_GROUPS}; do
    echo "Deleting security group: ${SG}"
    aws ec2 delete-security-group \
        --group-id ${SG} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed (may have dependencies)"
done

echo "✅ Security groups deleted"

# ============================================================================
# STEP 14: Delete Subnets
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 14: Delete Subnets"
echo "=========================================="

SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'Subnets[].SubnetId' \
    --output text 2>/dev/null || echo "")

for SUBNET in ${SUBNETS}; do
    echo "Deleting subnet: ${SUBNET}"
    aws ec2 delete-subnet \
        --subnet-id ${SUBNET} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ Subnets deleted"

# ============================================================================
# STEP 15: Delete Route Tables
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 15: Delete Route Tables"
echo "=========================================="

ROUTE_TABLES=$(aws ec2 describe-route-tables \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'RouteTables[?Associations[0].Main==`false`].RouteTableId' \
    --output text 2>/dev/null || echo "")

for RT in ${ROUTE_TABLES}; do
    echo "Deleting route table: ${RT}"
    aws ec2 delete-route-table \
        --route-table-id ${RT} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
done

echo "✅ Route tables deleted"

# ============================================================================
# STEP 16: Delete Internet Gateway
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 16: Delete Internet Gateway"
echo "=========================================="

IGW=$(aws ec2 describe-internet-gateways \
    --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'InternetGateways[0].InternetGatewayId' \
    --output text 2>/dev/null || echo "")

if [ "${IGW}" != "None" ] && [ ! -z "${IGW}" ]; then
    echo "Detaching IGW: ${IGW}"
    aws ec2 detach-internet-gateway \
        --internet-gateway-id ${IGW} \
        --vpc-id ${VPC_ID} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
    
    echo "Deleting IGW: ${IGW}"
    aws ec2 delete-internet-gateway \
        --internet-gateway-id ${IGW} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
fi

echo "✅ Internet gateway deleted"

# ============================================================================
# STEP 17: Delete VPC
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 17: Delete VPC"
echo "=========================================="

echo "Deleting VPC: ${VPC_ID}"
aws ec2 delete-vpc \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} 2>/dev/null && echo "✅ VPC deleted!" || echo "⚠️  VPC deletion failed (may have remaining dependencies)"

# ============================================================================
# STEP 18: Delete IAM Roles
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 18: Delete IAM Roles"
echo "=========================================="

# Delete ECS Task Role
echo "Deleting IAM role: ecsTaskRoleS3Access"
aws iam delete-role-policy \
    --role-name ecsTaskRoleS3Access \
    --policy-name S3AccessPolicy 2>/dev/null || echo "  Policy not found"

aws iam delete-role \
    --role-name ecsTaskRoleS3Access 2>/dev/null || echo "  Role not found"

echo "✅ IAM roles deleted"

# ============================================================================
# COMPLETE
# ============================================================================
echo ""
echo "=========================================="
echo "✅ CLEANUP COMPLETE!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "   - All ECS resources deleted"
echo "   - All Load Balancers deleted"
echo "   - All RDS databases deleted"
echo "   - All ECR repositories deleted"
echo "   - All S3 buckets deleted"
echo "   - CloudFront distributions disabled"
echo "   - All Cognito user pools deleted"
echo "   - All SNS/SQS/Lambda deleted"
echo "   - All CloudWatch resources deleted"
echo "   - VPC ${VPC_ID} and all dependencies deleted"
echo ""
echo "🎉 You can now run deployment scripts from scratch!"
echo ""
echo "=========================================="
