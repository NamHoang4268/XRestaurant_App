/**
 * Database Health Monitoring Middleware
 * 
 * Features:
 * - Periodic health checks (every 30 seconds)
 * - Automatic reconnection on connection loss
 * - Connection pool metrics tracking
 * - Alert sending on connection failures
 * - Health status endpoint
 * 
 * Requirements: 9.6, 9.7, 16.5, 16.7
 */

const logger = require('../config/logger');

// Health status tracking
let healthStatus = {
    database: {
        connected: false,
        lastCheck: null,
        lastError: null,
        consecutiveFailures: 0,
        uptime: 0,
        startTime: Date.now(),
    },
    connectionPool: {
        size: 0,
        available: 0,
        using: 0,
        waiting: 0,
    },
};

/**
 * Get current health status
 * @returns {Object} Health status object
 */
function getHealthStatus() {
    return {
        ...healthStatus,
        database: {
            ...healthStatus.database,
            uptime: Date.now() - healthStatus.database.startTime,
        },
    };
}

/**
 * Update connection pool metrics
 * @param {Object} sequelize - Sequelize instance
 */
function updatePoolMetrics(sequelize) {
    try {
        const pool = sequelize.connectionManager.pool;
        
        healthStatus.connectionPool = {
            size: pool.size || 0,
            available: pool.available || 0,
            using: pool.using || 0,
            waiting: pool.waiting || 0,
            max: pool.max || 0,
            min: pool.min || 0,
        };
    } catch (error) {
        logger.error('Failed to update pool metrics', {
            error: error.message,
        });
    }
}

/**
 * Check database connectivity
 * @param {Object} sequelize - Sequelize instance
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
async function checkDatabaseConnection(sequelize) {
    try {
        await sequelize.query('SELECT 1');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Attempt to reconnect to database
 * @param {Object} sequelize - Sequelize instance
 * @returns {Promise<boolean>} True if reconnected, false otherwise
 */
async function attemptReconnection(sequelize) {
    try {
        await sequelize.authenticate();
        logger.logConnection('reconnected', {
            reason: 'health_check_recovery',
            consecutiveFailures: healthStatus.database.consecutiveFailures,
        });
        return true;
    } catch (error) {
        logger.logConnection('error', {
            reason: 'reconnection_failed',
            error: error.message,
            consecutiveFailures: healthStatus.database.consecutiveFailures,
        });
        return false;
    }
}

/**
 * Send alert for connection failure
 * @param {number} consecutiveFailures - Number of consecutive failures
 */
function sendConnectionAlert(consecutiveFailures) {
    // In production, this should send alerts via SNS or CloudWatch Alarms
    logger.error('Database connection alert', {
        type: 'connection_alert',
        consecutiveFailures,
        threshold: 3,
        action: 'manual_intervention_required',
    });
    
    // TODO: Implement SNS notification
    // const sns = new AWS.SNS({ region: process.env.AWS_REGION });
    // await sns.publish({
    //     TopicArn: process.env.ALERT_TOPIC_ARN,
    //     Subject: 'Database Connection Alert',
    //     Message: `Database connection has failed ${consecutiveFailures} times consecutively.`,
    // });
}

/**
 * Perform health check
 * @param {Object} sequelize - Sequelize instance
 */
async function performHealthCheck(sequelize) {
    const checkTime = new Date();
    
    try {
        // Check database connection
        const isConnected = await checkDatabaseConnection(sequelize);
        
        if (isConnected) {
            // Connection successful
            healthStatus.database.connected = true;
            healthStatus.database.lastCheck = checkTime;
            healthStatus.database.lastError = null;
            healthStatus.database.consecutiveFailures = 0;
            
            // Update pool metrics
            updatePoolMetrics(sequelize);
            
            logger.debug('Database health check passed', {
                type: 'health_check',
                status: 'healthy',
                pool: healthStatus.connectionPool,
            });
        } else {
            // Connection failed
            healthStatus.database.connected = false;
            healthStatus.database.lastCheck = checkTime;
            healthStatus.database.consecutiveFailures++;
            
            logger.logConnection('error', {
                reason: 'health_check_failed',
                consecutiveFailures: healthStatus.database.consecutiveFailures,
            });
            
            // Attempt reconnection
            const reconnected = await attemptReconnection(sequelize);
            
            if (reconnected) {
                healthStatus.database.connected = true;
                healthStatus.database.consecutiveFailures = 0;
            } else {
                // Send alert after 3 consecutive failures
                if (healthStatus.database.consecutiveFailures >= 3) {
                    sendConnectionAlert(healthStatus.database.consecutiveFailures);
                }
            }
        }
    } catch (error) {
        healthStatus.database.connected = false;
        healthStatus.database.lastCheck = checkTime;
        healthStatus.database.lastError = error.message;
        healthStatus.database.consecutiveFailures++;
        
        logger.error('Health check error', {
            type: 'health_check_error',
            error: error.message,
            consecutiveFailures: healthStatus.database.consecutiveFailures,
        });
    }
}

/**
 * Setup periodic health check
 * @param {Object} sequelize - Sequelize instance
 * @param {number} interval - Check interval in milliseconds (default: 30000)
 */
function setupHealthCheck(sequelize, interval = 30000) {
    // Initial health check
    performHealthCheck(sequelize);
    
    // Periodic health check
    const healthCheckInterval = setInterval(() => {
        performHealthCheck(sequelize);
    }, interval);
    
    // Cleanup on process exit
    process.on('SIGTERM', () => {
        clearInterval(healthCheckInterval);
    });
    
    process.on('SIGINT', () => {
        clearInterval(healthCheckInterval);
    });
    
    logger.info('Database health monitoring started', {
        interval: `${interval}ms`,
        checkFrequency: `${interval / 1000} seconds`,
    });
}

/**
 * Express middleware for health check endpoint
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function healthCheckEndpoint(req, res) {
    const status = getHealthStatus();
    const isHealthy = status.database.connected;
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: status.database.uptime,
        database: {
            connected: status.database.connected,
            lastCheck: status.database.lastCheck,
            lastError: status.database.lastError,
            consecutiveFailures: status.database.consecutiveFailures,
        },
        connectionPool: status.connectionPool,
    });
}

/**
 * Express middleware for detailed health check
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function detailedHealthCheck(req, res) {
    const sequelize = req.app.get('sequelize');
    
    if (!sequelize) {
        return res.status(503).json({
            status: 'unhealthy',
            error: 'Database not initialized',
        });
    }
    
    const checks = {
        database: false,
        query: false,
        pool: false,
    };
    
    const errors = [];
    
    try {
        // Check 1: Connection test
        await sequelize.authenticate();
        checks.database = true;
    } catch (error) {
        errors.push({
            check: 'database',
            error: error.message,
        });
    }
    
    try {
        // Check 2: Query test
        await sequelize.query('SELECT 1');
        checks.query = true;
    } catch (error) {
        errors.push({
            check: 'query',
            error: error.message,
        });
    }
    
    try {
        // Check 3: Pool test
        const pool = sequelize.connectionManager.pool;
        checks.pool = pool.size >= pool.min && pool.size <= pool.max;
        
        if (!checks.pool) {
            errors.push({
                check: 'pool',
                error: 'Pool size out of bounds',
                details: {
                    size: pool.size,
                    min: pool.min,
                    max: pool.max,
                },
            });
        }
    } catch (error) {
        errors.push({
            check: 'pool',
            error: error.message,
        });
    }
    
    const allHealthy = Object.values(checks).every(check => check === true);
    
    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks,
        errors: errors.length > 0 ? errors : undefined,
        connectionPool: healthStatus.connectionPool,
    });
}

/**
 * Log connection pool statistics
 * @param {Object} sequelize - Sequelize instance
 */
function logPoolStatistics(sequelize) {
    updatePoolMetrics(sequelize);
    
    logger.info('Connection pool statistics', {
        type: 'connection_pool_stats',
        ...healthStatus.connectionPool,
        utilizationPercent: healthStatus.connectionPool.max > 0
            ? Math.round((healthStatus.connectionPool.using / healthStatus.connectionPool.max) * 100)
            : 0,
    });
}

/**
 * Setup periodic pool statistics logging
 * @param {Object} sequelize - Sequelize instance
 * @param {number} interval - Log interval in milliseconds (default: 60000)
 */
function setupPoolStatsLogging(sequelize, interval = 60000) {
    const statsInterval = setInterval(() => {
        logPoolStatistics(sequelize);
    }, interval);
    
    // Cleanup on process exit
    process.on('SIGTERM', () => {
        clearInterval(statsInterval);
    });
    
    process.on('SIGINT', () => {
        clearInterval(statsInterval);
    });
    
    logger.info('Connection pool statistics logging started', {
        interval: `${interval}ms`,
        logFrequency: `${interval / 1000} seconds`,
    });
}

module.exports = {
    setupHealthCheck,
    setupPoolStatsLogging,
    healthCheckEndpoint,
    detailedHealthCheck,
    getHealthStatus,
    performHealthCheck,
    logPoolStatistics,
};
