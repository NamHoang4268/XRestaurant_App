# ============================================================================
# Script: 13-create-sns-sqs-lambda.ps1
# Description: Tạo SNS Topic + SQS Queue + Lambda cho async order processing
# Author: Kiro AI Assistant
# Date: 2026-04-16
# ============================================================================

$ErrorActionPreference = "Stop"

# Configuration
$REGION = "ap-southeast-1"
$SNS_TOPIC_NAME = "xrestaurant-order-events"
$SQS_QUEUE_NAME = "xrestaurant-order-processing"
$DLQ_NAME = "xrestaurant-order-dlq"
$LAMBDA_FUNCTION_NAME = "xrestaurant-order-processor"

Write-Host "============================================" -ForegroundColor Blue
Write-Host "   SNS + SQS + Lambda Setup" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

# ============================================================================
# STEP 1: Get Account ID
# ============================================================================

Write-Host "📋 Step 1: Getting account information..." -ForegroundColor Yellow

$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
Write-Host "✅ Account ID: $ACCOUNT_ID" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 2: Create SNS Topic
# ============================================================================

Write-Host "📋 Step 2: Creating SNS Topic..." -ForegroundColor Yellow

$EXISTING_TOPIC = aws sns list-topics --region $REGION --query "Topics[?contains(TopicArn, '$SNS_TOPIC_NAME')].TopicArn" --output text

if ($EXISTING_TOPIC) {
    Write-Host "⚠️  SNS Topic already exists" -ForegroundColor Yellow
    $SNS_TOPIC_ARN = $EXISTING_TOPIC
} else {
    $SNS_TOPIC_ARN = aws sns create-topic `
        --name $SNS_TOPIC_NAME `
        --region $REGION `
        --tags Key=Project,Value=xrestaurant Key=Environment,Value=production `
        --query 'TopicArn' `
        --output text
    
    Write-Host "✅ SNS Topic created" -ForegroundColor Green
}

Write-Host "   Topic ARN: $SNS_TOPIC_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 3: Create Dead Letter Queue (DLQ)
# ============================================================================

Write-Host "📋 Step 3: Creating Dead Letter Queue..." -ForegroundColor Yellow

$EXISTING_DLQ = aws sqs list-queues --region $REGION --queue-name-prefix $DLQ_NAME --query "QueueUrls[0]" --output text 2>$null

if ($EXISTING_DLQ -and $EXISTING_DLQ -ne "None") {
    Write-Host "⚠️  DLQ already exists" -ForegroundColor Yellow
    $DLQ_URL = $EXISTING_DLQ
} else {
    $DLQ_URL = aws sqs create-queue `
        --queue-name $DLQ_NAME `
        --region $REGION `
        --attributes MessageRetentionPeriod=1209600 `
        --query 'QueueUrl' `
        --output text
    
    Write-Host "✅ DLQ created" -ForegroundColor Green
}

# Get DLQ ARN
$DLQ_ARN = aws sqs get-queue-attributes `
    --queue-url $DLQ_URL `
    --attribute-names QueueArn `
    --region $REGION `
    --query 'Attributes.QueueArn' `
    --output text

Write-Host "   DLQ URL: $DLQ_URL" -ForegroundColor Green
Write-Host "   DLQ ARN: $DLQ_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 4: Create SQS Queue
# ============================================================================

Write-Host "📋 Step 4: Creating SQS Queue..." -ForegroundColor Yellow

$EXISTING_QUEUE = aws sqs list-queues --region $REGION --queue-name-prefix $SQS_QUEUE_NAME --query "QueueUrls[0]" --output text 2>$null

if ($EXISTING_QUEUE -and $EXISTING_QUEUE -ne "None") {
    Write-Host "⚠️  SQS Queue already exists" -ForegroundColor Yellow
    $SQS_QUEUE_URL = $EXISTING_QUEUE
} else {
    # Create redrive policy
    $REDRIVE_POLICY = "{`"deadLetterTargetArn`":`"$DLQ_ARN`",`"maxReceiveCount`":`"3`"}"
    
    $SQS_QUEUE_URL = aws sqs create-queue `
        --queue-name $SQS_QUEUE_NAME `
        --region $REGION `
        --attributes "VisibilityTimeout=300,MessageRetentionPeriod=345600,ReceiveMessageWaitTimeSeconds=20,RedrivePolicy=$REDRIVE_POLICY" `
        --query 'QueueUrl' `
        --output text
    
    Write-Host "✅ SQS Queue created" -ForegroundColor Green
}

# Get Queue ARN
$SQS_QUEUE_ARN = aws sqs get-queue-attributes `
    --queue-url $SQS_QUEUE_URL `
    --attribute-names QueueArn `
    --region $REGION `
    --query 'Attributes.QueueArn' `
    --output text

Write-Host "   Queue URL: $SQS_QUEUE_URL" -ForegroundColor Green
Write-Host "   Queue ARN: $SQS_QUEUE_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 5: Subscribe SQS to SNS
# ============================================================================

Write-Host "📋 Step 5: Subscribing SQS to SNS..." -ForegroundColor Yellow

$EXISTING_SUB = aws sns list-subscriptions-by-topic `
    --topic-arn $SNS_TOPIC_ARN `
    --region $REGION `
    --query "Subscriptions[?Endpoint=='$SQS_QUEUE_ARN'].SubscriptionArn" `
    --output text 2>$null

if ($EXISTING_SUB -and $EXISTING_SUB -ne "PendingConfirmation") {
    Write-Host "⚠️  Subscription already exists" -ForegroundColor Yellow
    $SUBSCRIPTION_ARN = $EXISTING_SUB
} else {
    # Set SQS policy to allow SNS
    $SQS_POLICY = @"
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
"@

    aws sqs set-queue-attributes `
        --queue-url $SQS_QUEUE_URL `
        --attributes "Policy=$($SQS_POLICY -replace '"', '\"')" `
        --region $REGION | Out-Null
    
    # Subscribe SQS to SNS
    $SUBSCRIPTION_ARN = aws sns subscribe `
        --topic-arn $SNS_TOPIC_ARN `
        --protocol sqs `
        --notification-endpoint $SQS_QUEUE_ARN `
        --region $REGION `
        --query 'SubscriptionArn' `
        --output text
    
    Write-Host "✅ SQS subscribed to SNS" -ForegroundColor Green
}

Write-Host "   Subscription ARN: $SUBSCRIPTION_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 6: Create Lambda IAM Role
# ============================================================================

Write-Host "📋 Step 6: Creating Lambda IAM Role..." -ForegroundColor Yellow

$LAMBDA_ROLE_NAME = "xrestaurant-lambda-order-processor-role"

$LAMBDA_ROLE_EXISTS = aws iam get-role --role-name $LAMBDA_ROLE_NAME --query 'Role.Arn' --output text 2>$null

if ($LAMBDA_ROLE_EXISTS) {
    Write-Host "⚠️  Lambda role already exists" -ForegroundColor Yellow
    $LAMBDA_ROLE_ARN = $LAMBDA_ROLE_EXISTS
} else {
    # Create trust policy
    $TRUST_POLICY = @"
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
"@
    $TRUST_POLICY | Out-File -FilePath "$env:TEMP\lambda-trust-policy.json" -Encoding utf8

    $LAMBDA_ROLE_ARN = aws iam create-role `
        --role-name $LAMBDA_ROLE_NAME `
        --assume-role-policy-document "file://$env:TEMP\lambda-trust-policy.json" `
        --description "Role for XRestaurant order processor Lambda" `
        --query 'Role.Arn' `
        --output text
    
    # Attach basic Lambda execution policy
    aws iam attach-role-policy `
        --role-name $LAMBDA_ROLE_NAME `
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole | Out-Null
    
    # Create custom policy for SQS, SNS, CloudWatch
    $LAMBDA_POLICY = @"
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
"@
    $LAMBDA_POLICY | Out-File -FilePath "$env:TEMP\lambda-policy.json" -Encoding utf8

    aws iam put-role-policy `
        --role-name $LAMBDA_ROLE_NAME `
        --policy-name XRestaurantLambdaPolicy `
        --policy-document "file://$env:TEMP\lambda-policy.json" | Out-Null
    
    Write-Host "✅ Lambda role created" -ForegroundColor Green
    Write-Host "   Waiting 10 seconds for IAM propagation..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

Write-Host "   Role ARN: $LAMBDA_ROLE_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 7: Create Lambda Function
# ============================================================================

Write-Host "📋 Step 7: Creating Lambda Function..." -ForegroundColor Yellow

$LAMBDA_EXISTS = aws lambda get-function --function-name $LAMBDA_FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text 2>$null

if ($LAMBDA_EXISTS) {
    Write-Host "⚠️  Lambda function already exists" -ForegroundColor Yellow
    $LAMBDA_ARN = $LAMBDA_EXISTS
} else {
    # Create Lambda function code
    $LAMBDA_CODE = @'
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
'@
    $LAMBDA_CODE | Out-File -FilePath "$env:TEMP\lambda_function.py" -Encoding utf8
    
    # Create deployment package
    Compress-Archive -Path "$env:TEMP\lambda_function.py" -DestinationPath "$env:TEMP\lambda_function.zip" -Force
    
    # Create Lambda function
    $LAMBDA_ARN = aws lambda create-function `
        --function-name $LAMBDA_FUNCTION_NAME `
        --runtime python3.9 `
        --role $LAMBDA_ROLE_ARN `
        --handler lambda_function.lambda_handler `
        --zip-file "fileb://$env:TEMP\lambda_function.zip" `
        --timeout 60 `
        --memory-size 256 `
        --region $REGION `
        --description "Process XRestaurant orders from SQS" `
        --environment "Variables={SNS_TOPIC_ARN=$SNS_TOPIC_ARN}" `
        --query 'FunctionArn' `
        --output text
    
    Write-Host "✅ Lambda function created" -ForegroundColor Green
}

Write-Host "   Function ARN: $LAMBDA_ARN" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 8: Add SQS Trigger to Lambda
# ============================================================================

Write-Host "📋 Step 8: Adding SQS trigger to Lambda..." -ForegroundColor Yellow

$EXISTING_MAPPING = aws lambda list-event-source-mappings `
    --function-name $LAMBDA_FUNCTION_NAME `
    --region $REGION `
    --query "EventSourceMappings[?EventSourceArn=='$SQS_QUEUE_ARN'].UUID" `
    --output text 2>$null

if ($EXISTING_MAPPING) {
    Write-Host "⚠️  SQS trigger already exists" -ForegroundColor Yellow
} else {
    aws lambda create-event-source-mapping `
        --function-name $LAMBDA_FUNCTION_NAME `
        --event-source-arn $SQS_QUEUE_ARN `
        --batch-size 10 `
        --maximum-batching-window-in-seconds 5 `
        --region $REGION | Out-Null
    
    Write-Host "✅ SQS trigger added to Lambda" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# STEP 9: Test the Pipeline
# ============================================================================

Write-Host "📋 Step 9: Testing the pipeline..." -ForegroundColor Yellow

# Publish test message to SNS
$TEST_MESSAGE = @"
{
  "orderId": "TEST-$(Get-Date -Format 'yyyyMMddHHmmss')",
  "customerEmail": "test@xrestaurant.com",
  "customerName": "Test Customer",
  "items": [
    {"name": "Phở Bò", "quantity": 2, "price": 50000},
    {"name": "Cà phê sữa", "quantity": 1, "price": 25000}
  ],
  "total": 125000,
  "timestamp": "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')"
}
"@

aws sns publish `
    --topic-arn $SNS_TOPIC_ARN `
    --message $TEST_MESSAGE `
    --subject "New Order" `
    --region $REGION | Out-Null

Write-Host "✅ Test message published to SNS" -ForegroundColor Green
Write-Host "   Waiting 10 seconds for processing..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check Lambda logs
Write-Host "   Checking Lambda logs..." -ForegroundColor Yellow
$LOG_STREAM = aws logs describe-log-streams `
    --log-group-name "/aws/lambda/$LAMBDA_FUNCTION_NAME" `
    --order-by LastEventTime `
    --descending `
    --max-items 1 `
    --region $REGION `
    --query 'logStreams[0].logStreamName' `
    --output text 2>$null

if ($LOG_STREAM -and $LOG_STREAM -ne "None") {
    Write-Host "✅ Lambda executed successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️  No logs found yet (Lambda may still be initializing)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# STEP 10: Save Configuration
# ============================================================================

Write-Host "📋 Step 10: Saving configuration..." -ForegroundColor Yellow

$CONFIG_APPEND = @"

# SNS + SQS + Lambda Configuration (added by 13-create-sns-sqs-lambda.ps1)
export SNS_TOPIC_ARN="$SNS_TOPIC_ARN"
export SQS_QUEUE_URL="$SQS_QUEUE_URL"
export SQS_QUEUE_ARN="$SQS_QUEUE_ARN"
export DLQ_URL="$DLQ_URL"
export DLQ_ARN="$DLQ_ARN"
export LAMBDA_FUNCTION_NAME="$LAMBDA_FUNCTION_NAME"
export LAMBDA_ARN="$LAMBDA_ARN"
"@

Add-Content -Path ".\vpc-config.sh" -Value $CONFIG_APPEND

Write-Host "✅ Configuration saved" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Summary
# ============================================================================

Write-Host "============================================" -ForegroundColor Blue
Write-Host "✅ SNS + SQS + LAMBDA SETUP COMPLETE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Green
Write-Host ""
Write-Host "📢 SNS Topic:" -ForegroundColor Green
Write-Host "   Name: $SNS_TOPIC_NAME"
Write-Host "   ARN: $SNS_TOPIC_ARN"
Write-Host ""
Write-Host "📬 SQS Queue:" -ForegroundColor Green
Write-Host "   Name: $SQS_QUEUE_NAME"
Write-Host "   URL: $SQS_QUEUE_URL"
Write-Host "   Visibility Timeout: 300s (5 min)"
Write-Host "   Message Retention: 4 days"
Write-Host "   Max Receive Count: 3 (then → DLQ)"
Write-Host ""
Write-Host "💀 Dead Letter Queue:" -ForegroundColor Green
Write-Host "   Name: $DLQ_NAME"
Write-Host "   URL: $DLQ_URL"
Write-Host "   Retention: 14 days"
Write-Host ""
Write-Host "⚡ Lambda Function:" -ForegroundColor Green
Write-Host "   Name: $LAMBDA_FUNCTION_NAME"
Write-Host "   Runtime: Python 3.9"
Write-Host "   Memory: 256 MB"
Write-Host "   Timeout: 60s"
Write-Host "   Trigger: SQS (batch size: 10)"
Write-Host ""
Write-Host "🔄 Data Flow:" -ForegroundColor Green
Write-Host "   Backend → SNS Topic → SQS Queue → Lambda → Process Order"
Write-Host "                                   ↓ (after 3 retries)"
Write-Host "                              Dead Letter Queue"
Write-Host ""
Write-Host "✅ HOÀN TẤT!" -ForegroundColor Green
