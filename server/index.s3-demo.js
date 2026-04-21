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
import { listImages, listDocuments, getDocumentSignedUrl, getImageUrl } from './routes/s3-media.js';

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
        message: "XRestaurant Server - With S3 Media & Documents",
        version: "1.0.0-s3-demo",
        mode: "database + s3",
        database: "PostgreSQL RDS",
        storage: "S3 (media + documents)",
        authentication: "Simple Auth (user1/user2)"
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
            authentication: "enabled",
            s3: "enabled"
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
// S3 MEDIA ROUTES
// ============================================

// List all images (READ permission - user1 và user2)
app.get("/api/s3/images", listImages);

// Get image URL by key (READ permission)
app.get("/api/s3/images/:key", getImageUrl);

// List all documents (READ permission - user1 và user2)
app.get("/api/s3/documents", listDocuments);

// Get signed URL for document download (READ permission)
app.get("/api/s3/documents/:key/download", getDocumentSignedUrl);

// ============================================
// DATABASE ROUTES
// ============================================

// Get current user info
app.get("/api/me", getUserInfo);

// Categories (READ)
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

// Products (READ)
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

// Tables (READ)
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

// Orders (READ)
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
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const orderResult = await client.query(
                'INSERT INTO orders (table_id, user_id, status, total_amount, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [table_id, 1, 'pending', 0, notes || '']
            );
            
            const order = orderResult.rows[0];
            let totalAmount = 0;
            
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

// Delete Order (DELETE - chỉ user2)
app.delete("/api/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
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

// Admin only - Import data
app.post("/api/import-data", requireAdmin, async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            await client.query(`
                INSERT INTO categories (id, name, description) VALUES
                (1, 'Appetizers', 'Món khai vị'),
                (2, 'Main Course', 'Món chính'),
                (3, 'Desserts', 'Món tráng miệng'),
                (4, 'Beverages', 'Đồ uống'),
                (5, 'Specials', 'Món đặc biệt')
                ON CONFLICT (id) DO NOTHING
            `);
            
            await client.query(`
                INSERT INTO products (name, description, price, category_id, image_url) VALUES
                ('Spring Rolls', 'Chả giò giòn rụm', 50000, 1, 'https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/spring-rolls.jpg'),
                ('Pho Bo', 'Phở bò truyền thống', 80000, 2, 'https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/pho-bo.jpg'),
                ('Banh Mi', 'Bánh mì Việt Nam', 35000, 2, 'https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/banh-mi.jpg'),
                ('Che Ba Mau', 'Chè ba màu', 30000, 3, 'https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/che.jpg'),
                ('Ca Phe Sua Da', 'Cà phê sữa đá', 25000, 4, 'https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/coffee.jpg')
                ON CONFLICT DO NOTHING
            `);
            
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
    console.log(`🔐 Authentication: Enabled`);
    console.log(`📊 Database: PostgreSQL RDS`);
    console.log(`📦 S3: Media + Documents`);
});
