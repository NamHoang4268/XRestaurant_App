import { Sequelize } from 'sequelize';

async function testConnection() {
    const sequelize = new Sequelize({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        dialect: 'postgres',
        dialectOptions: {
            ssl: process.env.DB_SSL === 'true' ? {
                require: true,
                rejectUnauthorized: false
            } : false
        },
        logging: false
    });

    try {
        await sequelize.authenticate();
        console.log('✅ Database connection successful!');
        
        // Test a simple query
        const [results] = await sequelize.query('SELECT version()');
        console.log('📊 PostgreSQL version:', results[0].version);
        
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

testConnection();
