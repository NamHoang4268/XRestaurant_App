// =============================================================================
// Metrics Configuration for PostgreSQL Migration
// =============================================================================
// This module configures custom metrics collection for the application
// Integrates with Sequelize, Express, and business logic to collect metrics
// =============================================================================

const { initializeMetrics, getMetricsCollector } = require('../middleware/metricsCollector');

// Initialize metrics collector with configuration
const metricsCollector = initializeMetrics({
    region: process.env.AWS_REGION || 'us-west-2',
    namespace: 'XRestaurant/Application',
    enabled: process.env.NODE_ENV === 'production',
    bufferSize: 20,
    flushInterval: 60000 // 1 minute
});

// Configure Sequelize hooks for database metrics
function configureSequelizeMetrics(sequelize) {
    if (!sequelize || !metricsCollector.enabled) return;

    const hooks = metricsCollector.sequelizeHook();
    
    // Add hooks to Sequelize instance
    sequelize.addHook('beforeQuery', hooks.beforeQuery);
    sequelize.addHook('afterQuery', hooks.afterQuery);
    
    // Monitor connection pool
    if (sequelize.connectionManager && sequelize.connectionManager.pool) {
        const pool = sequelize.connectionManager.pool;
        
        // Record pool metrics every 30 seconds
        setInterval(() => {
            const active = pool.used || 0;
            const idle = pool.available || 0;
            const total = pool.size || 0;
            
            metricsCollector.recordConnectionPool(active, idle, total);
        }, 30000);
    }
    
    console.log('[METRICS] Sequelize metrics configured');
}

// Configure Express middleware for API metrics
function configureExpressMetrics(app) {
    if (!app || !metricsCollector.enabled) return;
    
    // Add metrics middleware
    app.use(metricsCollector.middleware());
    
    console.log('[METRICS] Express metrics middleware configured');
}

// Business logic metrics helpers
const businessMetrics = {
    // Order processing metrics
    recordOrder: (duration, status, orderValue = 0) => {
        metricsCollector.recordOrderProcessing(duration, status, orderValue);
    },
    
    // Payment processing metrics
    recordPayment: (duration, provider, status, amount = 0) => {
        metricsCollector.recordPaymentProcessing(duration, provider, status, amount);
    },
    
    // Error tracking
    recordError: (errorType, endpoint, errorMessage) => {
        metricsCollector.recordError(errorType, endpoint, errorMessage);
    },
    
    // Custom business events
    recordCustomEvent: (eventName, value, dimensions = []) => {
        metricsCollector.addMetric(eventName, value, 'Count', dimensions);
    }
};

// Metrics endpoint for health checks and debugging
function createMetricsEndpoint(app) {
    if (!app) return;
    
    app.get('/metrics', (req, res) => {
        try {
            const summary = metricsCollector.getMetricsSummary();
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                metrics: summary
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    });
    
    console.log('[METRICS] Metrics endpoint created at /metrics');
}

// Enhanced error handler with metrics
function createMetricsErrorHandler() {
    return (error, req, res, next) => {
        // Record error metrics
        const errorType = error.name || 'UnknownError';
        const endpoint = `${req.method} ${req.path}`;
        
        businessMetrics.recordError(errorType, endpoint, error.message);
        
        // Continue with normal error handling
        next(error);
    };
}

// Wrapper for async functions to measure execution time
function measureAsync(name, asyncFunction, dimensions = []) {
    return async (...args) => {
        const startTime = Date.now();
        let status = 'Success';
        let result;
        
        try {
            result = await asyncFunction(...args);
            return result;
        } catch (error) {
            status = 'Error';
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            metricsCollector.addMetric(name, duration, 'Milliseconds', [
                ...dimensions,
                { name: 'Status', value: status }
            ]);
        }
    };
}

// Wrapper for synchronous functions to measure execution time
function measureSync(name, syncFunction, dimensions = []) {
    return (...args) => {
        const startTime = Date.now();
        let status = 'Success';
        let result;
        
        try {
            result = syncFunction(...args);
            return result;
        } catch (error) {
            status = 'Error';
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            metricsCollector.addMetric(name, duration, 'Milliseconds', [
                ...dimensions,
                { name: 'Status', value: status }
            ]);
        }
    };
}

// Database operation wrappers
const databaseMetrics = {
    // Wrap Sequelize model operations
    wrapModel: (model, modelName) => {
        const originalMethods = {};
        const methodsToWrap = ['findAll', 'findOne', 'findByPk', 'create', 'update', 'destroy', 'bulkCreate'];
        
        methodsToWrap.forEach(methodName => {
            if (typeof model[methodName] === 'function') {
                originalMethods[methodName] = model[methodName];
                
                model[methodName] = measureAsync(
                    'DatabaseOperation',
                    originalMethods[methodName].bind(model),
                    [
                        { name: 'Model', value: modelName },
                        { name: 'Operation', value: methodName }
                    ]
                );
            }
        });
        
        return model;
    },
    
    // Wrap transaction operations
    wrapTransaction: (sequelize) => {
        const originalTransaction = sequelize.transaction;
        
        sequelize.transaction = measureAsync(
            'DatabaseTransaction',
            originalTransaction.bind(sequelize),
            [{ name: 'Type', value: 'Transaction' }]
        );
        
        return sequelize;
    }
};

// Stripe payment metrics wrapper
function wrapStripeOperations(stripe) {
    if (!stripe) return stripe;
    
    const originalMethods = {};
    const methodsToWrap = ['paymentIntents', 'charges', 'customers', 'subscriptions'];
    
    methodsToWrap.forEach(resource => {
        if (stripe[resource]) {
            const operations = ['create', 'retrieve', 'update', 'list'];
            
            operations.forEach(operation => {
                if (typeof stripe[resource][operation] === 'function') {
                    const originalMethod = stripe[resource][operation];
                    
                    stripe[resource][operation] = measureAsync(
                        'StripeOperation',
                        originalMethod.bind(stripe[resource]),
                        [
                            { name: 'Resource', value: resource },
                            { name: 'Operation', value: operation }
                        ]
                    );
                }
            });
        }
    });
    
    return stripe;
}

// Socket.io metrics wrapper
function wrapSocketIO(io) {
    if (!io) return io;
    
    const originalEmit = io.emit;
    io.emit = function(eventName, ...args) {
        metricsCollector.addMetric('SocketIOEvents', 1, 'Count', [
            { name: 'EventName', value: eventName }
        ]);
        
        return originalEmit.apply(this, [eventName, ...args]);
    };
    
    io.on('connection', (socket) => {
        metricsCollector.addMetric('SocketIOConnections', 1, 'Count', [
            { name: 'Type', value: 'Connected' }
        ]);
        
        socket.on('disconnect', () => {
            metricsCollector.addMetric('SocketIOConnections', 1, 'Count', [
                { name: 'Type', value: 'Disconnected' }
            ]);
        });
    });
    
    return io;
}

module.exports = {
    metricsCollector,
    configureSequelizeMetrics,
    configureExpressMetrics,
    createMetricsEndpoint,
    createMetricsErrorHandler,
    businessMetrics,
    measureAsync,
    measureSync,
    databaseMetrics,
    wrapStripeOperations,
    wrapSocketIO,
    getMetricsCollector
};