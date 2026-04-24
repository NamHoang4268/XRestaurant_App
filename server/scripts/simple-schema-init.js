#!/usr/bin/env node

/**
 * Simple Schema Initialization Script
 * 
 * This is a simplified version that creates tables without complex model imports
 * Designed to work in the bastion host environment
 */

import pg from 'pg';
const { Client } = pg;

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || 'xrestaurant-db.cn088oemgmw1.us-west-2.rds.amazonaws.com',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'xrestaurant',
    user: process.env.DB_USERNAME || 'xrestaurant_admin',  // Fixed: use DB_USERNAME not DB_USER
    password: process.env.DB_PASSWORD || 'XRestaurant2026!',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

console.log('🚀 Simple PostgreSQL Schema Initialization');
console.log('=' .repeat(60));
console.log('📡 Database Configuration:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Port: ${dbConfig.port}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   Username: ${dbConfig.user}`);
console.log(`   SSL: ${dbConfig.ssl ? 'enabled' : 'disabled'}`);
console.log('=' .repeat(60));

// SQL statements to create tables
const createTablesSQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    role VARCHAR(50) DEFAULT 'customer',
    "tierLevel" INTEGER DEFAULT 1,
    "rewardsPoint" INTEGER DEFAULT 0,
    "employeeId" VARCHAR(255),
    "linkedTableId" UUID,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "isDeleted" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sub Categories table
CREATE TABLE IF NOT EXISTS sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    status VARCHAR(50) DEFAULT 'available',
    "isFeatured" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product Options table
CREATE TABLE IF NOT EXISTS product_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "productId" UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    "additionalPrice" DECIMAL(10,2) DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tables table
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tableNumber" INTEGER UNIQUE NOT NULL,
    capacity INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'available',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table Orders table
CREATE TABLE IF NOT EXISTS table_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tableId" UUID NOT NULL,
    "customerId" UUID,
    "totalAmount" DECIMAL(10,2) DEFAULT 0,
    "paymentStatus" VARCHAR(50) DEFAULT 'pending',
    "voucherId" UUID,
    "paymentId" UUID,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tableOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    quantity INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "kitchenStatus" VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tableId" UUID NOT NULL,
    "userId" UUID,
    "customerName" VARCHAR(255) NOT NULL,
    "customerPhone" VARCHAR(20) NOT NULL,
    "bookingDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "partySize" INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed',
    "preOrderId" UUID,
    notes TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "discountType" VARCHAR(20) NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "minOrderAmount" DECIMAL(10,2) DEFAULT 0,
    "maxDiscountAmount" DECIMAL(10,2),
    "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER DEFAULT 0,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID,
    "tableOrderId" UUID,
    amount DECIMAL(10,2) NOT NULL,
    "paymentMethod" VARCHAR(50) NOT NULL,
    "paymentStatus" VARCHAR(50) DEFAULT 'pending',
    "transactionId" VARCHAR(255),
    "stripePaymentIntentId" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Service Requests table
CREATE TABLE IF NOT EXISTS service_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tableId" UUID NOT NULL,
    "tableOrderId" UUID,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    "handledBy" UUID,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Support Chats table
CREATE TABLE IF NOT EXISTS support_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "conversationId" VARCHAR(255) UNIQUE NOT NULL,
    "customerName" VARCHAR(255),
    "customerEmail" VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Support Chat Messages table
CREATE TABLE IF NOT EXISTS support_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "supportChatId" UUID NOT NULL,
    "senderType" VARCHAR(20) NOT NULL,
    "senderName" VARCHAR(255),
    message TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Junction Tables

-- Product Categories (Many-to-Many)
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL,
    category_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, category_id)
);

-- Product Sub Categories (Many-to-Many)
CREATE TABLE IF NOT EXISTS product_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, sub_category_id)
);

-- Voucher Products (Many-to-Many)
CREATE TABLE IF NOT EXISTS voucher_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID NOT NULL,
    product_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voucher_id, product_id)
);

-- Voucher Categories (Many-to-Many)
CREATE TABLE IF NOT EXISTS voucher_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID NOT NULL,
    category_id UUID NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voucher_id, category_id)
);

-- Voucher Usage (Many-to-Many)
CREATE TABLE IF NOT EXISTS voucher_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID NOT NULL,
    user_id UUID NOT NULL,
    "usedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// SQL statements to create foreign key constraints
const createConstraintsSQL = `
-- Add Foreign Key Constraints

-- Users table constraints
ALTER TABLE users 
ADD CONSTRAINT IF NOT EXISTS fk_users_linked_table 
FOREIGN KEY ("linkedTableId") REFERENCES tables(id) ON DELETE SET NULL;

-- Product Options constraints
ALTER TABLE product_options 
ADD CONSTRAINT IF NOT EXISTS fk_product_options_product 
FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE CASCADE;

-- Table Orders constraints
ALTER TABLE table_orders 
ADD CONSTRAINT IF NOT EXISTS fk_table_orders_table 
FOREIGN KEY ("tableId") REFERENCES tables(id) ON DELETE CASCADE;

ALTER TABLE table_orders 
ADD CONSTRAINT IF NOT EXISTS fk_table_orders_customer 
FOREIGN KEY ("customerId") REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE table_orders 
ADD CONSTRAINT IF NOT EXISTS fk_table_orders_voucher 
FOREIGN KEY ("voucherId") REFERENCES vouchers(id) ON DELETE SET NULL;

ALTER TABLE table_orders 
ADD CONSTRAINT IF NOT EXISTS fk_table_orders_payment 
FOREIGN KEY ("paymentId") REFERENCES payments(id) ON DELETE SET NULL;

-- Order Items constraints
ALTER TABLE order_items 
ADD CONSTRAINT IF NOT EXISTS fk_order_items_table_order 
FOREIGN KEY ("tableOrderId") REFERENCES table_orders(id) ON DELETE CASCADE;

ALTER TABLE order_items 
ADD CONSTRAINT IF NOT EXISTS fk_order_items_product 
FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE CASCADE;

-- Bookings constraints
ALTER TABLE bookings 
ADD CONSTRAINT IF NOT EXISTS fk_bookings_table 
FOREIGN KEY ("tableId") REFERENCES tables(id) ON DELETE CASCADE;

ALTER TABLE bookings 
ADD CONSTRAINT IF NOT EXISTS fk_bookings_user 
FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE bookings 
ADD CONSTRAINT IF NOT EXISTS fk_bookings_pre_order 
FOREIGN KEY ("preOrderId") REFERENCES table_orders(id) ON DELETE SET NULL;

-- Payments constraints
ALTER TABLE payments 
ADD CONSTRAINT IF NOT EXISTS fk_payments_user 
FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments 
ADD CONSTRAINT IF NOT EXISTS fk_payments_table_order 
FOREIGN KEY ("tableOrderId") REFERENCES table_orders(id) ON DELETE CASCADE;

-- Service Requests constraints
ALTER TABLE service_requests 
ADD CONSTRAINT IF NOT EXISTS fk_service_requests_table 
FOREIGN KEY ("tableId") REFERENCES tables(id) ON DELETE CASCADE;

ALTER TABLE service_requests 
ADD CONSTRAINT IF NOT EXISTS fk_service_requests_table_order 
FOREIGN KEY ("tableOrderId") REFERENCES table_orders(id) ON DELETE SET NULL;

ALTER TABLE service_requests 
ADD CONSTRAINT IF NOT EXISTS fk_service_requests_handled_by 
FOREIGN KEY ("handledBy") REFERENCES users(id) ON DELETE SET NULL;

-- Support Chat Messages constraints
ALTER TABLE support_chat_messages 
ADD CONSTRAINT IF NOT EXISTS fk_support_chat_messages_chat 
FOREIGN KEY ("supportChatId") REFERENCES support_chats(id) ON DELETE CASCADE;

-- Junction table constraints
ALTER TABLE product_categories 
ADD CONSTRAINT IF NOT EXISTS fk_product_categories_product 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE product_categories 
ADD CONSTRAINT IF NOT EXISTS fk_product_categories_category 
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;

ALTER TABLE product_sub_categories 
ADD CONSTRAINT IF NOT EXISTS fk_product_sub_categories_product 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE product_sub_categories 
ADD CONSTRAINT IF NOT EXISTS fk_product_sub_categories_sub_category 
FOREIGN KEY (sub_category_id) REFERENCES sub_categories(id) ON DELETE CASCADE;

ALTER TABLE voucher_products 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_products_voucher 
FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;

ALTER TABLE voucher_products 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_products_product 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE voucher_categories 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_categories_voucher 
FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;

ALTER TABLE voucher_categories 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_categories_category 
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;

ALTER TABLE voucher_usage 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_usage_voucher 
FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;

ALTER TABLE voucher_usage 
ADD CONSTRAINT IF NOT EXISTS fk_voucher_usage_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
`;

// SQL statements to create indexes
const createIndexesSQL = `
-- Create Indexes for Performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier_level ON users("tierLevel");
CREATE INDEX IF NOT EXISTS idx_users_rewards_point ON users("rewardsPoint");
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users("employeeId");

-- Customers table indexes
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Categories table indexes
CREATE INDEX IF NOT EXISTS idx_categories_is_deleted ON categories("isDeleted");
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products("isFeatured");
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- Product Options table indexes
CREATE INDEX IF NOT EXISTS idx_product_options_product_id ON product_options("productId");

-- Tables table indexes
CREATE INDEX IF NOT EXISTS idx_tables_table_number ON tables("tableNumber");
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);
CREATE INDEX IF NOT EXISTS idx_tables_is_active ON tables("isActive");

-- Table Orders table indexes
CREATE INDEX IF NOT EXISTS idx_table_orders_customer_id ON table_orders("customerId");
CREATE INDEX IF NOT EXISTS idx_table_orders_payment_status ON table_orders("paymentStatus");

-- Order Items table indexes
CREATE INDEX IF NOT EXISTS idx_order_items_table_order_id ON order_items("tableOrderId");
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items("productId");
CREATE INDEX IF NOT EXISTS idx_order_items_kitchen_status ON order_items("kitchenStatus");

-- Bookings table indexes
CREATE INDEX IF NOT EXISTS idx_bookings_table_id ON bookings("tableId");
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings("userId");

-- Vouchers table indexes
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- Payments table indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments("userId");
CREATE INDEX IF NOT EXISTS idx_payments_payment_status ON payments("paymentStatus");
CREATE INDEX IF NOT EXISTS idx_payments_table_order_id ON payments("tableOrderId");

-- Support Chats table indexes
CREATE INDEX IF NOT EXISTS idx_support_chats_conversation_id ON support_chats("conversationId");
`;

async function connectToDatabase() {
    const client = new Client(dbConfig);
    
    try {
        console.log('\n📡 Connecting to PostgreSQL database...');
        await client.connect();
        console.log('✅ Database connection established');
        return client;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        throw error;
    }
}

async function createTables(client) {
    try {
        console.log('\n📋 Creating database tables...');
        await client.query(createTablesSQL);
        console.log('✅ All tables created successfully');
    } catch (error) {
        console.error('❌ Failed to create tables:', error.message);
        throw error;
    }
}

async function createConstraints(client) {
    try {
        console.log('\n🔗 Creating foreign key constraints...');
        await client.query(createConstraintsSQL);
        console.log('✅ All foreign key constraints created successfully');
    } catch (error) {
        console.error('❌ Failed to create constraints:', error.message);
        throw error;
    }
}

async function createIndexes(client) {
    try {
        console.log('\n📊 Creating database indexes...');
        await client.query(createIndexesSQL);
        console.log('✅ All indexes created successfully');
    } catch (error) {
        console.error('❌ Failed to create indexes:', error.message);
        throw error;
    }
}

async function verifySchema(client) {
    try {
        console.log('\n🔍 Verifying schema creation...');
        
        // Get list of tables
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        const tables = tablesResult.rows.map(row => row.table_name);
        console.log(`✅ Found ${tables.length} tables:`);
        tables.forEach(table => console.log(`   - ${table}`));
        
        // Get database size
        const sizeResult = await client.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        console.log(`\n📊 Database size: ${sizeResult.rows[0].size}`);
        
        return true;
    } catch (error) {
        console.error('❌ Schema verification failed:', error.message);
        return false;
    }
}

async function main() {
    let client;
    
    try {
        // Connect to database
        client = await connectToDatabase();
        
        // Create tables
        await createTables(client);
        
        // Create constraints
        await createConstraints(client);
        
        // Create indexes
        await createIndexes(client);
        
        // Verify schema
        const verified = await verifySchema(client);
        
        if (verified) {
            console.log('\n' + '='.repeat(60));
            console.log('✅ Schema initialization completed successfully!');
            console.log('=' .repeat(60));
            console.log('\nNext steps:');
            console.log('  1. Run data migration script to import data');
            console.log('  2. Test database connectivity from application');
            console.log('  3. Proceed with W3 requirements\n');
        } else {
            throw new Error('Schema verification failed');
        }
        
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ Schema initialization failed!');
        console.error('=' .repeat(60));
        console.error('\nError:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
        
    } finally {
        if (client) {
            await client.end();
            console.log('✅ Database connection closed');
        }
    }
}

// Run the script
main();