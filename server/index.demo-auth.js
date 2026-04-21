import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import pkg from 'pg';
const { Pool } = pkg;
import { simpleAuth, requireAdmin, getUserInfo } from './middleware/simple-auth.js';

const app = express();

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error connecting to database:', err.stack);
    } else {
        console.log('✅ Connected to PostgreSQL database');
        release();
    }
});

// CORS
const getAllowedOrigins = () => {
    const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
    return raw.split(',').map((u) => u.trim()).filter(Boolean);
};

const corsOptions = {
    origin: (origin, callback) => {
        const allowed = getAllowedOrigins();
        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('[CORS] Blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-username', 'x-password'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(helmet({ crossOriginResourcePolicy: false }));

const PORT = process.env.PORT || 8080;

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

// Root
app.get("/", (req, res) => {
    res.json({ 
        message: "XRestaurant Server - With IAM Demo Authentication",
        version: "1.0.0-auth-demo",
        mode: "database",
        database: "PostgreSQL RDS",
        authentication: "Simple Auth (user1/user2)",
        demo_users: {
            user1: {
                role: "viewer",
                permissions: ["READ"],
                description: "Chỉ xem - Không có quyền chỉnh sửa"
            },
            user2: {
                role: "admin",
                permissions: ["READ", "WRITE", "DELETE", "ADMIN"],
                description: "Toàn quyền - Có thể thực hiện mọi thao tác"
            }
        }
    });
});

// Health check
app.get("/health", async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: "healthy", 
            service: "xrestaurant-backend",
            database: "connected",
            timestamp: result.rows[0].now,
            uptime: process.uptime(),
            authentication: "enabled"
        });
    } catch (error) {
        res.status(500).json({
            status: "unhealthy",
            database: "disconnected",
            error: error.message
        });
    }
});

// ============================================
// APPLY AUTHENTICATION MIDDLEWARE
// ============================================
app.use('/api/*', simpleAuth);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

// Get current user info
app.get("/api/me", getUserInfo);

// Categories (READ - user1 và user2 đều được)
app.get("/api/categories", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY id');
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Products (READ - user1 và user2 đều được)
app.get("/api/products", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, c.name as category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            ORDER BY p.id
        `);
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tables (READ - user1 và user2 đều được)
app.get("/api/tables", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tables ORDER BY id');
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Orders (READ - user1 và user2 đều được)
app.get("/api/orders", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, t.table_number, u.username 
            FROM orders o 
            LEFT JOIN tables t ON o.table_id = t.id 
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `);
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Order (WRITE - chỉ user2)
app.post("/api/orders", async (req, res) => {
    try {
        const { table_id, items, notes } = req.body;
        
        // Start transaction
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Create order
            const orderResult = await client.query(
                'INSERT INTO orders (table_id, user_id, status, total_amount, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [table_id, 1, 'pending', 0, notes || '']
            );
            
            const order = orderResult.rows[0];
            let totalAmount = 0;
            
            // Add order items
            for (const item of items) {
                const productResult = await client.query(
                    'SELECT price FROM products WHERE id = $1',
                    [item.product_id]
                );
                
                if (productResult.rows.length === 0) {
                    throw new Error(`Product ${item.product_id} not found`);
                }
                
                const price = productResult.rows[0].price;
                const subtotal = price * item.quantity;
                totalAmount += subtotal;
                
                await client.query(
                    'INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES ($1, $2, $3, $4, $5)',
                    [order.id, item.product_id, item.quantity, price, subtotal]
                );
            }
            
            // Update total amount
            await client.query(
                'UPDATE orders SET total_amount = $1 WHERE id = $2',
                [totalAmount, order.id]
            );
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: 'Order created successfully',
                user: req.user.username,
                role: req.user.role,
                order_id: order.id,
                total_amount: totalAmount
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            user: req.user.username
        });
    }
});

// Update Order Status (WRITE - chỉ user2)
app.patch("/api/orders/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json({
            success: true,
            message: 'Order status updated',
            user: req.user.username,
            role: req.user.role,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Order (DELETE - chỉ user2)
app.delete("/api/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Delete order items first
            await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
            
            // Delete order
            const result = await client.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
            
            if (result.rows.length === 0) {
                throw new Error('Order not found');
            }
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: 'Order deleted successfully',
                user: req.user.username,
                role: req.user.role,
                deleted_order_id: id
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Product (WRITE - chỉ user2)
app.post("/api/products", async (req, res) => {
    try {
        const { name, description, price, category_id, image_url } = req.body;
        
        const result = await pool.query(
            'INSERT INTO products (name, description, price, category_id, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, description, price, category_id, image_url]
        );
        
        res.json({
            success: true,
            message: 'Product created successfully',
            user: req.user.username,
            role: req.user.role,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Product (WRITE - chỉ user2)
app.put("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, category_id, image_url } = req.body;
        
        const result = await pool.query(
            'UPDATE products SET name = $1, description = $2, price = $3, category_id = $4, image_url = $5 WHERE id = $6 RETURNING *',
            [name, description, price, category_id, image_url, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json({
            success: true,
            message: 'Product updated successfully',
            user: req.user.username,
            role: req.user.role,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Product (DELETE - chỉ user2)
app.delete("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json({
            success: true,
            message: 'Product deleted successfully',
            user: req.user.username,
            role: req.user.role,
            deleted_product_id: id
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin only route - Import data
app.post("/api/import-data", requireAdmin, async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Import categories
            await client.query(`
                INSERT INTO categories (id, name, description) VALUES
                (1, 'Appetizers', 'Món khai vị'),
                (2, 'Main Course', 'Món chính'),
                (3, 'Desserts', 'Món tráng miệng'),
                (4, 'Beverages', 'Đồ uống'),
                (5, 'Specials', 'Món đặc biệt')
                ON CONFLICT (id) DO NOTHING
            `);
            
            // Import products (sample)
            await client.query(`
                INSERT INTO products (name, description, price, category_id, image_url) VALUES
                ('Spring Rolls', 'Chả giò giòn rụm', 50000, 1, 'https://via.placeholder.com/300'),
                ('Pho Bo', 'Phở bò truyền thống', 80000, 2, 'https://via.placeholder.com/300'),
                ('Banh Mi', 'Bánh mì Việt Nam', 35000, 2, 'https://via.placeholder.com/300'),
                ('Che Ba Mau', 'Chè ba màu', 30000, 3, 'https://via.placeholder.com/300'),
                ('Ca Phe Sua Da', 'Cà phê sữa đá', 25000, 4, 'https://via.placeholder.com/300')
                ON CONFLICT DO NOTHING
            `);
            
            // Import tables
            await client.query(`
                INSERT INTO tables (table_number, capacity, status) VALUES
                (1, 4, 'available'),
                (2, 4, 'available'),
                (3, 6, 'available'),
                (4, 2, 'available'),
                (5, 8, 'available')
                ON CONFLICT (table_number) DO NOTHING
            `);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: 'Mock data imported successfully',
                user: req.user.username,
                role: req.user.role,
                imported: {
                    categories: 5,
                    products: 5,
                    tables: 5
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
    res.status(404).json({ 
        error: "Not Found",
        path: req.path,
        method: req.method
    });
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 Authentication: Enabled (user1/user2)`);
    console.log(`📊 Database: PostgreSQL RDS`);
});
