// =============================================================================
// Custom Metrics Collector for PostgreSQL Migration Monitoring
// =============================================================================
// This middleware collects custom application metrics and sends them to CloudWatch:
// 1. API response times by endpoint
// 2. Database query performance metrics
// 3. Connection pool utilization
// 4. Business process metrics (orders, payments)
// 5. Error rates and types
//
// Usage: Add this middleware to Express app after database connection
// =============================================================================

const AWS = require('aws-sdk');
const os = require('os');

class MetricsCollector {
    constructor(options = {}) {
        this.region = options.region || process.env.AWS_REGION || 'ap-southeast-1';
        this.namespace = options.namespace || 'XRestaurant/Application';
        this.enabled = options.enabled !== false && process.env.NODE_ENV === 'production';
        
        // Initialize CloudWatch client
        if (this.enabled) {
            this.cloudwatch = new AWS.CloudWatch({ region: this.region });
        }
        
        // Metrics buffer to batch send metrics
        this.metricsBuffer = [];
        this.bufferSize = options.bufferSize || 20;
        this.flushInterval = options.flushInterval || 60000; // 1 minute
        
        // Start periodic flush
        if (this.enabled) {
            this.startPeriodicFlush();
        }
        
        // Track metrics in memory for debugging
        this.metrics = {
            apiResponseTimes: new Map(),
            databaseQueries: new Map(),
            connectionPool: {
                active: 0,
                idle: 0,
                total: 0
            },
            businessMetrics: {
                orders: 0,
                payments: 0,
                errors: 0
            }
        };
    }

    // Add metric to buffer
    addMetric(metricName, value, unit = 'Count', dimensions = []) {
        if (!this.enabled) return;

        const metric = {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: dimensions.map(dim => ({
                Name: dim.name,
                Value: dim.value
            }))
        };

        this.metricsBuffer.push(metric);

        // Flush if buffer is full
        if (this.metricsBuffer.length >= this.bufferSize) {
            this.flushMetrics();
        }
    }

    // Flush metrics to CloudWatch
    async flushMetrics() {
        if (!this.enabled || this.metricsBuffer.length === 0) return;

        try {
            const params = {
                Namespace: this.namespace,
                MetricData: this.metricsBuffer.splice(0, this.bufferSize)
            };

            await this.cloudwatch.putMetricData(params).promise();
            console.log(`[METRICS] Sent ${params.MetricData.length} metrics to CloudWatch`);
        } catch (error) {
            console.error('[METRICS] Failed to send metrics to CloudWatch:', error.message);
            // Don't throw error to avoid affecting application
        }
    }

    // Start periodic flush
    startPeriodicFlush() {
        setInterval(() => {
            this.flushMetrics();
        }, this.flushInterval);
    }

    // Record API response time
    recordAPIResponseTime(endpoint, responseTime, statusCode) {
        // Update in-memory tracking
        if (!this.metrics.apiResponseTimes.has(endpoint)) {
            this.metrics.apiResponseTimes.set(endpoint, []);
        }
        this.metrics.apiResponseTimes.get(endpoint).push({
            time: responseTime,
            status: statusCode,
            timestamp: new Date()
        });

        // Send to CloudWatch
        this.addMetric('APIResponseTime', responseTime, 'Milliseconds', [
            { name: 'Endpoint', value: endpoint },
            { name: 'StatusCode', value: statusCode.toString() }
        ]);

        // Record success/error rates
        const isSuccess = statusCode >= 200 && statusCode < 400;
        this.addMetric('APIRequests', 1, 'Count', [
            { name: 'Endpoint', value: endpoint },
            { name: 'Status', value: isSuccess ? 'Success' : 'Error' }
        ]);
    }

    // Record database query performance
    recordDatabaseQuery(queryType, duration, tableName = 'unknown') {
        // Update in-memory tracking
        const key = `${queryType}-${tableName}`;
        if (!this.metrics.databaseQueries.has(key)) {
            this.metrics.databaseQueries.set(key, []);
        }
        this.metrics.databaseQueries.get(key).push({
            duration,
            timestamp: new Date()
        });

        // Send to CloudWatch
        this.addMetric('DatabaseQueryDuration', duration, 'Milliseconds', [
            { name: 'QueryType', value: queryType },
            { name: 'TableName', value: tableName }
        ]);

        // Record slow query alert
        if (duration > 1000) { // Queries over 1 second
            this.addMetric('SlowQueries', 1, 'Count', [
                { name: 'QueryType', value: queryType },
                { name: 'TableName', value: tableName }
            ]);
        }
    }

    // Record connection pool metrics
    recordConnectionPool(active, idle, total) {
        this.metrics.connectionPool = { active, idle, total };

        this.addMetric('ConnectionPoolSize', active, 'Count', [
            { name: 'Pool', value: 'Active' }
        ]);
        this.addMetric('ConnectionPoolSize', idle, 'Count', [
            { name: 'Pool', value: 'Idle' }
        ]);
        this.addMetric('ConnectionPoolSize', total, 'Count', [
            { name: 'Pool', value: 'Total' }
        ]);

        // Alert if pool utilization is high
        const utilization = (active / total) * 100;
        this.addMetric('ConnectionPoolUtilization', utilization, 'Percent');
    }

    // Record business process metrics
    recordOrderProcessing(duration, status, orderValue = 0) {
        this.metrics.businessMetrics.orders++;

        this.addMetric('OrderProcessingTime', duration, 'Milliseconds', [
            { name: 'Status', value: status }
        ]);

        if (status === 'Success') {
            this.addMetric('OrderValue', orderValue, 'None');
            this.addMetric('OrdersCompleted', 1, 'Count');
        } else {
            this.addMetric('OrdersFailed', 1, 'Count');
        }
    }

    // Record payment processing metrics
    recordPaymentProcessing(duration, provider, status, amount = 0) {
        this.metrics.businessMetrics.payments++;

        this.addMetric('PaymentProcessingTime', duration, 'Milliseconds', [
            { name: 'Provider', value: provider },
            { name: 'Status', value: status }
        ]);

        if (status === 'Success') {
            this.addMetric('PaymentAmount', amount, 'None', [
                { name: 'Provider', value: provider }
            ]);
            this.addMetric('PaymentsCompleted', 1, 'Count', [
                { name: 'Provider', value: provider }
            ]);
        } else {
            this.addMetric('PaymentsFailed', 1, 'Count', [
                { name: 'Provider', value: provider }
            ]);
        }
    }

    // Record error metrics
    recordError(errorType, endpoint = 'unknown', errorMessage = '') {
        this.metrics.businessMetrics.errors++;

        this.addMetric('ApplicationErrors', 1, 'Count', [
            { name: 'ErrorType', value: errorType },
            { name: 'Endpoint', value: endpoint }
        ]);

        // Record specific error types
        if (errorType.includes('Database')) {
            this.addMetric('DatabaseErrors', 1, 'Count');
        } else if (errorType.includes('Authentication')) {
            this.addMetric('AuthenticationErrors', 1, 'Count');
        } else if (errorType.includes('Validation')) {
            this.addMetric('ValidationErrors', 1, 'Count');
        }
    }

    // Record system metrics
    recordSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Memory metrics
        this.addMetric('NodeMemoryUsage', memoryUsage.heapUsed, 'Bytes', [
            { name: 'Type', value: 'HeapUsed' }
        ]);
        this.addMetric('NodeMemoryUsage', memoryUsage.heapTotal, 'Bytes', [
            { name: 'Type', value: 'HeapTotal' }
        ]);
        this.addMetric('NodeMemoryUsage', memoryUsage.rss, 'Bytes', [
            { name: 'Type', value: 'RSS' }
        ]);

        // System load
        const loadAverage = os.loadavg()[0]; // 1-minute load average
        this.addMetric('SystemLoad', loadAverage, 'None');

        // Free memory
        const freeMemory = os.freemem();
        const totalMemory = os.totalmem();
        const memoryUtilization = ((totalMemory - freeMemory) / totalMemory) * 100;
        this.addMetric('SystemMemoryUtilization', memoryUtilization, 'Percent');
    }

    // Get current metrics summary (for debugging)
    getMetricsSummary() {
        return {
            enabled: this.enabled,
            bufferSize: this.metricsBuffer.length,
            apiEndpoints: Array.from(this.metrics.apiResponseTimes.keys()),
            databaseQueries: Array.from(this.metrics.databaseQueries.keys()),
            connectionPool: this.metrics.connectionPool,
            businessMetrics: this.metrics.businessMetrics
        };
    }

    // Express middleware for automatic API metrics collection
    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Override res.end to capture response time
            const originalEnd = res.end;
            res.end = (...args) => {
                const responseTime = Date.now() - startTime;
                const endpoint = `${req.method} ${req.route?.path || req.path}`;
                
                this.recordAPIResponseTime(endpoint, responseTime, res.statusCode);
                
                // Call original end method
                originalEnd.apply(res, args);
            };
            
            next();
        };
    }

    // Sequelize hook for database query metrics
    sequelizeHook() {
        return {
            beforeQuery: (options) => {
                options.startTime = Date.now();
            },
            afterQuery: (options, result) => {
                if (options.startTime) {
                    const duration = Date.now() - options.startTime;
                    const queryType = options.type || 'UNKNOWN';
                    const tableName = options.model?.tableName || 'unknown';
                    
                    this.recordDatabaseQuery(queryType, duration, tableName);
                }
            }
        };
    }

    // Graceful shutdown - flush remaining metrics
    async shutdown() {
        if (this.enabled && this.metricsBuffer.length > 0) {
            console.log('[METRICS] Flushing remaining metrics before shutdown...');
            await this.flushMetrics();
        }
    }
}

// Singleton instance
let metricsCollector = null;

// Initialize metrics collector
function initializeMetrics(options = {}) {
    if (!metricsCollector) {
        metricsCollector = new MetricsCollector(options);
        
        // Record system metrics every 5 minutes
        if (metricsCollector.enabled) {
            setInterval(() => {
                metricsCollector.recordSystemMetrics();
            }, 5 * 60 * 1000);
        }
        
        // Graceful shutdown handler
        process.on('SIGTERM', async () => {
            if (metricsCollector) {
                await metricsCollector.shutdown();
            }
        });
        
        process.on('SIGINT', async () => {
            if (metricsCollector) {
                await metricsCollector.shutdown();
            }
        });
    }
    
    return metricsCollector;
}

// Get metrics collector instance
function getMetricsCollector() {
    if (!metricsCollector) {
        throw new Error('Metrics collector not initialized. Call initializeMetrics() first.');
    }
    return metricsCollector;
}

module.exports = {
    MetricsCollector,
    initializeMetrics,
    getMetricsCollector
};