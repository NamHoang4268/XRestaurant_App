/**
 * Lambda Function: Database Query Handler
 * 
 * Handles queries to RDS PostgreSQL database
 * Trigger: API Gateway GET /api/products
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const SECRET_NAME = process.env.DB_SECRET_NAME || 'xrestaurant/rds/credentials';

let dbClient = null;
let dbConfig = null;

/**
 * Get database credentials from Secrets Manager
 */
async function getDbCredentials() {
    if (dbConfig) {
        return dbConfig;
    }
    
    console.log(`Fetching credentials from Secrets Manager: ${SECRET_NAME}`);
    
    const command = new GetSecretValueCommand({
        SecretId: SECRET_NAME
    });
    
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);
    
    dbConfig = {
        host: secret.host,
        port: secret.port || 5432,
        database: secret.dbname,
        user: secret.username,
        password: secret.password,
        ssl: {
            rejectUnauthorized: true
        }
    };
    
    console.log(`Database host: ${dbConfig.host}`);
    
    return dbConfig;
}

/**
 * Get database client (reuse connection)
 */
async function getDbClient() {
    if (dbClient && !dbClient._ending) {
        return dbClient;
    }
    
    const config = await getDbCredentials();
    
    dbClient = new Client(config);
    await dbClient.connect();
    
    console.log('Connected to database');
    
    return dbClient;
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const { category, limit = 10, offset = 0 } = queryParams;
        
        // Get database client
        const client = await getDbClient();
        
        let query;
        let params;
        
        if (category) {
            // Query products by category
            query = `
                SELECT 
                    p.id,
                    p.name,
                    p.description,
                    p.price,
                    p.image,
                    p.status,
                    p.is_featured,
                    c.name as category_name
                FROM products p
                JOIN product_categories pc ON p.id = pc.product_id
                JOIN categories c ON pc.category_id = c.id
                WHERE c.id = $1
                  AND p.status = 'available'
                ORDER BY p.name
                LIMIT $2 OFFSET $3
            `;
            params = [category, parseInt(limit), parseInt(offset)];
        } else {
            // Query all available products
            query = `
                SELECT 
                    id,
                    name,
                    description,
                    price,
                    image,
                    status,
                    is_featured
                FROM products
                WHERE status = 'available'
                ORDER BY is_featured DESC, name
                LIMIT $1 OFFSET $2
            `;
            params = [parseInt(limit), parseInt(offset)];
        }
        
        console.log('Executing query:', query);
        console.log('Parameters:', params);
        
        const result = await client.query(query, params);
        
        console.log(`Query returned ${result.rows.length} rows`);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                count: result.rows.length,
                products: result.rows,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                },
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Error querying database:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
