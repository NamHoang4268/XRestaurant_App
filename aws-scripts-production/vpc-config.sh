# VPC Configuration
# Generated: Thu Apr 23 14:36:17 +07 2026

export AWS_REGION="us-west-2"
export VPC_ID="vpc-053667eed43e328ea"
export VPC_NAME="xrestaurant-vpc"
export IGW_ID="igw-0206adbf23b2eb821"

# Public Subnets
export PUBLIC_SUBNET_1="subnet-0fd30f1f979610334"
export PUBLIC_SUBNET_2="subnet-0a071284b2e91aa6a"

# Private App Subnets
export PRIVATE_APP_SUBNET_1="subnet-091de6abca43aee17"
export PRIVATE_APP_SUBNET_2="subnet-073be553cfc5623f8"

# Private Data Subnets
export PRIVATE_DATA_SUBNET_1="subnet-0abf0d00363513450"
export PRIVATE_DATA_SUBNET_2="subnet-0c97576ae474286f9"

# NAT Gateway (Single)
export NAT_GW_ID="nat-0bbd3e861c55ce278"
export EIP_ALLOC_ID="eipalloc-01d9f4e86cc96ab7d"

# Route Tables
export PUBLIC_RT_ID="rtb-0cef411c824714f30"
export PRIVATE_RT_ID="rtb-0b7652ec0e5970274"

# Tags
export OWNER="NamHoang"
export PROJECT="XRestaurant"

# Security Groups
# Generated: Thu Apr 23 14:37:54 +07 2026

export SG_ALB="sg-0c681b3cc36272876"
export SG_ECS="sg-0a0687d2aae6695cf"
export SG_RDS="sg-0ada8cdbf54d760a5"
export SG_REDIS="sg-05020d0716c67861c"

# S3 Buckets
# Generated: Thu Apr 23 14:41:47 +07 2026

export FRONTEND_BUCKET="xrestaurant-frontend-728560460807"
export FRONTEND_URL="http://xrestaurant-frontend-728560460807.s3-website-us-west-2.amazonaws.com"
export MEDIA_BUCKET="xrestaurant-media-728560460807"
export DOCUMENTS_BUCKET="xrestaurant-documents-728560460807"
export SNAPSHOTS_BUCKET="xrestaurant-snapshots-728560460807"
export ACCOUNT_ID="728560460807"

# ECR Repository
# Generated: Thu Apr 23 14:45:18 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="728560460807.dkr.ecr.us-west-2.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Thu Apr 23 14:48:40 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::728560460807:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::728560460807:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ALB Configuration
# Generated: Thu Apr 23 14:56:04 +07 2026

export ALB_NAME="xrestaurant-alb"
export ALB_ARN="arn:aws:elasticloadbalancing:us-west-2:728560460807:loadbalancer/app/xrestaurant-alb/d25b17353c9b03b6"
export ALB_DNS="xrestaurant-alb-1501618852.us-west-2.elb.amazonaws.com"
export TARGET_GROUP_NAME="xrestaurant-tg"
export TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-west-2:728560460807:targetgroup/xrestaurant-tg/a2a26a428e29ff7f"
export LISTENER_ARN="arn:aws:elasticloadbalancing:us-west-2:728560460807:listener/app/xrestaurant-alb/d25b17353c9b03b6/24ca97ddba8b9265"
export BACKEND_URL="http://xrestaurant-alb-1501618852.us-west-2.elb.amazonaws.com"

# CloudFront Configuration
# Generated: Thu Apr 23 15:xx:xx +07 2026

export CLOUDFRONT_DISTRIBUTION_ID="E1JE7CCGAMCQ62"
export CLOUDFRONT_DOMAIN="d1nhiez2pa06tq.cloudfront.net"
export CLOUDFRONT_URL="https://d1nhiez2pa06tq.cloudfront.net"

# Cognito Configuration
# Generated: Thu Apr 23 15:17:02 +07 2026

export COGNITO_USER_POOL_ID="us-west-2_2hvyyhgTA"
export COGNITO_USER_POOL_ARN="arn:aws:cognito-idp:us-west-2:728560460807:userpool/us-west-2_2hvyyhgTA"
export COGNITO_APP_CLIENT_ID="4s7gvsbvoge02926rnr2cj6o6e"
export COGNITO_APP_CLIENT_SECRET="1pj9q35jkn987tjd3mdrkb1ors8g9j3d8e7iqmhomiobrm40074l"
export COGNITO_DOMAIN="xrestaurant-1776932109"
export COGNITO_HOSTED_UI_URL="https://xrestaurant-1776932109.auth.us-west-2.amazoncognito.com"
export COGNITO_AUTH_ROLE_ARN="arn:aws:iam::728560460807:role/Cognito_XRestaurant_Auth_Role"

# ECR Repository
# Generated: Thu Apr 23 16:03:15 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="728560460807.dkr.ecr.us-west-2.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# SNS + SQS + Lambda Configuration (added by 13-create-sns-sqs-lambda.sh)
export SNS_TOPIC_ARN="arn:aws:sns:us-west-2:728560460807:xrestaurant-order-events"
export SQS_QUEUE_URL="https://sqs.us-west-2.amazonaws.com/728560460807/xrestaurant-order-processing"
export SQS_QUEUE_ARN="arn:aws:sqs:us-west-2:728560460807:xrestaurant-order-processing"
export DLQ_URL="https://sqs.us-west-2.amazonaws.com/728560460807/xrestaurant-order-dlq"
export DLQ_ARN="arn:aws:sqs:us-west-2:728560460807:xrestaurant-order-dlq"
export LAMBDA_FUNCTION_NAME="xrestaurant-order-processor"
export LAMBDA_ARN="arn:aws:lambda:us-west-2:728560460807:function:xrestaurant-order-processor"

# WAF Configuration
# Generated: Thu Apr 23 16:12:32 +07 2026

export WEB_ACL_NAME="xrestaurant-waf"
export WEB_ACL_ID="b5eb254d-b807-4ca3-9571-6b7175ceb322"
export WEB_ACL_ARN="arn:aws:wafv2:us-east-1:728560460807:global/webacl/xrestaurant-waf/b5eb254d-b807-4ca3-9571-6b7175ceb322"
export WAF_DASHBOARD="XRestaurant-WAF-Dashboard"

# VPC Endpoints Configuration (added by 11-create-vpc-endpoints.sh)
export VPC_ENDPOINT_S3="vpce-01822bcc5913f8a91"
export VPC_ENDPOINT_ECR_API="vpce-0979ed3b5100a1d69"
export VPC_ENDPOINT_ECR_DKR="vpce-030198720fda09abc"
export VPC_ENDPOINT_LOGS="vpce-0cf244c251acffcca"
export VPC_ENDPOINT_SECRETS="vpce-0ca96234d57679f1b"

# CloudTrail Configuration
# Generated: Thu Apr 23 16:15:34 +07 2026

export TRAIL_NAME="xrestaurant-trail"
export TRAIL_ARN="arn:aws:cloudtrail:us-west-2:728560460807:trail/xrestaurant-trail"
export TRAIL_BUCKET="xrestaurant-cloudtrail-728560460807"
export TRAIL_LOG_GROUP="/aws/cloudtrail/xrestaurant"

# RDS Configuration (added by 03-create-rds.sh)
export DB_INSTANCE_ID="xrestaurant-db"
export DB_NAME="xrestaurant"
export DB_USERNAME="xrestaurant_admin"
export DB_ENDPOINT="xrestaurant-db.cn088oemgmw1.us-west-2.rds.amazonaws.com"
export DB_PORT="5432"
export DB_SECRET_NAME="xrestaurant/rds/credentials"
export DB_SUBNET_GROUP="xrestaurant-db-subnet-group"

# VPC Endpoints Configuration (added by 11-create-vpc-endpoints.sh)
export VPC_ENDPOINT_S3="vpce-01822bcc5913f8a91"
export VPC_ENDPOINT_ECR_API="vpce-0979ed3b5100a1d69"
export VPC_ENDPOINT_ECR_DKR="vpce-030198720fda09abc"
export VPC_ENDPOINT_LOGS="vpce-0cf244c251acffcca"
export VPC_ENDPOINT_SECRETS="vpce-0ca96234d57679f1b"

# Bastion Host Configuration
# Generated: Thu Apr 23 18:49:39 +07 2026

export BASTION_INSTANCE_ID="i-05409a7272023abc7"
export BASTION_PUBLIC_IP="184.32.233.185"
export BASTION_PRIVATE_IP="10.0.1.135"
export BASTION_SG_ID="sg-0bc7ea7a28fe9c263"
export BASTION_KEY_NAME="xrestaurant-bastion-key"

# VPC Endpoints Configuration (added by 11-create-vpc-endpoints.sh)
export VPC_ENDPOINT_S3="vpce-01822bcc5913f8a91"
export VPC_ENDPOINT_ECR_API="vpce-0979ed3b5100a1d69"
export VPC_ENDPOINT_ECR_DKR="vpce-030198720fda09abc"
export VPC_ENDPOINT_LOGS="vpce-0cf244c251acffcca"
export VPC_ENDPOINT_SECRETS="vpce-0ca96234d57679f1b"
