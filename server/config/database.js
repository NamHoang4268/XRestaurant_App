import { Sequelize } from 'sequelize';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';

dotenv.config();

let sequelize = null;

/**
 * Retrieve database credentials from AWS Secrets Manager
 * @returns {Promise<Object>} Database credentials object
 */
async function getDatabaseCredentials() {
    const secretName = process.env.DB_SECRET_NAME || 'xrestaurant/rds/credentials';
    const region = process.env.AWS_REGION || 'us-west-2';
    
    const client = new SecretsManagerClient({ region });
    
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
                VersionStage: 'AWSCURRENT',
            })
        );
        
        const secret = JSON.parse(response.SecretString);
        console.log('✅ Database credentials retrieved from Secrets Manager');
        
        return {
            host: secret.host,
            port: secret.port || 5432,
            database: secret.dbname || secret.database,
            username: secret.username,
            password: secret.password
        };
    } catch (error) {
        console.error('❌ Failed to retrieve database credentials from Secrets Manager:', error.message);
        
        // Fallback to environment variables for local development
        if (process.env.DB_HOST) {
            console.log('⚠️  Using database credentials from environment variables');
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
                
                // Logging
                logging: process.env.NODE_ENV === 'development' ? console.log : false,
                
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
            console.log('✅ Database connection established successfully');
            console.log(`📊 Connected to PostgreSQL at ${credentials.host}:${credentials.port}/${credentials.database}`);
            
            return sequelize;
            
        } catch (error) {
            retryCount++;
            console.error(`❌ Database connection attempt ${retryCount} failed:`, error.message);
            
            if (retryCount >= maxRetries) {
                console.error('❌ Max retries reached. Unable to connect to database. Exiting...');
                process.exit(1);
            }
            
            const delay = retryDelays[retryCount - 1];
            console.log(`⏳ Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
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
        console.log('✅ Database connection closed');
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
        } catch (error) {
            console.error('❌ Database health check failed:', error.message);
            
            // Attempt reconnection
            try {
                await sequelizeInstance.authenticate();
                console.log('✅ Database reconnected successfully');
            } catch (reconnectError) {
                console.error('❌ Database reconnection failed:', reconnectError.message);
                // In production, this should trigger alerts via CloudWatch
            }
        }
    }, 30000); // Check every 30 seconds
}

export default sequelize;
