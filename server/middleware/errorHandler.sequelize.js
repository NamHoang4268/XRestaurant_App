/**
 * Error Handler Middleware for Sequelize
 * 
 * Handles all Sequelize-specific errors and converts them to appropriate HTTP responses.
 * This middleware should be placed after all routes in the Express app.
 * 
 * Supported Error Types:
 * - SequelizeUniqueConstraintError (409 Conflict)
 * - SequelizeForeignKeyConstraintError (400 Bad Request)
 * - SequelizeValidationError (400 Bad Request)
 * - SequelizeDatabaseError (500 Internal Server Error)
 * - SequelizeConnectionError (503 Service Unavailable)
 * - SequelizeTimeoutError (504 Gateway Timeout)
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.8
 */

const {
    ValidationError,
    UniqueConstraintError,
    ForeignKeyConstraintError,
    DatabaseError,
    ConnectionError,
    TimeoutError,
    OptimisticLockError,
    ExclusionConstraintError,
} = require('sequelize');

/**
 * Extract field name from Sequelize error
 * @param {Error} error - Sequelize error
 * @returns {string|null} - Field name or null
 */
function extractFieldName(error) {
    if (error.fields) {
        return Object.keys(error.fields)[0];
    }
    if (error.errors && error.errors.length > 0) {
        return error.errors[0].path;
    }
    return null;
}

/**
 * Extract constraint name from error message
 * @param {string} message - Error message
 * @returns {string|null} - Constraint name or null
 */
function extractConstraintName(message) {
    const match = message.match(/constraint "([^"]+)"/);
    return match ? match[1] : null;
}

/**
 * Format validation errors into user-friendly messages
 * @param {Array} errors - Array of validation errors
 * @returns {Array} - Formatted error messages
 */
function formatValidationErrors(errors) {
    return errors.map(err => ({
        field: err.path,
        message: err.message,
        type: err.type,
        value: err.value,
    }));
}

/**
 * Log error details for debugging
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 */
function logError(error, req) {
    const errorDetails = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.user?.id || 'anonymous',
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
    };

    // Add query details if available
    if (error.sql) {
        errorDetails.sql = error.sql;
        errorDetails.parameters = error.parameters;
    }

    // Log to console (in production, this should go to CloudWatch)
    console.error('[Database Error]', JSON.stringify(errorDetails, null, 2));
}

/**
 * Main error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function sequelizeErrorHandler(err, req, res, next) {
    // Log all database errors
    if (err.name && err.name.startsWith('Sequelize')) {
        logError(err, req);
    }

    // Handle Sequelize Unique Constraint Error (409 Conflict)
    if (err instanceof UniqueConstraintError) {
        const field = extractFieldName(err);
        const value = err.fields ? err.fields[field] : null;
        
        return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: `A record with this ${field} already exists.`,
            details: {
                field,
                value,
                constraint: err.parent?.constraint || 'unique_constraint',
            },
        });
    }

    // Handle Sequelize Foreign Key Constraint Error (400 Bad Request)
    if (err instanceof ForeignKeyConstraintError) {
        const field = extractFieldName(err);
        const constraint = extractConstraintName(err.message);
        
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: `Invalid reference: The ${field} does not exist or has been deleted.`,
            details: {
                field,
                constraint,
                type: 'foreign_key_violation',
            },
        });
    }

    // Handle Sequelize Validation Error (400 Bad Request)
    if (err instanceof ValidationError) {
        const validationErrors = formatValidationErrors(err.errors);
        
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'One or more fields failed validation.',
            details: {
                errors: validationErrors,
            },
        });
    }

    // Handle Sequelize Exclusion Constraint Error (409 Conflict)
    if (err instanceof ExclusionConstraintError) {
        const field = extractFieldName(err);
        
        return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: `The ${field} conflicts with an existing record.`,
            details: {
                field,
                constraint: err.parent?.constraint || 'exclusion_constraint',
            },
        });
    }

    // Handle Sequelize Optimistic Lock Error (409 Conflict)
    if (err instanceof OptimisticLockError) {
        return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: 'The record has been modified by another user. Please refresh and try again.',
            details: {
                type: 'optimistic_lock_error',
            },
        });
    }

    // Handle Sequelize Connection Error (503 Service Unavailable)
    if (err instanceof ConnectionError) {
        return res.status(503).json({
            success: false,
            error: 'Service Unavailable',
            message: 'Database connection failed. Please try again later.',
            details: {
                type: 'connection_error',
                retryAfter: 30, // seconds
            },
        });
    }

    // Handle Sequelize Timeout Error (504 Gateway Timeout)
    if (err instanceof TimeoutError) {
        return res.status(504).json({
            success: false,
            error: 'Gateway Timeout',
            message: 'Database query timed out. Please try again.',
            details: {
                type: 'timeout_error',
            },
        });
    }

    // Handle Generic Sequelize Database Error (500 Internal Server Error)
    if (err instanceof DatabaseError) {
        // Check for specific PostgreSQL error codes
        const pgErrorCode = err.parent?.code;
        
        switch (pgErrorCode) {
            case '23505': // unique_violation
                return res.status(409).json({
                    success: false,
                    error: 'Conflict',
                    message: 'A record with this value already exists.',
                    details: {
                        type: 'unique_violation',
                        constraint: err.parent?.constraint,
                    },
                });
            
            case '23503': // foreign_key_violation
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Invalid reference to related record.',
                    details: {
                        type: 'foreign_key_violation',
                        constraint: err.parent?.constraint,
                    },
                });
            
            case '23502': // not_null_violation
                const column = err.parent?.column;
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: `The field '${column}' is required.`,
                    details: {
                        type: 'not_null_violation',
                        field: column,
                    },
                });
            
            case '23514': // check_violation
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Value does not meet database constraints.',
                    details: {
                        type: 'check_violation',
                        constraint: err.parent?.constraint,
                    },
                });
            
            case '22P02': // invalid_text_representation
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Invalid data format.',
                    details: {
                        type: 'invalid_format',
                    },
                });
            
            case '42P01': // undefined_table
                return res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'Database schema error. Please contact support.',
                    details: {
                        type: 'schema_error',
                    },
                });
            
            default:
                // Generic database error
                return res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'A database error occurred. Please try again later.',
                    details: {
                        type: 'database_error',
                        code: pgErrorCode,
                    },
                });
        }
    }

    // If not a Sequelize error, pass to next error handler
    next(err);
}

/**
 * Generic error handler for non-Sequelize errors
 * This should be placed after sequelizeErrorHandler
 */
function genericErrorHandler(err, req, res, next) {
    // Log the error
    console.error('[Generic Error]', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        error: err.message,
        stack: err.stack,
    });

    // Handle known error types
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Authentication required.',
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid token.',
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Token expired.',
        });
    }

    if (err.name === 'MulterError') {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: `File upload error: ${err.message}`,
        });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'An unexpected error occurred.';

    res.status(statusCode).json({
        success: false,
        error: statusCode === 500 ? 'Internal Server Error' : 'Error',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}

/**
 * 404 Not Found handler
 * This should be placed before error handlers
 */
function notFoundHandler(req, res, next) {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found.`,
    });
}

module.exports = {
    sequelizeErrorHandler,
    genericErrorHandler,
    notFoundHandler,
};
