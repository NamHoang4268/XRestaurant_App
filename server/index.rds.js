import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import pkg from 'pg';
const { Pool } = pkg;

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
        rejectUnauthorized: false // AWS RDS uses self-signed certificates
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
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(helmet({ crossOriginResourcePolicy: false }));

const PORT = process.env.PORT || 8080;

// ============================================
// ROUTES
// ============================================

// Root
app.get("/", (req, res) => {
    res.json({ 
        message: "XRestaurant Server - Connected to RDS PostgreSQL",
        version: "1.0.0-rds",
        mode: "database",
        database: "PostgreSQL RDS"
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
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({
            status: "unhealthy",
            database: "disconnected",
            error: error.message
        });
    }
});

// Get all products
app.get("/api/product", async (req, res) => {
    try {
        const { category, search, limit = 10, page = 1 } = req.query;
        
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (category) {
            query += ` AND category = $${paramCount}`;
            params.push(category);
            paramCount++;
        }
        
        if (search) {
            query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        query += ' ORDER BY id';
        query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM products WHERE 1=1';
        const countParams = [];
        if (category) {
            countQuery += ' AND category = $1';
            countParams.push(category);
        }
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        
        res.json({
            success: true,
            data: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get product by ID
app.get("/api/product/:id", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all orders
app.get("/api/order", async (req, res) => {
    try {
        const { status, limit = 10, page = 1 } = req.query;
        
        let query = 'SELECT * FROM orders WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = $1';
            params.push(status);
        }
        
        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create order
app.post("/api/order", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { customer_name, table_number, items, total } = req.body;
        
        // Generate order number
        const orderNumResult = await client.query('SELECT COUNT(*) FROM orders');
        const orderNum = `ORD-${String(parseInt(orderNumResult.rows[0].count) + 1).padStart(3, '0')}`;
        
        // Insert order
        const orderResult = await client.query(
            'INSERT INTO orders (order_number, customer_name, table_number, total, status, payment_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [orderNum, customer_name, table_number, total, 'pending', 'unpaid']
        );
        
        const orderId = orderResult.rows[0].id;
        
        // Insert order items
        if (items && items.length > 0) {
            for (const item of items) {
                await client.query(
                    'INSERT INTO order_items (order_id, product_name, product_price, quantity, subtotal) VALUES ($1, $2, $3, $4, $5)',
                    [orderId, item.product_name, item.product_price, item.quantity, item.subtotal]
                );
            }
        }
        
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: orderResult.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating order:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Get all tables
app.get("/api/table", async (req, res) => {
    try {
        const { status } = req.query;
        
        let query = 'SELECT * FROM tables';
        const params = [];
        
        if (status) {
            query += ' WHERE status = $1';
            params.push(status);
        }
        
        query += ' ORDER BY table_number';
        
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all categories
app.get("/api/category", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY name');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all bookings
app.get("/api/booking", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bookings ORDER BY booking_date DESC, booking_time DESC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create booking
app.post("/api/booking", async (req, res) => {
    try {
        const { customer_name, phone, email, booking_date, booking_time, guests, table_number, notes } = req.body;
        
        const result = await pool.query(
            'INSERT INTO bookings (customer_name, phone, email, booking_date, booking_time, guests, table_number, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [customer_name, phone, email, booking_date, booking_time, guests, table_number, 'pending', notes]
        );
        
        res.status(201).json({
            success: true,
            message: "Booking created successfully",
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User profile (mock for now)
app.get("/api/user/profile", (req, res) => {
    res.json({
        success: true,
        data: {
            id: 1,
            name: "Demo User",
            email: "demo@xrestaurant.com",
            role: "admin"
        }
    });
});

// Stats
app.get("/api/stats", async (req, res) => {
    try {
        const productsCount = await pool.query('SELECT COUNT(*) FROM products');
        const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
        const tablesCount = await pool.query('SELECT COUNT(*) FROM tables');
        const occupiedTables = await pool.query("SELECT COUNT(*) FROM tables WHERE status = 'occupied'");
        const pendingOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'");
        const revenue = await pool.query("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'completed'");
        
        res.json({
            success: true,
            data: {
                totalProducts: parseInt(productsCount.rows[0].count),
                totalOrders: parseInt(ordersCount.rows[0].count),
                totalTables: parseInt(tablesCount.rows[0].count),
                occupiedTables: parseInt(occupiedTables.rows[0].count),
                pendingOrders: parseInt(pendingOrders.rows[0].count),
                totalRevenue: parseInt(revenue.rows[0].total)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// MIGRATION ENDPOINT (temporary - remove after migration)
// ============================================================================
app.post('/api/migrate', async (req, res) => {
    try {
        console.log('🔄 Running database migration...');
        
        const schema = `
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE categories (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, description TEXT, image VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_categories_name ON categories(name);

CREATE TABLE products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price INTEGER NOT NULL CHECK (price >= 0), image VARCHAR(500), category VARCHAR(100) REFERENCES categories(name) ON UPDATE CASCADE, sub_category VARCHAR(100), stock INTEGER DEFAULT 0 CHECK (stock >= 0), unit VARCHAR(50) DEFAULT 'phần', tags TEXT[], is_available BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_available ON products(is_available);

CREATE TABLE tables (id SERIAL PRIMARY KEY, table_number VARCHAR(10) NOT NULL UNIQUE, capacity INTEGER NOT NULL CHECK (capacity > 0), status VARCHAR(20) DEFAULT 'available', qr_code VARCHAR(100) UNIQUE, location VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_tables_status ON tables(status);
CREATE INDEX idx_tables_number ON tables(table_number);

CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE, phone VARCHAR(20), role VARCHAR(20) DEFAULT 'customer', password_hash VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE orders (id SERIAL PRIMARY KEY, order_number VARCHAR(50) NOT NULL UNIQUE, customer_name VARCHAR(255), customer_phone VARCHAR(20), customer_email VARCHAR(255), table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL, table_number VARCHAR(10), user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, subtotal INTEGER DEFAULT 0, tax INTEGER DEFAULT 0, discount INTEGER DEFAULT 0, total INTEGER NOT NULL CHECK (total >= 0), status VARCHAR(20) DEFAULT 'pending', payment_method VARCHAR(50), payment_status VARCHAR(20) DEFAULT 'unpaid', notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT, product_name VARCHAR(255) NOT NULL, product_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), subtotal INTEGER NOT NULL CHECK (subtotal >= 0), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE bookings (id SERIAL PRIMARY KEY, customer_name VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL, email VARCHAR(255), booking_date DATE NOT NULL, booking_time TIME NOT NULL, guests INTEGER NOT NULL CHECK (guests > 0), table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL, table_number VARCHAR(10), status VARCHAR(20) DEFAULT 'pending', notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_table ON bookings(table_id);

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql';
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `;
        
        await pool.query(schema);
        
        const result = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        console.log('✅ Migration completed!');
        res.json({
            success: true,
            message: 'Database schema created successfully',
            tables: result.rows.map(r => r.table_name)
        });
        
    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// IMPORT MOCK DATA ENDPOINT (temporary - for testing)
// ============================================================================
app.post('/api/import-data', async (req, res) => {
    try {
        console.log('📦 Importing mock data...');
        
        // Categories
        await pool.query(`
            INSERT INTO categories (name, description, image) VALUES
            ('Món chính', 'Các món ăn chính của nhà hàng', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836'),
            ('Khai vị', 'Món khai vị truyền thống Việt Nam', 'https://images.unsplash.com/photo-1559847844-5315695dadae'),
            ('Đồ uống', 'Nước giải khát và đồ uống', 'https://images.unsplash.com/photo-1544145945-f90425340c7e'),
            ('Tráng miệng', 'Món tráng miệng ngọt ngào', 'https://images.unsplash.com/photo-1488477181946-6428a0291777'),
            ('Lẩu', 'Các loại lẩu đặc sản', 'https://images.unsplash.com/photo-1585032226651-759b368d7246')
            ON CONFLICT (name) DO NOTHING
        `);
        
        // Products
        await pool.query(`
            INSERT INTO products (name, description, price, image, category, stock, unit, tags, is_available) VALUES
            ('Phở Bò Tái', 'Phở bò truyền thống với thịt bò tái', 65000, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43', 'Món chính', 100, 'tô', ARRAY['popular', 'traditional'], true),
            ('Bún Chả Hà Nội', 'Bún chả nướng than hoa đặc trưng Hà Nội', 70000, 'https://images.unsplash.com/photo-1559314809-0d155014e29e', 'Món chính', 80, 'phần', ARRAY['popular', 'grilled'], true),
            ('Cơm Tấm Sườn Nướng', 'Cơm tấm với sườn nướng thơm ngon', 60000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b', 'Món chính', 90, 'phần', ARRAY['popular'], true),
            ('Bánh Xèo Miền Tây', 'Bánh xèo giòn rụm với nhân tôm thịt', 55000, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb', 'Món chính', 70, 'phần', ARRAY['crispy', 'traditional'], true),
            ('Gỏi Cuốn Tôm Thịt', 'Gỏi cuốn tươi với tôm và thịt', 45000, 'https://images.unsplash.com/photo-1559314809-0d155014e29e', 'Khai vị', 100, 'phần', ARRAY['fresh', 'healthy'], true),
            ('Nem Rán', 'Nem rán giòn với nhân thịt và rau củ', 40000, 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb', 'Khai vị', 80, 'phần', ARRAY['crispy', 'fried'], true),
            ('Trà Đá', 'Trà đá truyền thống', 10000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc', 'Đồ uống', 200, 'ly', ARRAY['cold'], true),
            ('Cà Phê Sữa Đá', 'Cà phê sữa đá đậm đà', 25000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735', 'Đồ uống', 150, 'ly', ARRAY['coffee', 'cold'], true),
            ('Chè Ba Màu', 'Chè ba màu truyền thống', 25000, 'https://images.unsplash.com/photo-1563805042-7684c019e1cb', 'Tráng miệng', 80, 'chén', ARRAY['sweet', 'traditional'], true),
            ('Lẩu Thái Hải Sản', 'Lẩu Thái chua cay với hải sản tươi', 350000, 'https://images.unsplash.com/photo-1585032226651-759b368d7246', 'Lẩu', 30, 'nồi', ARRAY['spicy', 'seafood', 'hot'], true)
        `);
        
        // Tables
        await pool.query(`
            INSERT INTO tables (table_number, capacity, status, location) VALUES
            ('T01', 2, 'available', 'indoor'),
            ('T02', 2, 'available', 'indoor'),
            ('T03', 4, 'available', 'indoor'),
            ('T04', 4, 'occupied', 'indoor'),
            ('T05', 4, 'available', 'indoor'),
            ('T06', 6, 'available', 'indoor'),
            ('T07', 6, 'reserved', 'indoor'),
            ('T08', 8, 'available', 'vip'),
            ('T09', 4, 'available', 'outdoor'),
            ('T10', 4, 'available', 'outdoor')
            ON CONFLICT (table_number) DO NOTHING
        `);
        
        // Users
        await pool.query(`
            INSERT INTO users (name, email, phone, role, is_active) VALUES
            ('Admin User', 'admin@xrestaurant.com', '0901234567', 'admin', true),
            ('Nhân viên Nguyễn Văn A', 'staff1@xrestaurant.com', '0902345678', 'staff', true),
            ('Khách hàng Lê Văn C', 'customer1@gmail.com', '0904567890', 'customer', true)
            ON CONFLICT (email) DO NOTHING
        `);
        
        // Get counts
        const counts = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM categories) as categories,
                (SELECT COUNT(*) FROM products) as products,
                (SELECT COUNT(*) FROM tables) as tables,
                (SELECT COUNT(*) FROM users) as users
        `);
        
        console.log('✅ Mock data imported!');
        res.json({
            success: true,
            message: 'Mock data imported successfully',
            data: counts.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 404 handler (MUST be after all routes)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Endpoint not found"
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log("========================================");
    console.log("🚀 XRestaurant Server Started (RDS Mode)");
    console.log("========================================");
    console.log(`📍 Port: ${PORT}`);
    console.log(`🗄️  Database: PostgreSQL RDS`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
    console.log("========================================");
});
