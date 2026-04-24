#!/bin/bash

# =============================================================================
# Custom Application Metrics Setup Script
# =============================================================================
# This script sets up custom application metrics for PostgreSQL migration monitoring:
# 1. Creates IAM permissions for CloudWatch metrics
# 2. Updates application configuration for metrics collection
# 3. Creates custom metric namespaces
# 4. Sets up metric filters for log-based metrics
# 5. Provides integration examples and testing
#
# Prerequisites:
# - AWS CLI configured
# - Application deployed with metrics collector code
# - CloudWatch access permissions
# =============================================================================

set -e  # Exit on any error

# Configuration
REGION="us-west-2"
TASK_ROLE_NAME="ecsTaskRole"
NAMESPACE="XRestaurant/Application"
LOG_GROUP_NAME="/ecs/xrestaurant-postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        error "$1 is not installed or not in PATH"
        exit 1
    fi
}

# Function to create IAM policy for CloudWatch metrics
create_cloudwatch_policy() {
    log "Creating IAM policy for CloudWatch metrics..."
    
    # Create policy document
    cat > cloudwatch-metrics-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricData",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:PutMetricFilter"
            ],
            "Resource": [
                "arn:aws:logs:*:*:log-group:/ecs/xrestaurant-*",
                "arn:aws:logs:*:*:log-group:XRestaurant/*"
            ]
        }
    ]
}
EOF

    # Create or update policy
    POLICY_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/XRestaurant-CloudWatch-Metrics"
    
    # Check if policy exists
    if aws iam get-policy --policy-arn $POLICY_ARN >/dev/null 2>&1; then
        log "Policy already exists, updating..."
        aws iam create-policy-version \
            --policy-arn $POLICY_ARN \
            --policy-document file://cloudwatch-metrics-policy.json \
            --set-as-default \
            --region $REGION
    else
        log "Creating new policy..."
        aws iam create-policy \
            --policy-name "XRestaurant-CloudWatch-Metrics" \
            --policy-document file://cloudwatch-metrics-policy.json \
            --description "Policy for XRestaurant application to send custom metrics to CloudWatch" \
            --region $REGION
    fi
    
    success "CloudWatch metrics policy created/updated: $POLICY_ARN"
}

# Function to attach policy to ECS task role
attach_policy_to_role() {
    log "Attaching CloudWatch metrics policy to ECS task role..."
    
    POLICY_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/XRestaurant-CloudWatch-Metrics"
    
    # Attach policy to role
    aws iam attach-role-policy \
        --role-name $TASK_ROLE_NAME \
        --policy-arn $POLICY_ARN \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        success "Policy attached to role: $TASK_ROLE_NAME"
    else
        warning "Policy may already be attached or role doesn't exist"
    fi
}

# Function to create custom metric filters
create_metric_filters() {
    log "Creating custom metric filters..."
    
    # Metric filter for API response times
    aws logs put-metric-filter \
        --log-group-name $LOG_GROUP_NAME \
        --filter-name "APIResponseTimes" \
        --filter-pattern "[timestamp, request_id, level, message=\"Response time:\", duration, endpoint]" \
        --metric-transformations \
            metricName=APIResponseTimeFromLogs,metricNamespace=$NAMESPACE,metricValue='$duration',defaultValue=0 \
        --region $REGION
    
    # Metric filter for database query durations
    aws logs put-metric-filter \
        --log-group-name $LOG_GROUP_NAME \
        --filter-name "DatabaseQueryDurations" \
        --filter-pattern "[timestamp, request_id, level, message=\"Executed\", query, duration=\"*ms\"]" \
        --metric-transformations \
            metricName=DatabaseQueryDurationFromLogs,metricNamespace=$NAMESPACE,metricValue=1,defaultValue=0 \
        --region $REGION
    
    # Metric filter for order processing
    aws logs put-metric-filter \
        --log-group-name $LOG_GROUP_NAME \
        --filter-name "OrderProcessing" \
        --filter-pattern "[timestamp, request_id, level, message=\"Order processed:\", status, duration]" \
        --metric-transformations \
            metricName=OrderProcessingFromLogs,metricNamespace=$NAMESPACE,metricValue=1,defaultValue=0 \
        --region $REGION
    
    # Metric filter for payment processing
    aws logs put-metric-filter \
        --log-group-name $LOG_GROUP_NAME \
        --filter-name "PaymentProcessing" \
        --filter-pattern "[timestamp, request_id, level, message=\"Payment processed:\", provider, status, amount]" \
        --metric-transformations \
            metricName=PaymentProcessingFromLogs,metricNamespace=$NAMESPACE,metricValue=1,defaultValue=0 \
        --region $REGION
    
    success "Custom metric filters created"
}

# Function to create sample custom metrics
create_sample_metrics() {
    log "Creating sample custom metrics for testing..."
    
    # Create sample metrics to test the system
    aws cloudwatch put-metric-data \
        --namespace $NAMESPACE \
        --metric-data \
            MetricName=APIResponseTime,Value=150,Unit=Milliseconds,Dimensions=[{Name=Endpoint,Value=/api/test}] \
            MetricName=DatabaseQueryDuration,Value=50,Unit=Milliseconds,Dimensions=[{Name=QueryType,Value=SELECT}] \
            MetricName=ConnectionPoolSize,Value=5,Unit=Count,Dimensions=[{Name=Pool,Value=Active}] \
        --region $REGION
    
    success "Sample metrics created for testing"
}

# Function to create metrics integration guide
create_integration_guide() {
    log "Creating metrics integration guide..."
    
    cat > METRICS_INTEGRATION_GUIDE.md << 'EOF'
# Custom Metrics Integration Guide

## Overview
This guide shows how to integrate custom metrics collection into your XRestaurant application controllers.

## 1. Initialize Metrics in Main Application

```javascript
// In index.js or app.js
const { configureSequelizeMetrics, configureExpressMetrics, createMetricsEndpoint } = require('./config/metrics');

// After creating Express app
configureExpressMetrics(app);

// After initializing Sequelize
configureSequelizeMetrics(sequelize);

// Add metrics endpoint
createMetricsEndpoint(app);
```

## 2. Add Metrics to Controllers

### User Controller Example
```javascript
const { businessMetrics, measureAsync } = require('../config/metrics');

// Wrap async controller functions
const registerUserController = measureAsync('UserRegistration', async (req, res) => {
    try {
        // Your existing code
        const user = await User.create(userData);
        
        // Record business metric
        businessMetrics.recordCustomEvent('UserRegistered', 1, [
            { name: 'Method', value: 'Email' }
        ]);
        
        res.json({ success: true, user });
    } catch (error) {
        // Record error metric
        businessMetrics.recordError('UserRegistrationError', req.path, error.message);
        throw error;
    }
});
```

### Order Controller Example
```javascript
const { businessMetrics } = require('../config/metrics');

const checkoutTableOrder = async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Your existing checkout logic
        const order = await processOrder(orderData);
        
        // Record order processing metrics
        const duration = Date.now() - startTime;
        businessMetrics.recordOrder(duration, 'Success', order.total);
        
        res.json({ success: true, order });
    } catch (error) {
        const duration = Date.now() - startTime;
        businessMetrics.recordOrder(duration, 'Failed', 0);
        throw error;
    }
};
```

### Payment Controller Example
```javascript
const { businessMetrics, wrapStripeOperations } = require('../config/metrics');

// Wrap Stripe client
const stripe = wrapStripeOperations(require('stripe')(process.env.STRIPE_SECRET_KEY));

const processPayment = async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Process payment with Stripe
        const paymentIntent = await stripe.paymentIntents.create({
            amount: req.body.amount,
            currency: 'usd'
        });
        
        // Record payment metrics
        const duration = Date.now() - startTime;
        businessMetrics.recordPayment(duration, 'Stripe', 'Success', req.body.amount);
        
        res.json({ success: true, paymentIntent });
    } catch (error) {
        const duration = Date.now() - startTime;
        businessMetrics.recordPayment(duration, 'Stripe', 'Failed', 0);
        throw error;
    }
};
```

## 3. Database Model Metrics

```javascript
const { databaseMetrics } = require('../config/metrics');

// Wrap Sequelize models for automatic metrics
const User = databaseMetrics.wrapModel(sequelize.define('User', {
    // model definition
}), 'User');

const Product = databaseMetrics.wrapModel(sequelize.define('Product', {
    // model definition
}), 'Product');
```

## 4. Socket.IO Metrics

```javascript
const { wrapSocketIO } = require('../config/metrics');

// Wrap Socket.IO instance
const io = wrapSocketIO(require('socket.io')(server));
```

## 5. Custom Business Events

```javascript
const { businessMetrics } = require('../config/metrics');

// Record custom events
businessMetrics.recordCustomEvent('TableReservation', 1, [
    { name: 'TableType', value: 'VIP' }
]);

businessMetrics.recordCustomEvent('MenuItemViewed', 1, [
    { name: 'Category', value: 'Appetizers' },
    { name: 'ItemId', value: productId }
]);
```

## 6. Error Tracking

```javascript
const { businessMetrics } = require('../config/metrics');

// In error handlers
app.use((error, req, res, next) => {
    businessMetrics.recordError(error.name, req.path, error.message);
    // Your error handling logic
});
```

## 7. Metrics Endpoint

Access metrics summary at: `GET /metrics`

Response format:
```json
{
    "status": "ok",
    "timestamp": "2026-04-19T12:00:00.000Z",
    "metrics": {
        "enabled": true,
        "bufferSize": 5,
        "apiEndpoints": ["GET /api/category", "POST /api/order"],
        "databaseQueries": ["SELECT-products", "INSERT-orders"],
        "connectionPool": {
            "active": 3,
            "idle": 2,
            "total": 5
        },
        "businessMetrics": {
            "orders": 150,
            "payments": 140,
            "errors": 2
        }
    }
}
```

## 8. Environment Configuration

Set these environment variables:
```bash
NODE_ENV=production          # Enable metrics collection
AWS_REGION=us-west-2   # CloudWatch region
```

## 9. Testing Metrics

```bash
# Test metrics endpoint
curl http://localhost:5000/metrics

# Check CloudWatch metrics
aws cloudwatch list-metrics --namespace "XRestaurant/Application" --region us-west-2

# Get metric statistics
aws cloudwatch get-metric-statistics \
    --namespace "XRestaurant/Application" \
    --metric-name "APIResponseTime" \
    --start-time 2026-04-19T10:00:00Z \
    --end-time 2026-04-19T12:00:00Z \
    --period 300 \
    --statistics Average \
    --region us-west-2
```

## 10. Best Practices

1. **Selective Metrics**: Only collect metrics that provide actionable insights
2. **Batch Sending**: Metrics are automatically batched and sent every minute
3. **Error Handling**: Metrics collection failures don't affect application functionality
4. **Performance**: Minimal overhead in production
5. **Dimensions**: Use dimensions to filter and group metrics effectively
6. **Naming**: Use consistent naming conventions for metrics and dimensions

## 11. Troubleshooting

### Metrics Not Appearing in CloudWatch
- Check IAM permissions for CloudWatch:PutMetricData
- Verify AWS region configuration
- Check application logs for metric sending errors
- Ensure NODE_ENV=production

### High CloudWatch Costs
- Reduce metric frequency
- Use fewer dimensions
- Implement sampling for high-volume metrics
- Monitor CloudWatch usage in billing dashboard

### Performance Issues
- Check metrics buffer size (default: 20)
- Verify flush interval (default: 60 seconds)
- Monitor application memory usage
- Consider disabling metrics for non-critical endpoints
EOF

    success "Metrics integration guide created: METRICS_INTEGRATION_GUIDE.md"
}

# Function to create testing script
create_testing_script() {
    log "Creating metrics testing script..."
    
    cat > test-metrics.sh << 'EOF'
#!/bin/bash

# Test script for custom metrics
REGION="us-west-2"
NAMESPACE="XRestaurant/Application"

echo "Testing custom metrics..."

# 1. Test API endpoint
echo "1. Testing /metrics endpoint..."
curl -s http://localhost:5000/metrics | jq .

# 2. List custom metrics in CloudWatch
echo "2. Listing custom metrics in CloudWatch..."
aws cloudwatch list-metrics --namespace "$NAMESPACE" --region $REGION

# 3. Get sample metric statistics
echo "3. Getting APIResponseTime statistics..."
aws cloudwatch get-metric-statistics \
    --namespace "$NAMESPACE" \
    --metric-name "APIResponseTime" \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 \
    --statistics Average,Maximum,Minimum \
    --region $REGION

# 4. Test metric filters
echo "4. Testing log-based metrics..."
aws logs describe-metric-filters \
    --log-group-name "/ecs/xrestaurant-postgres" \
    --region $REGION

echo "Metrics testing completed!"
EOF

    chmod +x test-metrics.sh
    success "Metrics testing script created: test-metrics.sh"
}

# Function to show next steps
show_next_steps() {
    log "Next Steps for Custom Metrics Implementation:"
    echo "=================================="
    echo "1. Update Application Code:"
    echo "   - Add metrics initialization to index.js"
    echo "   - Integrate metrics into controllers using METRICS_INTEGRATION_GUIDE.md"
    echo "   - Test locally with NODE_ENV=production"
    echo ""
    echo "2. Deploy Updated Application:"
    echo "   - Build new Docker image with metrics code"
    echo "   - Deploy using blue-green deployment script"
    echo "   - Verify metrics endpoint: https://your-domain/metrics"
    echo ""
    echo "3. Verify Metrics in CloudWatch:"
    echo "   - Run: ./test-metrics.sh"
    echo "   - Check CloudWatch console for custom metrics"
    echo "   - Verify alarms are working with new metrics"
    echo ""
    echo "4. Monitor and Optimize:"
    echo "   - Monitor CloudWatch costs"
    echo "   - Adjust metric collection frequency if needed"
    echo "   - Add more business-specific metrics as required"
    echo "=================================="
}

# Function to cleanup
cleanup() {
    log "Cleaning up temporary files..."
    
    if [ -f "cloudwatch-metrics-policy.json" ]; then
        rm cloudwatch-metrics-policy.json
        log "Removed cloudwatch-metrics-policy.json"
    fi
}

# Main execution
main() {
    log "Setting up custom application metrics for PostgreSQL migration..."
    log "Region: $REGION"
    log "Namespace: $NAMESPACE"
    log "Task Role: $TASK_ROLE_NAME"
    
    # Check prerequisites
    log "Checking prerequisites..."
    check_command "aws"
    check_command "jq"
    
    # Verify AWS CLI is configured
    aws sts get-caller-identity > /dev/null
    if [ $? -ne 0 ]; then
        error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi
    
    success "Prerequisites check passed"
    
    # Execute setup steps
    create_cloudwatch_policy
    attach_policy_to_role
    create_metric_filters
    create_sample_metrics
    create_integration_guide
    create_testing_script
    
    # Show results
    show_next_steps
    
    success "Custom metrics setup completed successfully!"
    
    # Cleanup
    cleanup
    
    log "Custom metrics setup finished"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"
EOF