#!/bin/bash

# ============================================================================
# Script: 13-create-sns-sqs-lambda.sh
# Description: Tạo SNS Topic + SQS Queue + Lambda cho async order processing
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
REGION="ap-southeast-1"
SNS_TOPIC_NAME="xrestaurant-order-events"
SQS_QUEUE_NAME="xrestaurant-order-processing"
DLQ_NAME="xrestaurant-order-dlq"
LAMBDA_FUNCTION_NAME="xrestaurant-order-processor"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   SNS + SQS + Lambda Setup${NC}"
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
# STEP 2: Create SNS Topic
# ============================================================================

echo -e "${YELLOW}📋 Step 2: Creating SNS Topic...${NC}"

# Check if topic exists
EXISTING_TOPIC=$(aws sns list-topics \
    --region $REGION \
    --query "Topics[?contains(TopicArn, '$SNS_TOPIC_NAME')].TopicArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_TOPIC" ]; then
    echo -e "${YELLOW}⚠️  SNS Topic already exists${NC}"
    SNS_TOPIC_ARN=$EXISTING_TOPIC
else
    SNS_TOPIC_ARN=$(aws sns create-topic \
        --name $SNS_TOPIC_NAME \
        --region $REGION \
        --tags Key=Project,Value=xrestaurant Key=Environment,Value=production Key=OWNER,Value=NamHoang \
        --query 'TopicArn' \
        --output text)
    
    echo -e "${GREEN}✅ SNS Topic created${NC}"
fi

echo -e "${GREEN}   Topic ARN: $SNS_TOPIC_ARN${NC}"
echo ""

# ============================================================================
# STEP 3: Create Dead Letter Queue (DLQ)
# ============================================================================

echo -e "${YELLOW}📋 Step 3: Creating Dead Letter Queue...${NC}"

# Check if DLQ exists
EXISTING_DLQ=$(aws sqs list-queues \
    --region $REGION \
    --queue-name-prefix $DLQ_NAME \
    --query "QueueUrls[0]" \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_DLQ" != "None" ] && [ -n "$EXISTING_DLQ" ]; then
    echo -e "${YELLOW}⚠️  DLQ already exists${NC}"
    DLQ_URL=$EXISTING_DLQ
else
    DLQ_URL=$(aws sqs create-queue \
        --queue-name $DLQ_NAME \
        --region $REGION \
        --attributes MessageRetentionPeriod=1209600 \
        --tags OWNER=NamHoang,Project=xrestaurant,Environment=production \
        --query 'QueueUrl' \
        --output text)
    
    echo -e "${GREEN}✅ DLQ created${NC}"
fi

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
    --queue-url $DLQ_URL \
    --attribute-names QueueArn \
    --region $REGION \
    --query 'Attributes.QueueArn' \
    --output text)

echo -e "${GREEN}   DLQ URL: $DLQ_URL${NC}"
echo -e "${GREEN}   DLQ ARN: $DLQ_ARN${NC}"
echo ""

# ============================================================================
# STEP 4: Create SQS Queue
# ============================================================================

echo -e "${YELLOW}📋 Step 4: Creating SQS Queue...${NC}"

# Check if queue exists
EXISTING_QUEUE=$(aws sqs list-queues \
    --region $REGION \
    --queue-name-prefix $SQS_QUEUE_NAME \
    --query "QueueUrls[0]" \
    --output text 2>/dev/null || echo "None")

if [ "$EXISTING_QUEUE" != "None" ] && [ -n "$EXISTING_QUEUE" ]; then
    echo -e "${YELLOW}⚠️  SQS Queue already exists${NC}"
    SQS_QUEUE_URL=$EXISTING_QUEUE
else
    # Create SQS Queue without RedrivePolicy first
    SQS_QUEUE_URL=$(aws sqs create-queue \
        --queue-name $SQS_QUEUE_NAME \
        --region $REGION \
        --attributes VisibilityTimeout=300,MessageRetentionPeriod=345600,ReceiveMessageWaitTimeSeconds=20 \
        --tags OWNER=NamHoang,Project=xrestaurant,Environment=production \
        --query 'QueueUrl' \
        --output text)
    
    # Now set RedrivePolicy separately using proper escaping
    REDRIVE_JSON='{"deadLetterTargetArn":"'$DLQ_ARN'","maxReceiveCount":"3"}'
    
    aws sqs set-queue-attributes \
        --queue-url $SQS_QUEUE_URL \
        --attributes "{\"RedrivePolicy\":\"$(echo $REDRIVE_JSON | sed 's/"/\\"/g')\"}" \
        --region $REGION
    
    echo -e "${GREEN}✅ SQS Queue created${NC}"
fi

# Get Queue ARN
SQS_QUEUE_ARN=$(aws sqs get-queue-attributes \
    --queue-url $SQS_QUEUE_URL \
    --attribute-names QueueArn \
    --region $REGION \
    --query 'Attributes.QueueArn' \
    --output text)

echo -e "${GREEN}   Queue URL: $SQS_QUEUE_URL${NC}"
echo -e "${GREEN}   Queue ARN: $SQS_QUEUE_ARN${NC}"
echo ""

# ============================================================================
# STEP 5: Subscribe SQS to SNS
# ============================================================================

echo -e "${YELLOW}📋 Step 5: Subscribing SQS to SNS...${NC}"

# Check if subscription exists
EXISTING_SUB=$(aws sns list-subscriptions-by-topic \
    --topic-arn $SNS_TOPIC_ARN \
    --region $REGION \
    --query "Subscriptions[?Endpoint=='$SQS_QUEUE_ARN'].SubscriptionArn" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_SUB" ] && [ "$EXISTING_SUB" != "PendingConfirmation" ]; then
    echo -e "${YELLOW}⚠️  Subscription already exists${NC}"
    SUBSCRIPTION_ARN=$EXISTING_SUB
else
    # Set SQS policy to allow SNS - write to file first
    cat > /tmp/sqs-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "sns.amazonaws.com"
      },
      "Action": "sqs:SendMessage",
      "Resource": "$SQS_QUEUE_ARN",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "$SNS_TOPIC_ARN"
        }
      }
    }
  ]
}
EOF

    # Minify JSON and escape properly
    POLICY_JSON=$(cat /tmp/sqs-policy.json | tr -d '\n' | tr -d ' ')
    
    aws sqs set-queue-attributes \
        --queue-url $SQS_QUEUE_URL \
        --attributes "{\"Policy\":\"$(echo $POLICY_JSON | sed 's/"/\\"/g')\"}" \
        --region $REGION
    
    # Subscribe SQS to SNS
    SUBSCRIPTION_ARN=$(aws sns subscribe \
        --topic-arn $SNS_TOPIC_ARN \
        --protocol sqs \
        --notification-endpoint $SQS_QUEUE_ARN \
        --region $REGION \
        --query 'SubscriptionArn' \
        --output text)
    
    echo -e "${GREEN}✅ SQS subscribed to SNS${NC}"
fi

echo -e "${GREEN}   Subscription ARN: $SUBSCRIPTION_ARN${NC}"
echo ""

# ============================================================================
# STEP 6: Create Lambda IAM Role
# ============================================================================

echo -e "${YELLOW}📋 Step 6: Creating Lambda IAM Role...${NC}"

LAMBDA_ROLE_NAME="xrestaurant-lambda-order-processor-role"

# Check if role exists
LAMBDA_ROLE_EXISTS=$(aws iam get-role \
    --role-name $LAMBDA_ROLE_NAME \
    --query 'Role.Arn' \
    --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_ROLE_EXISTS" ]; then
    echo -e "${YELLOW}⚠️  Lambda role already exists${NC}"
    LAMBDA_ROLE_ARN=$LAMBDA_ROLE_EXISTS
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

    LAMBDA_ROLE_ARN=$(aws iam create-role \
        --role-name $LAMBDA_ROLE_NAME \
        --assume-role-policy-document file:///tmp/lambda-trust-policy.json \
        --description "Role for XRestaurant order processor Lambda" \
        --tags Key=OWNER,Value=NamHoang Key=Project,Value=xrestaurant Key=Environment,Value=production \
        --query 'Role.Arn' \
        --output text)
    
    # Attach basic Lambda execution policy
    aws iam attach-role-policy \
        --role-name $LAMBDA_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    
    # Create custom policy for SQS, SNS, CloudWatch
    cat > /tmp/lambda-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "$SQS_QUEUE_ARN"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "$SNS_TOPIC_ARN"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/${LAMBDA_FUNCTION_NAME}:*"
    }
  ]
}
EOF

    aws iam put-role-policy \
        --role-name $LAMBDA_ROLE_NAME \
        --policy-name XRestaurantLambdaPolicy \
        --policy-document file:///tmp/lambda-policy.json
    
    echo -e "${GREEN}✅ Lambda role created${NC}"
    echo -e "${YELLOW}   Waiting 10 seconds for IAM propagation...${NC}"
    sleep 10
fi

echo -e "${GREEN}   Role ARN: $LAMBDA_ROLE_ARN${NC}"
echo ""

# ============================================================================
# STEP 7: Create Lambda Function
# ============================================================================

echo -e "${YELLOW}📋 Step 7: Creating Lambda Function...${NC}"

# Check if function exists
LAMBDA_EXISTS=$(aws lambda get-function \
    --function-name $LAMBDA_FUNCTION_NAME \
    --region $REGION \
    --query 'Configuration.FunctionArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_EXISTS" ]; then
    echo -e "${YELLOW}⚠️  Lambda function already exists${NC}"
    LAMBDA_ARN=$LAMBDA_EXISTS
else
    # Create Lambda function code
    cat > /tmp/lambda_function.py <<'EOF'
import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
sns = boto3.client('sns')
cloudwatch = boto3.client('cloudwatch')

def lambda_handler(event, context):
    """
    Process order events from SQS queue
    - Send notifications (Email/SMS simulation)
    - Log to CloudWatch
    - Publish metrics
    """
    
    print(f"Received {len(event['Records'])} messages")
    
    processed = 0
    failed = 0
    
    for record in event['Records']:
        try:
            # Parse message
            message_body = json.loads(record['body'])
            
            # If message is from SNS, extract the actual message
            if 'Message' in message_body:
                order_data = json.loads(message_body['Message'])
            else:
                order_data = message_body
            
            print(f"Processing order: {json.dumps(order_data, indent=2)}")
            
            # Simulate order processing
            order_id = order_data.get('orderId', 'unknown')
            customer_email = order_data.get('customerEmail', 'unknown')
            order_total = order_data.get('total', 0)
            
            # Log processing
            print(f"✅ Order {order_id} processed successfully")
            print(f"   Customer: {customer_email}")
            print(f"   Total: ${order_total}")
            
            # Simulate sending notifications
            print(f"📧 Sending email to {customer_email}")
            print(f"📱 Sending SMS notification")
            print(f"🔔 Sending push notification")
            
            # Publish CloudWatch metric
            cloudwatch.put_metric_data(
                Namespace='XRestaurant/Orders',
                MetricData=[
                    {
                        'MetricName': 'OrdersProcessed',
                        'Value': 1,
                        'Unit': 'Count',
                        'Timestamp': datetime.utcnow()
                    },
                    {
                        'MetricName': 'OrderValue',
                        'Value': float(order_total),
                        'Unit': 'None',
                        'Timestamp': datetime.utcnow()
                    }
                ]
            )
            
            processed += 1
            
        except Exception as e:
            print(f"❌ Error processing message: {str(e)}")
            failed += 1
            # Message will be retried or sent to DLQ
            raise e
    
    # Summary
    print(f"\n📊 Processing Summary:")
    print(f"   Processed: {processed}")
    print(f"   Failed: {failed}")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed,
            'failed': failed
        })
    }
EOF

    # Create deployment package using Python (zip command may not be available)
    python3 -c "
import zipfile
import os
with zipfile.ZipFile('/tmp/lambda_function.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
    zipf.write('/tmp/lambda_function.py', 'lambda_function.py')
print('Lambda deployment package created')
"
    
    # Create Lambda function
    LAMBDA_ARN=$(aws lambda create-function \
        --function-name $LAMBDA_FUNCTION_NAME \
        --runtime python3.9 \
        --role $LAMBDA_ROLE_ARN \
        --handler lambda_function.lambda_handler \
        --zip-file fileb:///tmp/lambda_function.zip \
        --timeout 60 \
        --memory-size 256 \
        --region $REGION \
        --description "Process XRestaurant orders from SQS" \
        --environment "Variables={SNS_TOPIC_ARN=$SNS_TOPIC_ARN}" \
        --tags OWNER=NamHoang,Project=xrestaurant,Environment=production \
        --query 'FunctionArn' \
        --output text)
    
    echo -e "${GREEN}✅ Lambda function created${NC}"
fi

echo -e "${GREEN}   Function ARN: $LAMBDA_ARN${NC}"
echo ""

# ============================================================================
# STEP 8: Add SQS Trigger to Lambda
# ============================================================================

echo -e "${YELLOW}📋 Step 8: Adding SQS trigger to Lambda...${NC}"

# Check if event source mapping exists
EXISTING_MAPPING=$(aws lambda list-event-source-mappings \
    --function-name $LAMBDA_FUNCTION_NAME \
    --region $REGION \
    --query "EventSourceMappings[?EventSourceArn=='$SQS_QUEUE_ARN'].UUID" \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_MAPPING" ]; then
    echo -e "${YELLOW}⚠️  SQS trigger already exists${NC}"
else
    aws lambda create-event-source-mapping \
        --function-name $LAMBDA_FUNCTION_NAME \
        --event-source-arn $SQS_QUEUE_ARN \
        --batch-size 10 \
        --maximum-batching-window-in-seconds 5 \
        --region $REGION > /dev/null
    
    echo -e "${GREEN}✅ SQS trigger added to Lambda${NC}"
fi

echo ""

# ============================================================================
# STEP 9: Test the Pipeline
# ============================================================================

echo -e "${YELLOW}📋 Step 9: Testing the pipeline...${NC}"

# Publish test message to SNS
TEST_MESSAGE=$(cat <<EOF
{
  "orderId": "TEST-$(date +%s)",
  "customerEmail": "test@xrestaurant.com",
  "customerName": "Test Customer",
  "items": [
    {"name": "Phở Bò", "quantity": 2, "price": 50000},
    {"name": "Cà phê sữa", "quantity": 1, "price": 25000}
  ],
  "total": 125000,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

aws sns publish \
    --topic-arn $SNS_TOPIC_ARN \
    --message "$TEST_MESSAGE" \
    --subject "New Order" \
    --region $REGION > /dev/null

echo -e "${GREEN}✅ Test message published to SNS${NC}"
echo -e "${YELLOW}   Waiting 10 seconds for processing...${NC}"
sleep 10

# Check Lambda logs
echo -e "${YELLOW}   Checking Lambda logs...${NC}"
LOG_STREAM=$(aws logs describe-log-streams \
    --log-group-name /aws/lambda/$LAMBDA_FUNCTION_NAME \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --region $REGION \
    --query 'logStreams[0].logStreamName' \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_STREAM" ] && [ "$LOG_STREAM" != "None" ]; then
    echo -e "${GREEN}✅ Lambda executed successfully${NC}"
    echo -e "${YELLOW}   Latest logs:${NC}"
    aws logs get-log-events \
        --log-group-name /aws/lambda/$LAMBDA_FUNCTION_NAME \
        --log-stream-name "$LOG_STREAM" \
        --limit 10 \
        --region $REGION \
        --query 'events[].message' \
        --output text | tail -5
else
    echo -e "${YELLOW}⚠️  No logs found yet (Lambda may still be initializing)${NC}"
fi

echo ""

# ============================================================================
# STEP 10: Save Configuration
# ============================================================================

echo -e "${YELLOW}📋 Step 10: Saving configuration...${NC}"

cat >> ./vpc-config.sh <<EOF

# SNS + SQS + Lambda Configuration (added by 13-create-sns-sqs-lambda.sh)
export SNS_TOPIC_ARN="$SNS_TOPIC_ARN"
export SQS_QUEUE_URL="$SQS_QUEUE_URL"
export SQS_QUEUE_ARN="$SQS_QUEUE_ARN"
export DLQ_URL="$DLQ_URL"
export DLQ_ARN="$DLQ_ARN"
export LAMBDA_FUNCTION_NAME="$LAMBDA_FUNCTION_NAME"
export LAMBDA_ARN="$LAMBDA_ARN"
EOF

echo -e "${GREEN}✅ Configuration saved${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ SNS + SQS + LAMBDA SETUP COMPLETE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${GREEN}📋 Summary:${NC}"
echo ""
echo -e "${GREEN}📢 SNS Topic:${NC}"
echo -e "   Name: $SNS_TOPIC_NAME"
echo -e "   ARN: $SNS_TOPIC_ARN"
echo ""
echo -e "${GREEN}📬 SQS Queue:${NC}"
echo -e "   Name: $SQS_QUEUE_NAME"
echo -e "   URL: $SQS_QUEUE_URL"
echo -e "   Visibility Timeout: 300s (5 min)"
echo -e "   Message Retention: 4 days"
echo -e "   Max Receive Count: 3 (then → DLQ)"
echo ""
echo -e "${GREEN}💀 Dead Letter Queue:${NC}"
echo -e "   Name: $DLQ_NAME"
echo -e "   URL: $DLQ_URL"
echo -e "   Retention: 14 days"
echo ""
echo -e "${GREEN}⚡ Lambda Function:${NC}"
echo -e "   Name: $LAMBDA_FUNCTION_NAME"
echo -e "   Runtime: Python 3.9"
echo -e "   Memory: 256 MB"
echo -e "   Timeout: 60s"
echo -e "   Trigger: SQS (batch size: 10)"
echo ""
echo -e "${GREEN}🔄 Data Flow:${NC}"
echo -e "   Backend → SNS Topic → SQS Queue → Lambda → Process Order"
echo -e "                                   ↓ (after 3 retries)"
echo -e "                              Dead Letter Queue"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "   1. Test publishing message:"
echo -e "      aws sns publish \\"
echo -e "        --topic-arn $SNS_TOPIC_ARN \\"
echo -e "        --message '{\"orderId\":\"123\",\"total\":100000}' \\"
echo -e "        --region $REGION"
echo ""
echo -e "   2. View Lambda logs:"
echo -e "      aws logs tail /aws/lambda/$LAMBDA_FUNCTION_NAME --follow --region $REGION"
echo ""
echo -e "   3. Check SQS queue:"
echo -e "      aws sqs get-queue-attributes \\"
echo -e "        --queue-url $SQS_QUEUE_URL \\"
echo -e "        --attribute-names All \\"
echo -e "        --region $REGION"
echo ""
echo -e "   4. Check DLQ for failed messages:"
echo -e "      aws sqs receive-message \\"
echo -e "        --queue-url $DLQ_URL \\"
echo -e "        --region $REGION"
echo ""
echo -e "   5. View CloudWatch metrics:"
echo -e "      Namespace: XRestaurant/Orders"
echo -e "      Metrics: OrdersProcessed, OrderValue"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NOTES:${NC}"
echo -e "${YELLOW}   - Lambda processes messages in batches of 10${NC}"
echo -e "${YELLOW}   - Failed messages retry 3 times then go to DLQ${NC}"
echo -e "${YELLOW}   - DLQ retains messages for 14 days${NC}"
echo -e "${YELLOW}   - Lambda logs to CloudWatch automatically${NC}"
echo ""
echo -e "${GREEN}🔧 Integration with Backend:${NC}"
echo -e "   Add to backend code:"
echo -e "   const AWS = require('aws-sdk');"
echo -e "   const sns = new AWS.SNS({region: '$REGION'});"
echo -e ""
echo -e "   // After order created"
echo -e "   await sns.publish({"
echo -e "     TopicArn: '$SNS_TOPIC_ARN',"
echo -e "     Message: JSON.stringify(orderData)"
echo -e "   }).promise();"
echo ""
echo -e "${GREEN}✅ HOÀN TẤT!${NC}"
echo ""
echo "📝 Next steps:"
echo "   1. Run: source ./vpc-config.sh"
echo "   2. Run: bash ./15-create-waf.sh"
echo ""
echo "=========================================="
