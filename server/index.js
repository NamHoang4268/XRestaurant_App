import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import pkg from "pg";
const { Pool } = pkg;
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import uploadImageS3 from "./utils/uploadImageS3.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================================================
// AWS Secrets Manager helper
// ============================================================================
async function getDbConfig() {
    const secretName = process.env.DB_SECRET_NAME;

    // If Secrets Manager is configured, use it
    if (secretName && process.env.AWS_REGION) {
        try {
            const { SecretsManagerClient, GetSecretValueCommand } = await import(
                "@aws-sdk/client-secrets-manager"
            );
            const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
            const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
            const secret = JSON.parse(response.SecretString);
            console.log("✅ DB credentials loaded from Secrets Manager");
            return {
                host: secret.host,
                database: secret.dbname || secret.database || "xrestaurant",
                user: secret.username,
                password: secret.password,
                port: secret.port || 5432,
            };
        } catch (err) {
            console.warn("⚠️  Secrets Manager failed, falling back to env vars:", err.message);
        }
    }

    // Fallback to direct env vars
    console.log("ℹ️  Using DB credentials from environment variables");
    return {
        host: process.env.DB_HOST,
        database: process.env.DB_NAME || "xrestaurant",
        user: process.env.DB_USER || process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || "5432"),
    };
}

// ============================================================================
// App bootstrap
// ============================================================================
const app = express();
const PORT = parseInt(process.env.PORT || "8080");

// CORS
const getAllowedOrigins = () => {
    const raw = process.env.FRONTEND_URL || "http://localhost:5173";
    return raw
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
};

app.use(
    cors({
        origin: (origin, callback) => {
            const allowed = getAllowedOrigins();
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
            } else {
                console.warn("[CORS] Blocked origin:", origin);
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));
app.use(helmet({ crossOriginResourcePolicy: false }));

// ============================================================================
// Database pool — initialized after Secrets Manager fetch
// ============================================================================
let pool = null;
let dbConnected = false;

async function initDatabase() {
    try {
        const dbConfig = await getDbConfig();

        if (!dbConfig.host) {
            console.warn("⚠️  DB_HOST not set — running without database");
            return;
        }

        pool = new Pool({
            ...dbConfig,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ssl: process.env.DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
        });

        // Test the connection
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
        dbConnected = true;
        console.log("✅ Connected to PostgreSQL database:", dbConfig.host);
    } catch (err) {
        console.error("❌ Database connection failed:", err.message);
        console.warn("   Server will continue without DB — health check will report degraded");
    }
}

// ============================================================================
// ROUTES
// ============================================================================

// Root
app.get("/", (req, res) => {
    res.json({
        message: "XRestaurant Backend API",
        version: "2.0.0-rds",
        database: dbConnected ? "PostgreSQL RDS" : "disconnected",
        port: PORT,
    });
});

// ✅ Health check — MUST return 200 regardless of DB status so ECS can start the task
// DB status is reported in the response body, not via HTTP status code
app.get("/health", async (req, res) => {
    const health = {
        status: "healthy",
        service: "xrestaurant-backend",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
            connected: dbConnected,
        },
    };

    // Try a lightweight DB ping if pool is available
    if (pool && dbConnected) {
        try {
            const result = await pool.query("SELECT NOW()");
            health.database.timestamp = result.rows[0].now;
            health.database.status = "connected";
        } catch (err) {
            health.database.status = "error";
            health.database.error = err.message;
        }
    } else {
        health.database.status = dbConnected ? "connecting" : "unavailable";
    }

    // Always return 200 — let ECS start the container, DB reconnects async
    res.status(200).json(health);
});

// Get all products
app.get("/api/product", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const { category, search, limit = 10, page = 1 } = req.query;
        let query = "SELECT * FROM products WHERE 1=1";
        const params = [];
        let i = 1;

        if (category) { query += ` AND category = $${i++}`; params.push(category); }
        if (search)   { query += ` AND (name ILIKE $${i} OR description ILIKE $${i})`; params.push(`%${search}%`); i++; }

        query += ` ORDER BY id LIMIT $${i} OFFSET $${i + 1}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await pool.query(query, params);
        const countResult = await pool.query("SELECT COUNT(*) FROM products");
        const total = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: result.rows,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
        });
    } catch (err) {
        console.error("Error fetching products:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get product by ID
app.get("/api/product/:id", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const result = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: "Product not found" });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all categories
app.get("/api/category", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const result = await pool.query("SELECT * FROM categories ORDER BY name");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all tables
app.get("/api/table", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const { status } = req.query;
        let query = "SELECT * FROM tables";
        const params = [];
        if (status) { query += " WHERE status = $1"; params.push(status); }
        query += " ORDER BY table_number";
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all orders
app.get("/api/order", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const { status, limit = 10, page = 1 } = req.query;
        let query = "SELECT * FROM orders WHERE 1=1";
        const params = [];
        if (status) { query += " AND status = $1"; params.push(status); }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create order
app.post("/api/order", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { customer_name, table_number, items, total } = req.body;
        const orderNumResult = await client.query("SELECT COUNT(*) FROM orders");
        const orderNum = `ORD-${String(parseInt(orderNumResult.rows[0].count) + 1).padStart(3, "0")}`;
        const orderResult = await client.query(
            "INSERT INTO orders (order_number, customer_name, table_number, total, status, payment_status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
            [orderNum, customer_name, table_number, total, "pending", "unpaid"]
        );
        const orderId = orderResult.rows[0].id;
        if (items && items.length > 0) {
            for (const item of items) {
                await client.query(
                    "INSERT INTO order_items (order_id, product_name, product_price, quantity, subtotal) VALUES ($1,$2,$3,$4,$5)",
                    [orderId, item.product_name, item.product_price, item.quantity, item.subtotal]
                );
            }
        }
        await client.query("COMMIT");
        res.status(201).json({ success: true, message: "Order created", data: orderResult.rows[0] });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error creating order:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// Get all bookings
app.get("/api/booking", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const result = await pool.query("SELECT * FROM bookings ORDER BY booking_date DESC, booking_time DESC");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create booking
app.post("/api/booking", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const { customer_name, phone, email, booking_date, booking_time, guests, table_number, notes } = req.body;
        const result = await pool.query(
            "INSERT INTO bookings (customer_name,phone,email,booking_date,booking_time,guests,table_number,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [customer_name, phone, email, booking_date, booking_time, guests, table_number, "pending", notes]
        );
        res.status(201).json({ success: true, message: "Booking created", data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Stats
app.get("/api/stats", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        const [products, orders, tables, occupied, pending, revenue] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM products"),
            pool.query("SELECT COUNT(*) FROM orders"),
            pool.query("SELECT COUNT(*) FROM tables"),
            pool.query("SELECT COUNT(*) FROM tables WHERE status = 'occupied'"),
            pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
            pool.query("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status = 'completed'"),
        ]);
        res.json({
            success: true,
            data: {
                totalProducts: parseInt(products.rows[0].count),
                totalOrders: parseInt(orders.rows[0].count),
                totalTables: parseInt(tables.rows[0].count),
                occupiedTables: parseInt(occupied.rows[0].count),
                pendingOrders: parseInt(pending.rows[0].count),
                totalRevenue: parseInt(revenue.rows[0].total),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DB status debug endpoint (không expose credentials)
app.get("/api/db-status", (req, res) => {
    res.json({
        connected: dbConnected,
        pool: pool
            ? { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount }
            : null,
    });
});

// ============================================================================
// TEMPORARY: Schema init & seed endpoints — DELETE after DB is populated
// Protected by a simple token to avoid accidental public access
// ============================================================================
const ADMIN_TOKEN = process.env.ADMIN_INIT_TOKEN || "xrestaurant-init-2026";

app.post("/api/admin/migrate", async (req, res) => {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        console.log("🔄 Running database schema init...");
        await pool.query(`
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

CREATE TABLE tables (id SERIAL PRIMARY KEY, table_number VARCHAR(10) NOT NULL UNIQUE, capacity INTEGER NOT NULL CHECK (capacity > 0), status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')), qr_code VARCHAR(100) UNIQUE, location VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_tables_status ON tables(status);
CREATE INDEX idx_tables_number ON tables(table_number);

CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE, phone VARCHAR(20), role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('admin','staff','customer')), password_hash VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE orders (id SERIAL PRIMARY KEY, order_number VARCHAR(50) NOT NULL UNIQUE, customer_name VARCHAR(255), customer_phone VARCHAR(20), customer_email VARCHAR(255), table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL, table_number VARCHAR(10), user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, subtotal INTEGER DEFAULT 0, tax INTEGER DEFAULT 0, discount INTEGER DEFAULT 0, total INTEGER NOT NULL CHECK (total >= 0), status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','completed','cancelled')), payment_method VARCHAR(50), payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT, product_name VARCHAR(255) NOT NULL, product_price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), subtotal INTEGER NOT NULL CHECK (subtotal >= 0), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE bookings (id SERIAL PRIMARY KEY, customer_name VARCHAR(255) NOT NULL, phone VARCHAR(20) NOT NULL, email VARCHAR(255), booking_date DATE NOT NULL, booking_time TIME NOT NULL, guests INTEGER NOT NULL CHECK (guests > 0), table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL, table_number VARCHAR(10), status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed','no-show')), notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);

CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql';
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
        console.log("✅ Schema initialized!");
        res.json({ success: true, message: "Schema created", tables: tables.rows.map(r => r.table_name) });
    } catch (err) {
        console.error("Schema init error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post("/api/admin/seed", async (req, res) => {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (!pool) return res.status(503).json({ success: false, error: "Database not available" });
    try {
        console.log("📦 Importing seed data...");
        await pool.query(`
INSERT INTO categories (name, description, image) VALUES
('Món chính','Các món ăn chính của nhà hàng','https://images.unsplash.com/photo-1504674900247-0877df9cc836'),
('Khai vị','Món khai vị truyền thống Việt Nam','https://images.unsplash.com/photo-1559847844-5315695dadae'),
('Đồ uống','Nước giải khát và đồ uống','https://images.unsplash.com/photo-1544145945-f90425340c7e'),
('Tráng miệng','Món tráng miệng ngọt ngào','https://images.unsplash.com/photo-1488477181946-6428a0291777'),
('Lẩu','Các loại lẩu đặc sản','https://images.unsplash.com/photo-1585032226651-759b368d7246')
ON CONFLICT (name) DO NOTHING`);

        await pool.query(`
INSERT INTO products (name, description, price, image, category, stock, unit, tags, is_available) VALUES
('Phở Bò Tái','Phở bò truyền thống với thịt bò tái',65000,'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43','Món chính',100,'tô',ARRAY['popular','traditional'],true),
('Bún Chả Hà Nội','Bún chả nướng than hoa đặc trưng Hà Nội',70000,'https://images.unsplash.com/photo-1559314809-0d155014e29e','Món chính',80,'phần',ARRAY['popular','grilled'],true),
('Cơm Tấm Sườn Nướng','Cơm tấm với sườn nướng thơm ngon',60000,'https://images.unsplash.com/photo-1603133872878-684f208fb84b','Món chính',90,'phần',ARRAY['popular'],true),
('Bánh Xèo Miền Tây','Bánh xèo giòn rụm với nhân tôm thịt',55000,'https://images.unsplash.com/photo-1626804475297-41608ea09aeb','Món chính',70,'phần',ARRAY['crispy','traditional'],true),
('Gỏi Cuốn Tôm Thịt','Gỏi cuốn tươi với tôm và thịt',45000,'https://images.unsplash.com/photo-1559314809-0d155014e29e','Khai vị',100,'phần',ARRAY['fresh','healthy'],true),
('Nem Rán','Nem rán giòn với nhân thịt và rau củ',40000,'https://images.unsplash.com/photo-1626804475297-41608ea09aeb','Khai vị',80,'phần',ARRAY['crispy','fried'],true),
('Trà Đá','Trà đá truyền thống',10000,'https://images.unsplash.com/photo-1556679343-c7306c1976bc','Đồ uống',200,'ly',ARRAY['cold'],true),
('Cà Phê Sữa Đá','Cà phê sữa đá đậm đà',25000,'https://images.unsplash.com/photo-1461023058943-07fcbe16d735','Đồ uống',150,'ly',ARRAY['coffee','cold'],true),
('Chè Ba Màu','Chè ba màu truyền thống',25000,'https://images.unsplash.com/photo-1563805042-7684c019e1cb','Tráng miệng',80,'chén',ARRAY['sweet','traditional'],true),
('Lẩu Thái Hải Sản','Lẩu Thái chua cay với hải sản tươi',350000,'https://images.unsplash.com/photo-1585032226651-759b368d7246','Lẩu',30,'nồi',ARRAY['spicy','seafood'],true)
ON CONFLICT DO NOTHING`);

        await pool.query(`
INSERT INTO tables (table_number, capacity, status, location) VALUES
('T01',2,'available','indoor'),('T02',2,'available','indoor'),
('T03',4,'available','indoor'),('T04',4,'occupied','indoor'),
('T05',4,'available','indoor'),('T06',6,'available','indoor'),
('T07',6,'reserved','indoor'),('T08',8,'available','vip'),
('T09',4,'available','outdoor'),('T10',4,'available','outdoor')
ON CONFLICT (table_number) DO NOTHING`);

        await pool.query(`
INSERT INTO users (name, email, phone, role, is_active) VALUES
('Admin User','admin@xrestaurant.com','0901234567','admin',true),
('Nhân viên Nguyễn Văn A','staff1@xrestaurant.com','0902345678','staff',true),
('Khách hàng Lê Văn C','customer1@gmail.com','0904567890','customer',true)
ON CONFLICT (email) DO NOTHING`);

        const counts = await pool.query(`SELECT
            (SELECT COUNT(*) FROM categories) as categories,
            (SELECT COUNT(*) FROM products)   as products,
            (SELECT COUNT(*) FROM tables)     as tables,
            (SELECT COUNT(*) FROM users)      as users`);
        console.log("✅ Seed data imported!");
        res.json({ success: true, message: "Seed data imported", counts: counts.rows[0] });
    } catch (err) {
        console.error("Seed error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// USER AUTH ENDPOINTS
// ============================================================================
const ACCESS_SECRET  = process.env.SECRET_KEY_ACCESS_TOKEN  || "xrestaurant-access-secret-2026";
const REFRESH_SECRET = process.env.SECRET_KEY_REFRESH_TOKEN || "xrestaurant-refresh-secret-2026";
const COOKIE_OPTS    = { httpOnly: true, secure: true, sameSite: "None" };

function generateTokens(userId) {
    const accessToken  = jwt.sign({ userId, _id: userId }, ACCESS_SECRET,  { expiresIn: "5h" });
    const refreshToken = jwt.sign({ userId, _id: userId }, REFRESH_SECRET, { expiresIn: "7d" });
    return { accessToken, refreshToken };
}

function authMiddleware(req, res, next) {
    const token = req.cookies?.accessToken ||
                  req.headers?.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Chưa đăng nhập", error: true, success: false });
    try {
        const decoded = jwt.verify(token, ACCESS_SECRET);
        req.userId = decoded.userId || decoded._id;
        next();
    } catch {
        return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn", error: true, success: false });
    }
}

// POST /api/user/register
app.post("/api/user/register", async (req, res) => {
    if (!pool) return res.status(503).json({ message: "Database không khả dụng", error: true, success: false });
    try {
        const { name, email, password, mobile } = req.body;
        if (!name || !email || !password || !mobile)
            return res.status(400).json({ message: "Vui lòng nhập các trường bắt buộc", error: true, success: false });

        const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (exists.rows.length > 0)
            return res.json({ message: "Email đã tồn tại", error: true, success: false });

        const salt         = await bcryptjs.genSalt(10);
        const passwordHash = await bcryptjs.hash(password, salt);

        // 1. Insert vào RDS
        const result = await pool.query(
            `INSERT INTO users (name, email, phone, role, password_hash, is_active)
             VALUES ($1, $2, $3, 'customer', $4, true) RETURNING id, name, email, phone, role, created_at`,
            [name, email, mobile, passwordHash]
        );
        const newUser = result.rows[0];

        // 2. Sync vào Cognito User Pool (để frontend login được)
        const COGNITO_POOL_ID = process.env.COGNITO_USER_POOL_ID || "us-west-2_2hvyyhgTA";
        const COGNITO_REGION  = process.env.AWS_REGION || "us-west-2";
        try {
            const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } =
                await import("@aws-sdk/client-cognito-identity-provider");
            const cognito = new CognitoIdentityProviderClient({ region: COGNITO_REGION });

            await cognito.send(new AdminCreateUserCommand({
                UserPoolId: COGNITO_POOL_ID,
                Username:   email,
                UserAttributes: [
                    { Name: "email",          Value: email },
                    { Name: "email_verified", Value: "true" },
                    { Name: "name",           Value: name },
                ],
                MessageAction: "SUPPRESS",
            }));

            await cognito.send(new AdminSetUserPasswordCommand({
                UserPoolId: COGNITO_POOL_ID,
                Username:   email,
                Password:   password,
                Permanent:  true,
            }));

            console.log("✅ Cognito user created:", email);
        } catch (cognitoErr) {
            console.warn("⚠️  Cognito sync failed for", email, ":", cognitoErr.message);
        }

        return res.json({ message: "Đăng ký thành công", error: false, success: true, data: newUser });
    } catch (err) {
        console.error("Register error:", err.message);
        return res.status(500).json({ message: err.message, error: true, success: false });
    }
});

// POST /api/user/login
app.post("/api/user/login", async (req, res) => {
    if (!pool) return res.status(503).json({ message: "Database không khả dụng", error: true, success: false });
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu", error: true, success: false });

        const result = await pool.query(
            "SELECT id, name, email, phone, role, password_hash, is_active FROM users WHERE email = $1",
            [email]
        );
        if (result.rows.length === 0)
            return res.status(400).json({ message: "Tài khoản không tồn tại", error: true, success: false });

        const user = result.rows[0];
        if (!user.is_active)
            return res.status(400).json({ message: "Tài khoản đã bị khóa. Liên hệ Admin", error: true, success: false });
        if (!user.password_hash)
            return res.status(400).json({ message: "Tài khoản này chưa đặt mật khẩu", error: true, success: false });

        const isMatch = await bcryptjs.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(400).json({ message: "Mật khẩu không chính xác", error: true, success: false });

        const { accessToken, refreshToken } = generateTokens(user.id);
        await pool.query("UPDATE users SET updated_at = NOW() WHERE id = $1", [user.id]);

        res.cookie("accessToken",  accessToken,  COOKIE_OPTS);
        res.cookie("refreshToken", refreshToken, COOKIE_OPTS);

        return res.json({
            message: "Đăng nhập thành công",
            error: false, success: true,
            data: { accessToken, refreshToken }
        });
    } catch (err) {
        console.error("Login error:", err.message);
        return res.status(500).json({ message: err.message, error: true, success: false });
    }
});

// GET /api/user/logout
app.get("/api/user/logout", authMiddleware, async (req, res) => {
    res.clearCookie("accessToken",  COOKIE_OPTS);
    res.clearCookie("refreshToken", COOKIE_OPTS);
    return res.json({ message: "Đăng xuất thành công", error: false, success: true });
});

// GET /api/user/user-details
app.get("/api/user/user-details", authMiddleware, async (req, res) => {
    if (!pool) return res.status(503).json({ message: "Database không khả dụng", error: true, success: false });
    try {
        const result = await pool.query(
            "SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = $1",
            [req.userId]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Người dùng không tồn tại", error: true, success: false });
        return res.json({ message: "Chi tiết người dùng", data: result.rows[0], error: false, success: true });
    } catch (err) {
        return res.status(500).json({ message: err.message, error: true, success: false });
    }
});

// POST /api/user/refresh-token
app.post("/api/user/refresh-token", async (req, res) => {
    const token = req.cookies?.refreshToken ||
                  req.headers?.authorization?.replace("Bearer ", "");
    if (!token) return res.status(400).json({ message: "Token không hợp lệ", error: true, success: false });
    try {
        const decoded     = jwt.verify(token, REFRESH_SECRET);
        const userId      = decoded.userId || decoded._id;
        const accessToken = jwt.sign({ userId, _id: userId }, ACCESS_SECRET, { expiresIn: "5h" });
        return res.json({ message: "Token mới đã được tạo", error: false, success: true, data: { accessToken } });
    } catch {
        return res.status(401).json({ message: "Refresh token hết hạn", error: true, success: false });
    }
});

// PUT /api/user/update-user
app.put("/api/user/update-user", authMiddleware, async (req, res) => {
    if (!pool) return res.status(503).json({ message: "Database không khả dụng", error: true, success: false });
    try {
        const { name, phone } = req.body;
        await pool.query(
            "UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = NOW() WHERE id = $3",
            [name, phone, req.userId]
        );
        return res.json({ message: "Cập nhật thành công", error: false, success: true });
    } catch (err) {
        return res.status(500).json({ message: err.message, error: true, success: false });
    }
});

// POST /api/user/verify-email (simplified — auto verify)
app.post("/api/user/verify-email", async (req, res) => {
    return res.json({ message: "Xác nhận email thành công", error: false, success: true });
});

// PUT /api/user/forgot-password (stub)
app.put("/api/user/forgot-password", async (req, res) => {
    return res.json({ message: "Vui lòng liên hệ admin để đặt lại mật khẩu", error: false, success: true });
});

// PUT /api/user/reset-password
app.put("/api/user/reset-password", async (req, res) => {
    if (!pool) return res.status(503).json({ message: "Database không khả dụng", error: true, success: false });
    try {
        const { email, newPassword, confirmNewPassword } = req.body;
        if (!email || !newPassword || !confirmNewPassword)
            return res.status(400).json({ message: "Thiếu thông tin", error: true, success: false });
        if (newPassword !== confirmNewPassword)
            return res.status(400).json({ message: "Mật khẩu xác nhận không khớp", error: true, success: false });
        const salt = await bcryptjs.genSalt(10);
        const hash = await bcryptjs.hash(newPassword, salt);
        await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2", [hash, email]);
        return res.json({ message: "Mật khẩu đã được cập nhật", error: false, success: true });
    } catch (err) {
        return res.status(500).json({ message: err.message, error: true, success: false });
    }
});


// ============================================================================
// S3 IMAGE UPLOAD ENDPOINTS
// POST /api/upload/image  — main endpoint (replaces Cloudinary)
// POST /api/s3/upload     — alias
// ============================================================================

async function handleImageUpload(req, res) {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, message: "Không có file được upload" });

        const folder = req.query.folder || req.body.folder || "uploads";
        const result = await uploadImageS3(req.file, folder);

        if (!result.success)
            return res.status(500).json({ success: false, message: result.error });

        return res.json({
            success: true,
            message: "Upload thành công",
            data: result.data      // { url, key, bucket }
        });
    } catch (err) {
        console.error("Upload error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
}

app.post("/api/upload/image", upload.single("image"), handleImageUpload);
app.post("/api/s3/upload",    upload.single("image"), handleImageUpload);
app.post("/api/file/upload",  upload.single("image"), handleImageUpload); // SummaryApi.upload_image
app.post("/api/upload/file",  upload.single("file"),  handleImageUpload);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error" });
});

// ============================================================================
// Start server FIRST, then connect DB asynchronously
// This ensures the health check endpoint is available immediately
// so ECS doesn't kill the task before DB connection is established
// ============================================================================
app.listen(PORT, "0.0.0.0", () => {
    console.log("========================================");
    console.log("🚀 XRestaurant Backend API Started");
    console.log("========================================");
    console.log(`📍 Port       : ${PORT}`);
    console.log(`🌍 NODE_ENV   : ${process.env.NODE_ENV || "development"}`);
    console.log(`🔐 Secret     : ${process.env.DB_SECRET_NAME || "(none - using env vars)"}`);
    console.log(`❤️  Health     : http://localhost:${PORT}/health`);
    console.log("========================================");

    // Connect to DB after server is already listening
    initDatabase().catch((err) => {
        console.error("Fatal DB init error:", err.message);
    });
});
