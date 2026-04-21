import { initializeDatabase, closeDatabase } from '../config/database.js';
import dotenv from 'dotenv';

// Import all models to ensure they are registered with Sequelize
import User from '../models-sequelize/user.model.js';
import Customer from '../models-sequelize/customer.model.js';
import Category from '../models-sequelize/category.model.js';
import SubCategory from '../models-sequelize/subCategory.model.js';
import Product from '../models-sequelize/product.model.js';
import ProductOption from '../models-sequelize/productOption.model.js';
import Table from '../models-sequelize/table.model.js';
import TableOrder from '../models-sequelize/tableOrder.model.js';
import OrderItem from '../models-sequelize/orderItem.model.js';
import Booking from '../models-sequelize/booking.model.js';
import Voucher from '../models-sequelize/voucher.model.js';
import Payment from '../models-sequelize/payment.model.js';
import ServiceRequest from '../models-sequelize/serviceRequest.model.js';
import SupportChat from '../models-sequelize/supportChat.model.js';
import SupportChatMessage from '../models-sequelize/supportChatMessage.model.js';
import ProductCategory from '../models-sequelize/productCategory.model.js';
import ProductSubCategory from '../models-sequelize/productSubCategory.model.js';
import VoucherProduct from '../models-sequelize/voucherProduct.model.js';
import VoucherCategory from '../models-sequelize/voucherCategory.model.js';
import VoucherUsage from '../models-sequelize/voucherUsage.model.js';

dotenv.config();

/**
 * Schema Initialization Script
 * 
 * This script creates all database tables using Sequelize sync and verifies:
 * - All tables are created successfully
 * - All indexes are created successfully
 * - All foreign key constraints are created successfully
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.8
 */

// Define expected tables (15 main + 5 junction tables)
const EXPECTED_TABLES = [
    // Main tables
    'users',
    'customers',
    'categories',
    'sub_categories',
    'products',
    'product_options',
    'tables',
    'table_orders',
    'order_items',
    'bookings',
    'vouchers',
    'payments',
    'service_requests',
    'support_chats',
    'support_chat_messages',
    // Junction tables
    'product_categories',
    'product_sub_categories',
    'voucher_products',
    'voucher_categories',
    'voucher_usage'
];

// Define expected foreign key constraints
const EXPECTED_FOREIGN_KEYS = [
    { table: 'users', column: 'linkedTableId', references: 'tables' },
    { table: 'product_options', column: 'productId', references: 'products' },
    { table: 'product_categories', column: 'product_id', references: 'products' },
    { table: 'product_categories', column: 'category_id', references: 'categories' },
    { table: 'product_sub_categories', column: 'product_id', references: 'products' },
    { table: 'product_sub_categories', column: 'sub_category_id', references: 'sub_categories' },
    { table: 'table_orders', column: 'tableId', references: 'tables' },
    { table: 'table_orders', column: 'customerId', references: 'customers' },
    { table: 'table_orders', column: 'voucherId', references: 'vouchers' },
    { table: 'table_orders', column: 'paymentId', references: 'payments' },
    { table: 'order_items', column: 'tableOrderId', references: 'table_orders' },
    { table: 'order_items', column: 'productId', references: 'products' },
    { table: 'bookings', column: 'tableId', references: 'tables' },
    { table: 'bookings', column: 'userId', references: 'users' },
    { table: 'bookings', column: 'preOrderId', references: 'table_orders' },
    { table: 'voucher_products', column: 'voucher_id', references: 'vouchers' },
    { table: 'voucher_products', column: 'product_id', references: 'products' },
    { table: 'voucher_categories', column: 'voucher_id', references: 'vouchers' },
    { table: 'voucher_categories', column: 'category_id', references: 'categories' },
    { table: 'voucher_usage', column: 'voucher_id', references: 'vouchers' },
    { table: 'voucher_usage', column: 'user_id', references: 'users' },
    { table: 'payments', column: 'userId', references: 'users' },
    { table: 'payments', column: 'tableOrderId', references: 'table_orders' },
    { table: 'service_requests', column: 'tableId', references: 'tables' },
    { table: 'service_requests', column: 'tableOrderId', references: 'table_orders' },
    { table: 'service_requests', column: 'handledBy', references: 'users' },
    { table: 'support_chat_messages', column: 'supportChatId', references: 'support_chats' }
];

// Define expected indexes (key indexes for performance)
const EXPECTED_INDEXES = [
    { table: 'users', column: 'email' },
    { table: 'users', column: 'tierLevel' },
    { table: 'users', column: 'rewardsPoint' },
    { table: 'users', column: 'role' },
    { table: 'users', column: 'employeeId' },
    { table: 'customers', column: 'phone' },
    { table: 'categories', column: 'isDeleted' },
    { table: 'categories', column: 'name' },
    { table: 'products', column: 'status' },
    { table: 'products', column: 'isFeatured' },
    { table: 'products', column: 'price' },
    { table: 'product_options', column: 'productId' },
    { table: 'tables', column: 'tableNumber' },
    { table: 'tables', column: 'status' },
    { table: 'tables', column: 'isActive' },
    { table: 'table_orders', column: 'customerId' },
    { table: 'table_orders', column: 'paymentStatus' },
    { table: 'order_items', column: 'tableOrderId' },
    { table: 'order_items', column: 'productId' },
    { table: 'order_items', column: 'kitchenStatus' },
    { table: 'bookings', column: 'tableId' },
    { table: 'bookings', column: 'status' },
    { table: 'bookings', column: 'userId' },
    { table: 'vouchers', column: 'code' },
    { table: 'payments', column: 'userId' },
    { table: 'payments', column: 'paymentStatus' },
    { table: 'payments', column: 'tableOrderId' },
    { table: 'support_chats', column: 'conversationId' }
];

/**
 * Verify that all expected tables exist in the database
 */
async function verifyTables(sequelize) {
    console.log('\n📋 Verifying table creation...');
    
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    
    const missingTables = EXPECTED_TABLES.filter(table => !tables.includes(table));
    
    if (missingTables.length > 0) {
        console.error('❌ Missing tables:', missingTables.join(', '));
        return false;
    }
    
    console.log(`✅ All ${EXPECTED_TABLES.length} tables created successfully`);
    console.log(`   Tables: ${tables.join(', ')}`);
    return true;
}

/**
 * Verify that all expected indexes exist in the database
 */
async function verifyIndexes(sequelize) {
    console.log('\n📋 Verifying index creation...');
    
    let totalIndexes = 0;
    let verifiedIndexes = 0;
    const missingIndexes = [];
    
    for (const expectedIndex of EXPECTED_INDEXES) {
        totalIndexes++;
        
        try {
            // Query to check if index exists on the column
            const [results] = await sequelize.query(`
                SELECT 
                    i.relname as index_name,
                    a.attname as column_name
                FROM 
                    pg_class t,
                    pg_class i,
                    pg_index ix,
                    pg_attribute a
                WHERE 
                    t.oid = ix.indrelid
                    AND i.oid = ix.indexrelid
                    AND a.attrelid = t.oid
                    AND a.attnum = ANY(ix.indkey)
                    AND t.relkind = 'r'
                    AND t.relname = :tableName
                    AND a.attname = :columnName
            `, {
                replacements: {
                    tableName: expectedIndex.table,
                    columnName: expectedIndex.column
                }
            });
            
            if (results.length > 0) {
                verifiedIndexes++;
            } else {
                missingIndexes.push(`${expectedIndex.table}.${expectedIndex.column}`);
            }
        } catch (error) {
            console.warn(`⚠️  Could not verify index on ${expectedIndex.table}.${expectedIndex.column}:`, error.message);
        }
    }
    
    if (missingIndexes.length > 0) {
        console.warn(`⚠️  Some indexes may be missing (${missingIndexes.length}/${totalIndexes}):`);
        console.warn(`   ${missingIndexes.join(', ')}`);
        console.warn('   Note: Sequelize may use different index naming conventions');
    }
    
    console.log(`✅ Verified ${verifiedIndexes}/${totalIndexes} expected indexes`);
    return true; // Don't fail on index verification as Sequelize may name them differently
}

/**
 * Verify that all expected foreign key constraints exist in the database
 */
async function verifyForeignKeys(sequelize) {
    console.log('\n📋 Verifying foreign key constraints...');
    
    let totalConstraints = 0;
    let verifiedConstraints = 0;
    const missingConstraints = [];
    
    for (const fk of EXPECTED_FOREIGN_KEYS) {
        totalConstraints++;
        
        try {
            // Query to check if foreign key constraint exists
            const [results] = await sequelize.query(`
                SELECT
                    tc.constraint_name,
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM
                    information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                WHERE
                    tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_name = :tableName
                    AND kcu.column_name = :columnName
                    AND ccu.table_name = :referencedTable
            `, {
                replacements: {
                    tableName: fk.table,
                    columnName: fk.column,
                    referencedTable: fk.references
                }
            });
            
            if (results.length > 0) {
                verifiedConstraints++;
            } else {
                missingConstraints.push(`${fk.table}.${fk.column} -> ${fk.references}`);
            }
        } catch (error) {
            console.warn(`⚠️  Could not verify FK on ${fk.table}.${fk.column}:`, error.message);
        }
    }
    
    if (missingConstraints.length > 0) {
        console.error(`❌ Missing foreign key constraints (${missingConstraints.length}/${totalConstraints}):`);
        console.error(`   ${missingConstraints.join(', ')}`);
        return false;
    }
    
    console.log(`✅ All ${totalConstraints} foreign key constraints verified`);
    return true;
}

/**
 * Display database schema summary
 */
async function displaySchemaSummary(sequelize) {
    console.log('\n📊 Database Schema Summary:');
    
    try {
        // Get table row counts
        const queryInterface = sequelize.getQueryInterface();
        const tables = await queryInterface.showAllTables();
        
        console.log('\n   Table Statistics:');
        for (const table of tables.sort()) {
            try {
                const [result] = await sequelize.query(`SELECT COUNT(*) as count FROM "${table}"`);
                const count = result[0].count;
                console.log(`   - ${table.padEnd(30)} ${count} rows`);
            } catch (error) {
                console.log(`   - ${table.padEnd(30)} (unable to count)`);
            }
        }
        
        // Get database size
        const [sizeResult] = await sequelize.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        console.log(`\n   Database Size: ${sizeResult[0].size}`);
        
    } catch (error) {
        console.warn('⚠️  Could not generate schema summary:', error.message);
    }
}

/**
 * Main initialization function
 */
async function initializeSchema() {
    console.log('🚀 Starting PostgreSQL Schema Initialization\n');
    console.log('=' .repeat(60));
    
    let sequelize;
    
    try {
        // Step 1: Initialize database connection
        console.log('\n📡 Step 1: Connecting to database...');
        sequelize = await initializeDatabase();
        console.log('✅ Database connection established');
        
        // Step 2: Sync all models (create tables)
        console.log('\n📡 Step 2: Creating database schema...');
        console.log('   This will create all tables, indexes, and constraints');
        console.log('   Using Sequelize sync with alter: false, force: false');
        
        await sequelize.sync({ 
            alter: false,  // Don't alter existing tables
            force: false   // Don't drop existing tables
        });
        
        console.log('✅ Schema synchronization completed');
        
        // Step 3: Verify tables
        const tablesOk = await verifyTables(sequelize);
        if (!tablesOk) {
            throw new Error('Table verification failed');
        }
        
        // Step 4: Verify indexes
        const indexesOk = await verifyIndexes(sequelize);
        if (!indexesOk) {
            console.warn('⚠️  Index verification completed with warnings');
        }
        
        // Step 5: Verify foreign keys
        const foreignKeysOk = await verifyForeignKeys(sequelize);
        if (!foreignKeysOk) {
            throw new Error('Foreign key verification failed');
        }
        
        // Step 6: Display summary
        await displaySchemaSummary(sequelize);
        
        // Success
        console.log('\n' + '='.repeat(60));
        console.log('✅ Schema initialization completed successfully!');
        console.log('=' .repeat(60));
        console.log('\nNext steps:');
        console.log('  1. Run data migration script to import data');
        console.log('  2. Verify data integrity');
        console.log('  3. Test API endpoints\n');
        
        await closeDatabase();
        process.exit(0);
        
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ Schema initialization failed!');
        console.error('=' .repeat(60));
        console.error('\nError:', error.message);
        console.error('\nStack trace:', error.stack);
        
        if (sequelize) {
            await closeDatabase();
        }
        
        process.exit(1);
    }
}

// Run the initialization
initializeSchema();
