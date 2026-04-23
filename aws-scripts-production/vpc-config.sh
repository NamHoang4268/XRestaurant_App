# VPC Configuration
# Generated: Sat Apr 18 01:04:56 +07 2026

export AWS_REGION="ap-southeast-1"
export VPC_ID="vpc-02995c5f3da148e4f"
export VPC_NAME="xrestaurant-vpc"
export IGW_ID="igw-07c69a303543c9828"

# Public Subnets
export PUBLIC_SUBNET_1="subnet-000753c317f48c271"
export PUBLIC_SUBNET_2="subnet-002cd8f225462f4d6"

# Private App Subnets
export PRIVATE_APP_SUBNET_1="subnet-09179cae58d53dbeb"
export PRIVATE_APP_SUBNET_2="subnet-06f46ddab4d31e13b"

# Private Data Subnets
export PRIVATE_DATA_SUBNET_1="subnet-099e71f459e9fa46e"
export PRIVATE_DATA_SUBNET_2="subnet-05977539abdc00bf0"

# NAT Gateway (Single)
export NAT_GW_ID="nat-0cdd4d16540e822ba"
export EIP_ALLOC_ID="eipalloc-05eaba0163b22fa4c"

# Route Tables
export PUBLIC_RT_ID="rtb-082686239a9b5f65d"
export PRIVATE_RT_ID="rtb-0d40fdddcf4c29211"

# Tags
export OWNER="NamHoang"
export PROJECT="XRestaurant"

# Security Groups
# Generated: Sat Apr 18 01:15:59 +07 2026

export SG_ALB="sg-0be0a73ffd77dc44e"
export SG_ECS="sg-0dfa497a2184f941e"
export SG_RDS="sg-073b201dd226ab3ca"
export SG_REDIS="sg-01cd67b5bb22698f5"

# S3 Buckets
# Generated: Sat Apr 18 01:33:45 +07 2026

export FRONTEND_BUCKET="xrestaurant-frontend-905418484418"
export FRONTEND_URL="http://xrestaurant-frontend-905418484418.s3-website-ap-southeast-1.amazonaws.com"
export MEDIA_BUCKET="xrestaurant-media-905418484418"
export DOCUMENTS_BUCKET="xrestaurant-documents-905418484418"
export SNAPSHOTS_BUCKET="xrestaurant-snapshots-905418484418"
export ACCOUNT_ID="905418484418"

# ECR Repository
# Generated: Sat Apr 18 01:46:29 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="905418484418.dkr.ecr.ap-southeast-1.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Sat Apr 18 02:06:43 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ECR Repository
# Generated: Sat Apr 18 02:14:20 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="905418484418.dkr.ecr.ap-southeast-1.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Sat Apr 18 02:16:30 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ALB Configuration
# Generated: Sat Apr 18 02:33:52 +07 2026

export ALB_NAME="xrestaurant-alb"
export ALB_ARN="arn:aws:elasticloadbalancing:ap-southeast-1:905418484418:loadbalancer/app/xrestaurant-alb/3cbc8fd98fab3eeb"
export ALB_DNS="xrestaurant-alb-977783244.ap-southeast-1.elb.amazonaws.com"
export TARGET_GROUP_NAME="xrestaurant-tg"
export TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:ap-southeast-1:905418484418:targetgroup/xrestaurant-tg/7c4434b69fa05f48"
export LISTENER_ARN="arn:aws:elasticloadbalancing:ap-southeast-1:905418484418:listener/app/xrestaurant-alb/3cbc8fd98fab3eeb/1bc8fd6c7aa27a6c"
export BACKEND_URL="http://xrestaurant-alb-977783244.ap-southeast-1.elb.amazonaws.com"

# ECR Repository
# Generated: Sat Apr 18 02:47:52 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="905418484418.dkr.ecr.ap-southeast-1.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Sat Apr 18 02:51:28 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ECR Repository
# Generated: Sat Apr 18 03:00:32 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="905418484418.dkr.ecr.ap-southeast-1.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Sat Apr 18 03:04:13 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ECS Configuration
# Generated: Sat Apr 18 03:14:01 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# ECR Repository
# Generated: Sat Apr 18 03:24:17 +07 2026

export ECR_REPOSITORY_NAME="xrestaurant-backend"
export ECR_REPOSITORY_URI="905418484418.dkr.ecr.ap-southeast-1.amazonaws.com/xrestaurant-backend"
export ECR_IMAGE_TAG="s3-mock"

# ECS Configuration
# Generated: Sat Apr 18 03:28:15 +07 2026

export ECS_CLUSTER="xrestaurant-cluster"
export ECS_SERVICE="xrestaurant-backend-service"
export ECS_TASK_FAMILY="xrestaurant-backend-task"
export ECS_EXECUTION_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-execution-role"
export ECS_TASK_ROLE_ARN="arn:aws:iam::905418484418:role/xrestaurant-ecs-task-role"
export ECS_LOG_GROUP="/ecs/xrestaurant-backend"

# CloudFront Configuration
# Generated: Sat Apr 18 04:24:50 +07 2026

export CLOUDFRONT_DISTRIBUTION_ID="E21QEA9U9HQRM7"
export CLOUDFRONT_DOMAIN="djezxf7soso5m.cloudfront.net"
export CLOUDFRONT_URL="https://djezxf7soso5m.cloudfront.net"

# Cognito Configuration
# Generated: Sat Apr 18 10:38:30 +07 2026

export COGNITO_USER_POOL_ID="ap-southeast-1_nfrKwoTEm"
export COGNITO_USER_POOL_ARN="arn:aws:cognito-idp:ap-southeast-1:905418484418:userpool/ap-southeast-1_nfrKwoTEm"
export COGNITO_APP_CLIENT_ID="4m97ij43pbm29j01o78ke3chn8"
export COGNITO_APP_CLIENT_SECRET="1vbtuoe19arvod1o5gu1tktrl01kdkgdvn25ulof2768l4tsa4pr"
export COGNITO_DOMAIN="xrestaurant-1776345995"
export COGNITO_HOSTED_UI_URL="https://xrestaurant-1776345995.auth.ap-southeast-1.amazoncognito.com"
export COGNITO_AUTH_ROLE_ARN="arn:aws:iam::905418484418:role/Cognito_XRestaurant_Auth_Role"

# SNS + SQS + Lambda Configuration (added by 13-create-sns-sqs-lambda.sh)
export SNS_TOPIC_ARN="arn:aws:sns:ap-southeast-1:905418484418:xrestaurant-order-events"
export SQS_QUEUE_URL="https://sqs.ap-southeast-1.amazonaws.com/905418484418/xrestaurant-order-processing"
export SQS_QUEUE_ARN="arn:aws:sqs:ap-southeast-1:905418484418:xrestaurant-order-processing"
export DLQ_URL="https://sqs.ap-southeast-1.amazonaws.com/905418484418/xrestaurant-order-dlq"
export DLQ_ARN="arn:aws:sqs:ap-southeast-1:905418484418:xrestaurant-order-dlq"
export LAMBDA_FUNCTION_NAME="xrestaurant-order-processor"
export LAMBDA_ARN="arn:aws:lambda:ap-southeast-1:905418484418:function:xrestaurant-order-processor"

# WAF Configuration
# Generated: Sat Apr 18 10:59:05 +07 2026

export WEB_ACL_NAME="xrestaurant-waf"
export WEB_ACL_ID="3c2bd7ca-5335-497b-b4e2-68f8cd68e429"
export WEB_ACL_ARN="arn:aws:wafv2:us-east-1:905418484418:global/webacl/xrestaurant-waf/3c2bd7ca-5335-497b-b4e2-68f8cd68e429"
export WAF_DASHBOARD="XRestaurant-WAF-Dashboard"

# VPC Endpoints Configuration (added by 11-create-vpc-endpoints.sh)
export VPC_ENDPOINT_S3="vpce-063eea138a6c5e661"
export VPC_ENDPOINT_ECR_API="vpce-0aa740d5fd5d0e6ab"
export VPC_ENDPOINT_ECR_DKR="vpce-0b4ff3f697a457b08"
export VPC_ENDPOINT_LOGS="vpce-01a7142551864c8ae"
export VPC_ENDPOINT_SECRETS="vpce-0c3722a8eb43cacfb"

# CloudTrail Configuration
# Generated: Sat Apr 18 11:08:29 +07 2026

export TRAIL_NAME="xrestaurant-trail"
export TRAIL_ARN="arn:aws:cloudtrail:ap-southeast-1:905418484418:trail/xrestaurant-trail"
export TRAIL_BUCKET="xrestaurant-cloudtrail-905418484418"
export TRAIL_LOG_GROUP="/aws/cloudtrail/xrestaurant"

# RDS Configuration (added by 03-create-rds.sh)
export DB_INSTANCE_ID="xrestaurant-db"
export DB_NAME="xrestaurant"
export DB_USERNAME="xrestaurant_admin"
export DB_ENDPOINT="xrestaurant-db.clw2ymci0197.ap-southeast-1.rds.amazonaws.com"
export DB_PORT="5432"
export DB_SECRET_NAME="xrestaurant/rds/credentials"
export DB_SUBNET_GROUP="xrestaurant-db-subnet-group"
