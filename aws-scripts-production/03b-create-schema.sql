-- ============================================================================
-- File: 03b-create-schema.sql
-- Description: Database schema for XRestaurant
-- Engine: PostgreSQL 15.10
-- Author: Kiro AI Assistant
-- Date: 2026-04-16
-- ============================================================================

-- Drop tables if exist (for clean setup)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- 1. CATEGORIES TABLE
-- ============================================================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_name ON categories(name);

-- ============================================================================
-- 2. PRODUCTS TABLE
-- ============================================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    image VARCHAR(500),
    category VARCHAR(100) REFERENCES categories(name) ON UPDATE CASCADE,
    sub_category VARCHAR(100),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    unit VARCHAR(50) DEFAULT 'phần',
    tags TEXT[], -- Array of tags: ['spicy', 'popular', 'vegetarian']
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_available ON products(is_available);

-- ============================================================================
-- 3. TABLES TABLE (Restaurant tables)
-- ============================================================================
CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    table_number VARCHAR(10) NOT NULL UNIQUE,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    qr_code VARCHAR(100) UNIQUE,
    location VARCHAR(100), -- 'indoor', 'outdoor', 'vip'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tables_status ON tables(status);
CREATE INDEX idx_tables_number ON tables(table_number);

-- ============================================================================
-- 4. USERS TABLE
-- ============================================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('admin', 'staff', 'customer')),
    password_hash VARCHAR(255), -- For future authentication
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- 5. ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    table_number VARCHAR(10),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subtotal INTEGER DEFAULT 0,
    tax INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    total INTEGER NOT NULL CHECK (total >= 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
    payment_method VARCHAR(50), -- 'cash', 'card', 'momo', 'zalopay'
    payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ============================================================================
-- 6. ORDER_ITEMS TABLE (Many-to-Many: Orders <-> Products)
-- ============================================================================
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL, -- Snapshot of product name
    product_price INTEGER NOT NULL, -- Snapshot of price at order time
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    notes TEXT, -- Special requests: 'no onions', 'extra spicy'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ============================================================================
-- 7. BOOKINGS TABLE
-- ============================================================================
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    guests INTEGER NOT NULL CHECK (guests > 0),
    table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    table_number VARCHAR(10),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no-show')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_table ON bookings(table_id);

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS: Useful queries
-- ============================================================================

-- View: Orders with items (for API)
CREATE OR REPLACE VIEW orders_with_items AS
SELECT 
    o.id,
    o.order_number,
    o.customer_name,
    o.table_number,
    o.total,
    o.status,
    o.created_at,
    json_agg(
        json_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'price', oi.product_price,
            'subtotal', oi.subtotal
        )
    ) as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id;

-- View: Daily revenue
CREATE OR REPLACE VIEW daily_revenue AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_orders,
    SUM(total) as revenue,
    AVG(total) as avg_order_value
FROM orders
WHERE status = 'completed' AND payment_status = 'paid'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE categories IS 'Product categories (Món chính, Khai vị, Đồ uống, etc.)';
COMMENT ON TABLE products IS 'Menu items with pricing and inventory';
COMMENT ON TABLE tables IS 'Restaurant tables with capacity and status';
COMMENT ON TABLE users IS 'System users (admin, staff, customers)';
COMMENT ON TABLE orders IS 'Customer orders with status tracking';
COMMENT ON TABLE order_items IS 'Individual items in each order';
COMMENT ON TABLE bookings IS 'Table reservations';

-- ============================================================================
-- GRANT PERMISSIONS (Optional - for application user)
-- ============================================================================

-- If you create a separate app user later:
-- CREATE USER xrestaurant_app WITH PASSWORD 'your_app_password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xrestaurant_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xrestaurant_app;

-- ============================================================================
-- SCHEMA CREATION COMPLETE
-- ============================================================================

-- Verify tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Schema created successfully!';
    RAISE NOTICE '📊 Tables: categories, products, tables, users, orders, order_items, bookings';
    RAISE NOTICE '🔍 Views: orders_with_items, daily_revenue';
    RAISE NOTICE '⚡ Triggers: Auto-update updated_at timestamps';
    RAISE NOTICE '📝 Next step: Run 03c-import-mock-data.sh to populate data';
END $$;
