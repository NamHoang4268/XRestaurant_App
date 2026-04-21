/**
 * Winston Logger Configuration with CloudWatch Integration
 * 
 * Features:
 * - Structured logging with JSON format
 * - CloudWatch Logs integration for production
 * - Console logging for development
 * - Request ID tracking
 * - Slow query logging (> 1 second)
 * - Database connection event logging
 * - Log levels: error, warn, info, http, debug
 * 
 * Requirements: 14.6, 14.7, 16.2, 16.3, 16.4
 */

const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Log level based on environment
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Custom format for console output (colorized and pretty)
 */
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        
        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            msg += `\n${JSON.stringify(meta, null, 2)}`;
        }
        
        return msg;
    })
);

/**
 * Custom format for CloudWatch (JSON)
 */
const cloudwatchFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
    level: logLevel,
    format: cloudwatchFormat,
    defaultMeta: {
        service: 'xrestaurant-backend',
        environment: process.env.NODE_ENV || 'development',
    },
    transports: [],
});

/**
 * Console transport (always enabled)
 */
logger.add(new winston.transports.Console({
    format: consoleFormat,
}));

/**
 * CloudWatch transport (production only)
 */
if (isProduction && process.env.AWS_REGION) {
    const cloudwatchConfig = {
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP || '/aws/ecs/xrestaurant-backend',
        logStreamName: () => {
            const date = new Date().toISOString().split('T')[0];
            return `${date}-${process.env.ECS_TASK_ID || 'local'}`;
        },
        awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
        messageFormatter: ({ level, message, ...meta }) => {
            return JSON.stringify({
                level,
                message,
                ...meta,
            });
        },
        retentionInDays: 30, // Keep logs for 30 days
    };

    try {
        logger.add(new WinstonCloudWatch(cloudwatchConfig));
        logger.info('CloudWatch logging enabled', {
            logGroup: cloudwatchConfig.logGroupName,
            region: cloudwatchConfig.awsRegion,
        });
    } catch (error) {
        logger.error('Failed to initialize CloudWatch logging', {
            error: error.message,
        });
    }
}

/**
 * File transport for errors (optional, for local debugging)
 */
if (isDevelopment) {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: cloudwatchFormat,
    }));
    
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        format: cloudwatchFormat,
    }));
}

/**
 * Log database query
 * @param {string} sql - SQL query
 * @param {number} duration - Query duration in milliseconds
 * @param {Object} options - Additional options
 */
logger.logQuery = function(sql, duration, options = {}) {
    const isSlow = duration > 1000; // Slow query threshold: 1 second
    
    const logData = {
        type: 'database_query',
        sql: sql.substring(0, 500), // Truncate long queries
        duration: `${duration}ms`,
        slow: isSlow,
        ...options,
    };
    
    if (isSlow) {
        logger.warn('Slow query detected', logData);
    } else if (isDevelopment) {
        logger.debug('Query executed', logData);
    }
};

/**
 * Log database connection event
 * @param {string} event - Event name (connected, disconnected, error)
 * @param {Object} details - Event details
 */
logger.logConnection = function(event, details = {}) {
    const logData = {
        type: 'database_connection',
        event,
        ...details,
    };
    
    if (event === 'error' || event === 'disconnected') {
        logger.error('Database connection issue', logData);
    } else {
        logger.info('Database connection event', logData);
    }
};

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
logger.logRequest = function(req, res, duration) {
    const logData = {
        type: 'http_request',
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.user?.id || 'anonymous',
        requestId: req.id,
    };
    
    if (res.statusCode >= 500) {
        logger.error('HTTP request failed', logData);
    } else if (res.statusCode >= 400) {
        logger.warn('HTTP request error', logData);
    } else {
        logger.http('HTTP request', logData);
    }
};

/**
 * Log authentication event
 * @param {string} event - Event name (login, logout, token_refresh, etc.)
 * @param {Object} details - Event details
 */
logger.logAuth = function(event, details = {}) {
    const logData = {
        type: 'authentication',
        event,
        ...details,
    };
    
    if (event === 'login_failed' || event === 'token_invalid') {
        logger.warn('Authentication issue', logData);
    } else {
        logger.info('Authentication event', logData);
    }
};

/**
 * Log payment event
 * @param {string} event - Event name (payment_created, payment_succeeded, payment_failed, etc.)
 * @param {Object} details - Event details
 */
logger.logPayment = function(event, details = {}) {
    const logData = {
        type: 'payment',
        event,
        ...details,
    };
    
    if (event === 'payment_failed' || event === 'refund_failed') {
        logger.error('Payment issue', logData);
    } else {
        logger.info('Payment event', logData);
    }
};

/**
 * Log business event
 * @param {string} event - Event name (order_created, booking_confirmed, etc.)
 * @param {Object} details - Event details
 */
logger.logBusiness = function(event, details = {}) {
    const logData = {
        type: 'business_event',
        event,
        ...details,
    };
    
    logger.info('Business event', logData);
};

/**
 * Log security event
 * @param {string} event - Event name (suspicious_activity, rate_limit_exceeded, etc.)
 * @param {Object} details - Event details
 */
logger.logSecurity = function(event, details = {}) {
    const logData = {
        type: 'security',
        event,
        ...details,
    };
    
    logger.warn('Security event', logData);
};

module.exports = logger;
