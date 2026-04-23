#!/bin/bash

# ============================================
# Script 16: Create CloudTrail
# ============================================
# Purpose: Setup CloudTrail for audit logging
# - Track all API calls
# - Log to S3 bucket
# - Enable CloudWatch Logs integration
# - Monitor security and compliance
# ============================================

export AWS_PAGER=""

# Source configuration
source ./vpc-config.sh

echo "============================================"
echo "Setting Up CloudTrail Audit Logging"
echo "============================================"

# ============================================
# 1. Create S3 Bucket for CloudTrail Logs
# ============================================

echo ""
echo "Step 1: Creating S3 bucket for CloudTrail logs..."

TRAIL_BUCKET_NAME="xrestaurant-cloudtrail-${ACCOUNT_ID}"

# Check if bucket exists
if aws s3 ls "s3://${TRAIL_BUCKET_NAME}" 2>/dev/null; then
    echo "✓ S3 bucket already exists: ${TRAIL_BUCKET_NAME}"
else
    # Create bucket
    aws s3api create-bucket \
        --bucket ${TRAIL_BUCKET_NAME} \
        --region ${AWS_REGION} \
        --create-bucket-configuration LocationConstraint=${AWS_REGION} \
        --no-cli-pager
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket ${TRAIL_BUCKET_NAME} \
        --versioning-configuration Status=Enabled \
        --region ${AWS_REGION}
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket ${TRAIL_BUCKET_NAME} \
        --public-access-block-configuration \
            BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
        --region ${AWS_REGION}
    
    # Add bucket policy for CloudTrail
    cat > /tmp/cloudtrail-bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::${TRAIL_BUCKET_NAME}"
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::${TRAIL_BUCKET_NAME}/AWSLogs/${ACCOUNT_ID}/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      }
    }
  ]
}
EOF

    aws s3api put-bucket-policy \
        --bucket ${TRAIL_BUCKET_NAME} \
        --policy file:///tmp/cloudtrail-bucket-policy.json \
        --region ${AWS_REGION}
    
    # Add lifecycle policy to reduce costs
    cat > /tmp/cloudtrail-lifecycle.json <<EOF
{
  "Rules": [
    {
      "Id": "DeleteOldLogs",
      "Status": "Enabled",
      "Prefix": "",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
EOF

    aws s3api put-bucket-lifecycle-configuration \
        --bucket ${TRAIL_BUCKET_NAME} \
        --lifecycle-configuration file:///tmp/cloudtrail-lifecycle.json \
        --region ${AWS_REGION}
    
    echo "✓ S3 bucket created: ${TRAIL_BUCKET_NAME}"
fi

# ============================================
# 2. Create CloudWatch Log Group
# ============================================

echo ""
echo "Step 2: Creating CloudWatch Log Group..."

LOG_GROUP_NAME="/aws/cloudtrail/xrestaurant"

# Check if log group exists
if aws logs describe-log-groups \
    --log-group-name-prefix ${LOG_GROUP_NAME} \
    --region ${AWS_REGION} \
    --query "logGroups[?logGroupName=='${LOG_GROUP_NAME}'].logGroupName" \
    --output text | grep -q "${LOG_GROUP_NAME}"; then
    echo "✓ Log group already exists: ${LOG_GROUP_NAME}"
else
    aws logs create-log-group \
        --log-group-name ${LOG_GROUP_NAME} \
        --region ${AWS_REGION}
    
    # Set retention to 90 days
    aws logs put-retention-policy \
        --log-group-name ${LOG_GROUP_NAME} \
        --retention-in-days 90 \
        --region ${AWS_REGION}
    
    echo "✓ Log group created: ${LOG_GROUP_NAME}"
fi

# ============================================
# 3. Create IAM Role for CloudTrail
# ============================================

echo ""
echo "Step 3: Creating IAM role for CloudTrail..."

CLOUDTRAIL_ROLE_NAME="xrestaurant-cloudtrail-role"

# Check if role exists
if aws iam get-role --role-name ${CLOUDTRAIL_ROLE_NAME} 2>/dev/null; then
    echo "✓ IAM role already exists: ${CLOUDTRAIL_ROLE_NAME}"
    CLOUDTRAIL_ROLE_ARN=$(aws iam get-role --role-name ${CLOUDTRAIL_ROLE_NAME} --query 'Role.Arn' --output text)
else
    # Create trust policy
    cat > /tmp/cloudtrail-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    CLOUDTRAIL_ROLE_ARN=$(aws iam create-role \
        --role-name ${CLOUDTRAIL_ROLE_NAME} \
        --assume-role-policy-document file:///tmp/cloudtrail-trust-policy.json \
        --description "Role for CloudTrail to write to CloudWatch Logs" \
        --tags Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
        --query 'Role.Arn' \
        --output text)
    
    # Create policy for CloudWatch Logs
    cat > /tmp/cloudtrail-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP_NAME}:*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name ${CLOUDTRAIL_ROLE_NAME} \
        --policy-name CloudTrailCloudWatchLogsPolicy \
        --policy-document file:///tmp/cloudtrail-policy.json
    
    echo "✓ IAM role created: ${CLOUDTRAIL_ROLE_ARN}"
    echo "  Waiting 10 seconds for IAM propagation..."
    sleep 10
fi

# ============================================
# 4. Create CloudTrail
# ============================================

echo ""
echo "Step 4: Creating CloudTrail..."

TRAIL_NAME="xrestaurant-trail"

# Check if trail exists
if aws cloudtrail describe-trails \
    --region ${AWS_REGION} \
    --query "trailList[?Name=='${TRAIL_NAME}'].Name" \
    --output text | grep -q "${TRAIL_NAME}"; then
    echo "✓ CloudTrail already exists: ${TRAIL_NAME}"
    TRAIL_ARN=$(aws cloudtrail describe-trails \
        --region ${AWS_REGION} \
        --query "trailList[?Name=='${TRAIL_NAME}'].TrailARN" \
        --output text)
else
    TRAIL_ARN=$(aws cloudtrail create-trail \
        --name ${TRAIL_NAME} \
        --s3-bucket-name ${TRAIL_BUCKET_NAME} \
        --include-global-service-events \
        --is-multi-region-trail \
        --enable-log-file-validation \
        --cloud-watch-logs-log-group-arn "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP_NAME}:*" \
        --cloud-watch-logs-role-arn ${CLOUDTRAIL_ROLE_ARN} \
        --region ${AWS_REGION} \
        --query 'TrailARN' \
        --output text)
    
    # Add tags
    aws cloudtrail add-tags \
        --resource-id ${TRAIL_ARN} \
        --tags-list Key=OWNER,Value=${OWNER} Key=PROJECT,Value=${PROJECT} \
        --region ${AWS_REGION}
    
    echo "✓ CloudTrail created: ${TRAIL_ARN}"
fi

# ============================================
# 5. Start Logging
# ============================================

echo ""
echo "Step 5: Starting CloudTrail logging..."

aws cloudtrail start-logging \
    --name ${TRAIL_NAME} \
    --region ${AWS_REGION}

echo "✓ CloudTrail logging started"

# ============================================
# 6. Create CloudWatch Alarms for Security Events
# ============================================

echo ""
echo "Step 6: Creating CloudWatch alarms for security events..."

# Get SNS topic ARN (from Step 10)
if [ -z "$SNS_TOPIC_ARN" ]; then
    SNS_TOPIC_ARN=$(aws sns list-topics \
        --region ${AWS_REGION} \
        --query "Topics[?contains(TopicArn, 'xrestaurant-alarms')].TopicArn | [0]" \
        --output text)
fi

if [ -n "$SNS_TOPIC_ARN" ] && [ "$SNS_TOPIC_ARN" != "None" ]; then
    # Alarm for unauthorized API calls
    aws cloudwatch put-metric-alarm \
        --alarm-name xrestaurant-unauthorized-api-calls \
        --alarm-description "Alert on unauthorized API calls" \
        --metric-name UnauthorizedAPICalls \
        --namespace CloudTrailMetrics \
        --statistic Sum \
        --period 300 \
        --threshold 1 \
        --comparison-operator GreaterThanOrEqualToThreshold \
        --evaluation-periods 1 \
        --alarm-actions ${SNS_TOPIC_ARN} \
        --region ${AWS_REGION} 2>/dev/null || echo "  Note: Alarm already exists or failed"
    
    echo "✓ Security alarms created"
else
    echo "  Note: SNS topic not found, skipping alarms"
fi

# ============================================
# 7. Save Configuration
# ============================================

echo ""
echo "Step 7: Saving configuration..."

cat >> ./vpc-config.sh <<EOF

# CloudTrail Configuration
# Generated: $(date)

export TRAIL_NAME="${TRAIL_NAME}"
export TRAIL_ARN="${TRAIL_ARN}"
export TRAIL_BUCKET="${TRAIL_BUCKET_NAME}"
export TRAIL_LOG_GROUP="${LOG_GROUP_NAME}"
EOF

echo "✓ Configuration saved"

# ============================================
# Summary
# ============================================

echo ""
echo "============================================"
echo "CloudTrail Setup Complete"
echo "============================================"
echo ""
echo "Resources Created:"
echo "  - Trail: ${TRAIL_NAME}"
echo "  - S3 Bucket: ${TRAIL_BUCKET_NAME}"
echo "  - Log Group: ${LOG_GROUP_NAME}"
echo "  - IAM Role: ${CLOUDTRAIL_ROLE_NAME}"
echo ""
echo "Features Enabled:"
echo "  - Multi-region trail"
echo "  - Global service events (IAM, STS, etc.)"
echo "  - Log file validation"
echo "  - CloudWatch Logs integration"
echo "  - Security event alarms"
echo ""
echo "Log Retention:"
echo "  - CloudWatch Logs: 90 days"
echo "  - S3: 30 days (Standard) → 90 days (IA) → 365 days (Glacier) → Delete"
echo ""
echo "View Logs:"
echo "  CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#logsV2:log-groups/log-group/${LOG_GROUP_NAME}"
echo "  S3: https://s3.console.aws.amazon.com/s3/buckets/${TRAIL_BUCKET_NAME}"
echo ""
echo "View Trail:"
echo "  https://console.aws.amazon.com/cloudtrail/home?region=${AWS_REGION}#/trails/${TRAIL_NAME}"
echo ""
echo "Query Recent Events:"
echo "  aws cloudtrail lookup-events --max-results 10 --region ${AWS_REGION}"
echo ""
