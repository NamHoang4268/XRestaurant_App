import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Test database connection
app.get("/api/product/get-product", async (req, res) => {
    try {
        // Try to connect to database
        const { Sequelize } = await import('sequelize');
        
        const sequelize = new Sequelize({
            host: 'xrestaurant-db.cn088oemgmw1.us-west-2.rds.amazonaws.com',
            port: 5432,
            database: 'xrestaurant',
            username: 'xrestaurant_admin',
            password: 'XRestaurant2026!',
            dialect: 'postgres',
            logging: console.log
        });
        
        await sequelize.authenticate();
        console.log('✅ Database connection successful');
        
        const [results] = await sequelize.query('SELECT COUNT(*) as count FROM products');
        
        res.json({
            success: true,
            user: "guest",
            role: "viewer", 
            message: "Database connection successful",
            productCount: results[0].count,
            note: "Connected to PostgreSQL database"
        });
        
        await sequelize.close();
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        res.json({
            success: false,
            user: "guest",
            role: "viewer",
            error: error.message,
            note: "Database connection failed - using fallback"
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Test server running on port ${PORT}`);
});
