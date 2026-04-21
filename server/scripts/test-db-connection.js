import { initializeDatabase, closeDatabase } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test database connection
 * This script verifies that the database configuration is correct
 * and the application can connect to PostgreSQL
 */
async function testConnection() {
    console.log('🧪 Testing database connection...\n');
    
    try {
        // Initialize database
        const sequelize = await initializeDatabase();
        
        // Test query
        console.log('📊 Running test query...');
        const [results] = await sequelize.query('SELECT version()');
        console.log('✅ PostgreSQL version:', results[0].version);
        
        // Test connection pool
        console.log('\n📊 Connection pool status:');
        const pool = sequelize.connectionManager.pool;
        console.log(`   - Pool size: ${pool.size}`);
        console.log(`   - Available: ${pool.available}`);
        console.log(`   - Using: ${pool.using}`);
        console.log(`   - Waiting: ${pool.waiting}`);
        
        // Test multiple concurrent queries
        console.log('\n📊 Testing concurrent queries...');
        const startTime = Date.now();
        const queries = Array(5).fill(null).map((_, i) => 
            sequelize.query(`SELECT ${i + 1} as value`)
        );
        await Promise.all(queries);
        const duration = Date.now() - startTime;
        console.log(`✅ 5 concurrent queries completed in ${duration}ms`);
        
        // Close connection
        await closeDatabase();
        console.log('\n✅ Database connection test completed successfully!');
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Database connection test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testConnection();
