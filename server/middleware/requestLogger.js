/**
 * Request Logging Middleware
 * 
 * Features:
 * - Generates unique request ID for each request
 * - Logs all HTTP requests with duration
 * - Tracks request/response details
 * - Integrates with Winston logger
 * 
 * Requirements: 16.2, 16.3, 16.4
 */

const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate unique request ID
 */
function generateRequestId() {
    return uuidv4();
}

/**
 * Request logger middleware
 * Logs all incoming requests and their responses
 */
function requestLogger(req, res, next) {
    // Generate unique request ID
    req.id = generateRequestId();
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', req.id);
    
    // Record start time
    const startTime = Date.now();
    
    // Log request start (debug level)
    logger.debug('Request started', {
        type: 'http_request_start',
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    
    // Capture original res.json to log response
    const originalJson = res.json.bind(res);
    res.json = function(body) {
        res.body = body; // Store response body for logging
        return originalJson(body);
    };
    
    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        // Log request completion
        logger.logRequest(req, res, duration);
        
        // Log slow requests (> 3 seconds)
        if (duration > 3000) {
            logger.warn('Slow request detected', {
                type: 'slow_request',
                requestId: req.id,
                method: req.method,
                url: req.originalUrl,
                duration: `${duration}ms`,
                statusCode: res.statusCode,
            });
        }
    });
    
    // Log errors
    res.on('error', (error) => {
        logger.error('Response error', {
            type: 'http_response_error',
            requestId: req.id,
            method: req.method,
            url: req.originalUrl,
            error: error.message,
            stack: error.stack,
        });
    });
    
    next();
}

/**
 * Skip logging for specific routes (e.g., health checks)
 */
function skipLogging(req) {
    const skipPaths = [
        '/health',
        '/favicon.ico',
    ];
    
    return skipPaths.some(path => req.originalUrl.startsWith(path));
}

/**
 * Conditional request logger
 * Skips logging for health checks and static files
 */
function conditionalRequestLogger(req, res, next) {
    if (skipLogging(req)) {
        return next();
    }
    
    return requestLogger(req, res, next);
}

module.exports = {
    requestLogger,
    conditionalRequestLogger,
    generateRequestId,
};
