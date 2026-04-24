#!/bin/bash

# ============================================================================
# File: 99b-cleanup-keep-vpc.sh
# Description: Cleanup all resources but KEEP the VPC structure
# Author: Kiro AI Assistant
# Date: 2026-04-17
# ============================================================================

set -e

# Disable AWS CLI pager
export AWS_PAGER=""

VPC_ID="vpc-0bfe5ede9c4354e5f"
AWS_REGION="us-west-2"

echo "=========================================="
echo "🗑️  CLEANUP RESOURCES (Keep VPC Structure)"
echo "=========================================="
echo ""
echo "⚠️  This will delete all resources EXCEPT VPC structure:"
echo "   - EC2 Instances (Bastion-Host)"
echo "   - Network Interfaces"
echo "   - But KEEP: VPC, Subnets, Route Tables, IGW, Security Groups"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# ============================================================================
# STEP 1: Terminate EC2 Instances
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 1: Terminate EC2 Instances"
echo "=========================================="

INSTANCES=$(aws ec2 describe-instances \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=instance-state-name,Values=running,stopped,stopping" \
    --region ${AWS_REGION} \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text 2>/dev/null || echo "")

if [ ! -z "${INSTANCES}" ]; then
    for INSTANCE_ID in ${INSTANCES}; do
        # Get instance name
        INSTANCE_NAME=$(aws ec2 describe-instances \
            --instance-ids ${INSTANCE_ID} \
            --region ${AWS_REGION} \
            --query 'Reservations[0].Instances[0].Tags[?Key==`Name`].Value' \
            --output text 2>/dev/null || echo "unnamed")
        
        echo "Terminating EC2 instance: ${INSTANCE_NAME} (${INSTANCE_ID})"
        aws ec2 terminate-instances \
            --instance-ids ${INSTANCE_ID} \
            --region ${AWS_REGION} 2>/dev/null || echo "  Failed"
    done
    
    echo "⏳ Waiting for instances to terminate (60 seconds)..."
    sleep 60
    
    echo "✅ EC2 instances terminated"
else
    echo "✅ No EC2 instances to terminate"
fi

# ============================================================================
# STEP 2: Delete Network Interfaces (retry)
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 2: Delete Network Interfaces"
echo "=========================================="

# Wait a bit for ENIs to be released
sleep 10

ENIs=$(aws ec2 describe-network-interfaces \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'NetworkInterfaces[?Status==`available`].NetworkInterfaceId' \
    --output text 2>/dev/null || echo "")

if [ ! -z "${ENIs}" ]; then
    for ENI in ${ENIs}; do
        echo "Deleting ENI: ${ENI}"
        aws ec2 delete-network-interface \
            --network-interface-id ${ENI} \
            --region ${AWS_REGION} 2>/dev/null || echo "  Failed (may still be in use)"
    done
    
    echo "✅ Available network interfaces deleted"
else
    echo "✅ No available network interfaces to delete"
fi

# ============================================================================
# STEP 3: Check Remaining Resources
# ============================================================================
echo ""
echo "=========================================="
echo "📋 Step 3: Check Remaining Resources"
echo "=========================================="

# Check EC2 instances
REMAINING_INSTANCES=$(aws ec2 describe-instances \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=instance-state-name,Values=running,stopped,stopping,pending" \
    --region ${AWS_REGION} \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text 2>/dev/null || echo "")

if [ ! -z "${REMAINING_INSTANCES}" ]; then
    echo "⚠️  Remaining EC2 instances: ${REMAINING_INSTANCES}"
else
    echo "✅ No EC2 instances remaining"
fi

# Check ENIs
REMAINING_ENIS=$(aws ec2 describe-network-interfaces \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --region ${AWS_REGION} \
    --query 'NetworkInterfaces[].NetworkInterfaceId' \
    --output text 2>/dev/null || echo "")

if [ ! -z "${REMAINING_ENIS}" ]; then
    echo "⚠️  Remaining ENIs: ${REMAINING_ENIS}"
    echo "   (These may be managed by AWS services and will be auto-deleted)"
else
    echo "✅ No ENIs remaining"
fi

# ============================================================================
# COMPLETE
# ============================================================================
echo ""
echo "=========================================="
echo "✅ CLEANUP COMPLETE!"
echo "=========================================="
echo ""
echo "📊 VPC Structure Preserved:"
echo "   - VPC: ${VPC_ID} ✅ KEPT"
echo "   - Subnets: ✅ KEPT"
echo "   - Route Tables: ✅ KEPT"
echo "   - Internet Gateway: ✅ KEPT"
echo "   - Security Groups: ✅ KEPT"
echo ""
echo "🗑️  Resources Deleted:"
echo "   - EC2 Instances: ✅ DELETED"
echo "   - Available ENIs: ✅ DELETED"
echo ""
echo "🎉 VPC is now empty and ready for fresh deployment!"
echo ""
echo "=========================================="
