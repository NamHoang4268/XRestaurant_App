/**
 * Database Configuration with Query Logging
 * 
 * This is an enhanced version of database.js with query logging support.
 * To use this version, rename it to database.js or import from this file.
 * 
 * Features:
 * - Query logging with duration tracking
 * - Slow query detection (> 1 second)
 * - Connection event logging
 * - CloudWatch integration via Winston
 * 
 * Requirements: 14.6, 14.7, 16.2, 16.3, 16.4
 */

import { Sequelize } from 'sequelize';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';

// Import logger (CommonJS module)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const logger = require('./logger');

dotenv.config();

let sequelize = null;

/**
 * Retrieve database credentials from AWS Secrets Manager
 * @returns {Promise<Object>} Database credentials object
 */
async function getDatabaseCredentials() {
    const secretName = process.env.DB_SECRET_NAME || 'xrestaurant/rds/credentials';
    const region = process.env.AWS_REGION || 'ap-southeast-1';
    
    const client = new SecretsManagerClient({ region });
    
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
                VersionStage: 'AWSCURRENT',
            })
        );
        
        const secret = JSON.parse(response.SecretString);
        logger.info('Database credentials retrieved from Secrets Manager', {
            secretName,
            region,
        });
        
        return {
            host: secret.host,
            port: secret.port || 5432,
            database: secret.dbname || secret.database,
            username: secret.username,
            password: secret.password
        };
    } catch (error) {
        logger.error('Failed to retrieve database credentials from Secrets Manager', {
            error: error.message,
            secretName,
        });
        
        // Fallback to environment variables for local development
        if (process.env.DB_HOST) {
            logger.warn('Using database credentials from environment variables');
            return {
                host: process.env.DB_HOST,
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'xrestaurant',
                username: process.env.DB_USER,
                password: process.env.DB_PASSWORD
            };
        }
        
        throw new Error('Database credentials not available from Secrets Manager or environment variables');
    }
}

/**
 * Custom query logger
 * Logs queries with duration and detects slow queries
 */
function queryLogger(sql, timing) {
    if (timing) {
        logger.logQuery(sql, timing);
    }
}

/**
 * Initialize Sequelize connection with connection pooling and retry logic
 * @returns {Promise<Sequelize>} Sequelize instance
 */
export async function initializeDatabase() {
    if (sequelize) {
        return sequelize;
    }
    
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
    
    while (retryCount < maxRetries) {
        try {
            const credentials = await getDatabaseCredentials();
            
            sequelize = new Sequelize({
                host: credentials.host,
                port: credentials.port,
                database: credentials.database,
                username: credentials.username,
                password: credentials.password,
                dialect: 'postgres',
                
                // Connection pool configuration
                pool: {
                    min: 2,              // Minimum connections
                    max: 10,             // Maximum connections
                    acquire: 30000,      // Maximum time (ms) to acquire connection
                    idle: 10000,         // Maximum time (ms) connection can be idle
                    evict: 1000          // Check for idle connections every second
                },
                
                // SSL configuration for RDS
                dialectOptions: {
                    ssl: process.env.DB_SSL === 'true' ? {
                        require: true,
                        rejectUnauthorized: false  // RDS uses self-signed certs
                    } : false
                },
                
                // Query logging with duration tracking
                logging: (sql, timing) => {
                    queryLogger(sql, timing);
                },
                benchmark: true, // Enable query duration tracking
                
                // Query options
                define: {
                    timestamps: true,
                    underscored: false,      // Use camelCase (matching Mongoose)
                    freezeTableName: true    // Use exact table names
                },
                
                // Retry configuration
                retry: {
                    max: 3,
                    match: [
                        /SequelizeConnectionError/,
                        /SequelizeConnectionRefusedError/,
                        /SequelizeHostNotFoundError/,
                        /SequelizeHostNotReachableError/,
                        /SequelizeInvalidConnectionError/,
                        /SequelizeConnectionTimedOutError/
                    ]
                }
            });
            
            // Test connection
            await sequelize.authenticate();
            logger.logConnection('connected', {
                host: credentials.host,
                port: credentials.port,
                database: credentials.database,
            });
            
            // Setup connection event listeners
            setupConnectionEventListeners(sequelize);
            
            return sequelize;
            
        } catch (error) {
            retryCount++;
            logger.error('Database connection attempt failed', {
                attempt: retryCount,
                maxRetries,
                error: error.message,
            });
            
            if (retryCount >= maxRetries) {
                logger.error('Max retries reached. Unable to connect to database. Exiting...');
                process.exit(1);
            }
            
            const delay = retryDelays[retryCount - 1];
            logger.info(`Retrying database connection in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Setup connection event listeners
 * @param {Sequelize} sequelizeInstance - Sequelize instance
 */
function setupConnectionEventListeners(sequelizeInstance) {
    // Connection acquired from pool
    sequelizeInstance.connectionManager.pool.on('acquire', (connection) => {
        logger.debug('Connection acquired from pool', {
            type: 'connection_pool',
            event: 'acquire',
            connectionId: connection.processID,
        });
    });
    
    // Connection released back to pool
    sequelizeInstance.connectionManager.pool.on('release', (connection) => {
        logger.debug('Connection released back to pool', {
            type: 'connection_pool',
            event: 'release',
            connectionId: connection.processID,
        });
    });
    
    // Connection removed from pool
    sequelizeInstance.connectionManager.pool.on('remove', (connection) => {
        logger.debug('Connection removed from pool', {
            type: 'connection_pool',
            event: 'remove',
            connectionId: connection.processID,
        });
    });
}

/**
 * Get existing Sequelize instance
 * @returns {Sequelize} Sequelize instance
 */
export function getSequelize() {
    if (!sequelize) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return sequelize;
}

/**
 * Close database connection gracefully
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
    if (sequelize) {
        await sequelize.close();
        sequelize = null;
        logger.logConnection('disconnected', {
            reason: 'graceful_shutdown',
        });
    }
}

/**
 * Setup database health check monitoring
 * Periodically checks database connectivity and attempts reconnection if needed
 * @param {Sequelize} sequelizeInstance - Sequelize instance to monitor
 */
export function setupDatabaseHealthCheck(sequelizeInstance) {
    // Periodic health check every 30 seconds
    setInterval(async () => {
        try {
            await sequelizeInstance.query('SELECT 1');
            logger.debug('Database health check passed');
        } catch (error) {
            logger.logConnection('error', {
                reason: 'health_check_failed',
                error: error.message,
            });
            
            // Attempt reconnection
            try {
                await sequelizeInstance.authenticate();
                logger.logConnection('reconnected', {
                    reason: 'health_check_recovery',
                });
            } catch (reconnectError) {
                logger.logConnection('error', {
                    reason: 'reconnection_failed',
                    error: reconnectError.message,
                });
                // In production, this should trigger alerts via CloudWatch
            }
        }
    }, 30000); // Check every 30 seconds
}

/**
 * Get connection pool statistics
 * @returns {Object} Pool statistics
 */
export function getPoolStats() {
    if (!sequelize) {
        return null;
    }
    
    const pool = sequelize.connectionManager.pool;
    
    return {
        size: pool.size,
        available: pool.available,
        using: pool.using,
        waiting: pool.waiting,
        max: pool.max,
        min: pool.min,
    };
}

/**
 * Log connection pool statistics
 */
export function logPoolStats() {
    const stats = getPoolStats();
    
    if (stats) {
        logger.info('Connection pool statistics', {
            type: 'connection_pool_stats',
            ...stats,
        });
    }
}

export default sequelize;
