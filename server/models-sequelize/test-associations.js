/**
 * Test script to verify Sequelize model associations
 * 
 * This script tests all defined associations by:
 * 1. Connecting to the database
 * 2. Verifying each association exists
 * 3. Testing sample queries with includes
 * 
 * Run with: node server/models-sequelize/test-associations.js
 */

import { initializeDatabase } from '../config/database.js';

/**
 * Test if an association exists on a model
 */
function testAssociation(model, associationName, associationType) {
    const association = model.associations[associationName];
    if (association) {
        console.log(`✅ ${model.name}.${associationName} (${associationType})`);
        return true;
    } else {
        console.log(`❌ ${model.name}.${associationName} (${associationType}) - NOT FOUND`);
        return false;
    }
}

/**
 * Main test function
 */
async function testAssociations() {
    console.log('🔍 Testing Sequelize Model Associations\n');
    console.log('='.repeat(60));
    
    try {
        // Initialize database connection FIRST
        console.log('\n📊 Connecting to database...');
        await initializeDatabase();
        console.log('✅ Database connected\n');
        
        // NOW import models after database is initialized
        console.log('📦 Loading models...');
        const models = await import('./index.js');
        const {
            User,
            Customer,
            Category,
            SubCategory,
            Product,
            ProductOption,
            Table,
            TableOrder,
            OrderItem,
            Booking,
            Voucher,
            Payment,
            ServiceRequest,
            SupportChat,
            SupportChatMessage
        } = models;
        console.log('✅ Models loaded\n');
        
        let passCount = 0;
        let failCount = 0;
        
        // ============================================
        // Test User Associations
        // ============================================
        console.log('\n👤 User Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(User, 'orders', 'hasMany') ? 1 : 0;
        failCount += testAssociation(User, 'orders', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(User, 'bookings', 'hasMany') ? 1 : 0;
        failCount += testAssociation(User, 'bookings', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(User, 'linkedTable', 'hasOne') ? 1 : 0;
        failCount += testAssociation(User, 'linkedTable', 'hasOne') ? 0 : 1;
        
        passCount += testAssociation(User, 'payments', 'hasMany') ? 1 : 0;
        failCount += testAssociation(User, 'payments', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(User, 'handledRequests', 'hasMany') ? 1 : 0;
        failCount += testAssociation(User, 'handledRequests', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(User, 'usedVouchers', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(User, 'usedVouchers', 'belongsToMany') ? 0 : 1;
        
        // ============================================
        // Test Product Associations
        // ============================================
        console.log('\n📦 Product Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Product, 'categories', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Product, 'categories', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Product, 'subCategories', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Product, 'subCategories', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Product, 'options', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Product, 'options', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(Product, 'orderItems', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Product, 'orderItems', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(Product, 'vouchers', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Product, 'vouchers', 'belongsToMany') ? 0 : 1;
        
        // ============================================
        // Test TableOrder Associations
        // ============================================
        console.log('\n🍽️  TableOrder Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(TableOrder, 'table', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'table', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'customer', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'customer', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'voucher', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'voucher', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'payment', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'payment', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'items', 'hasMany') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'items', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'serviceRequests', 'hasMany') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'serviceRequests', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(TableOrder, 'user', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(TableOrder, 'user', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test OrderItem Associations
        // ============================================
        console.log('\n🛒 OrderItem Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(OrderItem, 'order', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(OrderItem, 'order', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(OrderItem, 'product', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(OrderItem, 'product', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test Voucher Associations
        // ============================================
        console.log('\n🎟️  Voucher Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Voucher, 'products', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Voucher, 'products', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Voucher, 'categories', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Voucher, 'categories', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Voucher, 'usersUsed', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Voucher, 'usersUsed', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Voucher, 'orders', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Voucher, 'orders', 'hasMany') ? 0 : 1;
        
        // ============================================
        // Test SupportChat Associations
        // ============================================
        console.log('\n💬 SupportChat Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(SupportChat, 'messages', 'hasMany') ? 1 : 0;
        failCount += testAssociation(SupportChat, 'messages', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(SupportChatMessage, 'chat', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(SupportChatMessage, 'chat', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test Category Associations
        // ============================================
        console.log('\n📂 Category Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Category, 'products', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Category, 'products', 'belongsToMany') ? 0 : 1;
        
        passCount += testAssociation(Category, 'vouchers', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(Category, 'vouchers', 'belongsToMany') ? 0 : 1;
        
        // ============================================
        // Test SubCategory Associations
        // ============================================
        console.log('\n📁 SubCategory Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(SubCategory, 'products', 'belongsToMany') ? 1 : 0;
        failCount += testAssociation(SubCategory, 'products', 'belongsToMany') ? 0 : 1;
        
        // ============================================
        // Test Table Associations
        // ============================================
        console.log('\n🪑 Table Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Table, 'orders', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Table, 'orders', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(Table, 'bookings', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Table, 'bookings', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(Table, 'serviceRequests', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Table, 'serviceRequests', 'hasMany') ? 0 : 1;
        
        passCount += testAssociation(Table, 'tableAccount', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(Table, 'tableAccount', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test Booking Associations
        // ============================================
        console.log('\n📅 Booking Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Booking, 'table', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(Booking, 'table', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(Booking, 'user', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(Booking, 'user', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(Booking, 'preOrder', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(Booking, 'preOrder', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test Payment Associations
        // ============================================
        console.log('\n💳 Payment Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Payment, 'user', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(Payment, 'user', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(Payment, 'order', 'hasOne') ? 1 : 0;
        failCount += testAssociation(Payment, 'order', 'hasOne') ? 0 : 1;
        
        // ============================================
        // Test ServiceRequest Associations
        // ============================================
        console.log('\n🔔 ServiceRequest Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(ServiceRequest, 'table', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(ServiceRequest, 'table', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(ServiceRequest, 'order', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(ServiceRequest, 'order', 'belongsTo') ? 0 : 1;
        
        passCount += testAssociation(ServiceRequest, 'handler', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(ServiceRequest, 'handler', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Test Customer Associations
        // ============================================
        console.log('\n👥 Customer Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(Customer, 'orders', 'hasMany') ? 1 : 0;
        failCount += testAssociation(Customer, 'orders', 'hasMany') ? 0 : 1;
        
        // ============================================
        // Test ProductOption Associations
        // ============================================
        console.log('\n⚙️  ProductOption Associations:');
        console.log('-'.repeat(60));
        passCount += testAssociation(ProductOption, 'product', 'belongsTo') ? 1 : 0;
        failCount += testAssociation(ProductOption, 'product', 'belongsTo') ? 0 : 1;
        
        // ============================================
        // Summary
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('📊 Test Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${passCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`📈 Total: ${passCount + failCount}`);
        console.log(`🎯 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(2)}%`);
        
        if (failCount === 0) {
            console.log('\n🎉 All associations are correctly defined!');
        } else {
            console.log('\n⚠️  Some associations are missing or incorrectly defined.');
        }
        
        // ============================================
        // Test Sample Queries
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('🔍 Testing Sample Association Queries:');
        console.log('='.repeat(60));
        
        try {
            // Test 1: Find a product with its categories
            console.log('\n1️⃣  Testing: Product.findOne with categories...');
            const product = await Product.findOne({
                include: [{ model: Category, as: 'categories' }],
                limit: 1
            });
            if (product) {
                console.log(`✅ Query successful: Found product "${product.name}"`);
            } else {
                console.log('⚠️  No products found in database (this is OK for empty DB)');
            }
        } catch (error) {
            console.log(`❌ Query failed: ${error.message}`);
        }
        
        try {
            // Test 2: Find a table order with all related data
            console.log('\n2️⃣  Testing: TableOrder.findOne with nested includes...');
            const order = await TableOrder.findOne({
                include: [
                    { model: Table, as: 'table' },
                    { model: Customer, as: 'customer' },
                    { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
                    { model: Voucher, as: 'voucher' },
                    { model: Payment, as: 'payment' }
                ],
                limit: 1
            });
            if (order) {
                console.log(`✅ Query successful: Found order for table "${order.tableNumber}"`);
            } else {
                console.log('⚠️  No orders found in database (this is OK for empty DB)');
            }
        } catch (error) {
            console.log(`❌ Query failed: ${error.message}`);
        }
        
        try {
            // Test 3: Find a user with their bookings and orders
            console.log('\n3️⃣  Testing: User.findOne with bookings and orders...');
            const user = await User.findOne({
                include: [
                    { model: Booking, as: 'bookings' },
                    { model: TableOrder, as: 'orders' }
                ],
                limit: 1
            });
            if (user) {
                console.log(`✅ Query successful: Found user "${user.name}"`);
            } else {
                console.log('⚠️  No users found in database (this is OK for empty DB)');
            }
        } catch (error) {
            console.log(`❌ Query failed: ${error.message}`);
        }
        
        try {
            // Test 4: Find a voucher with its products and categories
            console.log('\n4️⃣  Testing: Voucher.findOne with products and categories...');
            const voucher = await Voucher.findOne({
                include: [
                    { model: Product, as: 'products' },
                    { model: Category, as: 'categories' }
                ],
                limit: 1
            });
            if (voucher) {
                console.log(`✅ Query successful: Found voucher "${voucher.code}"`);
            } else {
                console.log('⚠️  No vouchers found in database (this is OK for empty DB)');
            }
        } catch (error) {
            console.log(`❌ Query failed: ${error.message}`);
        }
        
        try {
            // Test 5: Find a support chat with messages
            console.log('\n5️⃣  Testing: SupportChat.findOne with messages...');
            const chat = await SupportChat.findOne({
                include: [{ model: SupportChatMessage, as: 'messages' }],
                limit: 1
            });
            if (chat) {
                console.log(`✅ Query successful: Found chat "${chat.conversationId}"`);
            } else {
                console.log('⚠️  No support chats found in database (this is OK for empty DB)');
            }
        } catch (error) {
            console.log(`❌ Query failed: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Association testing completed!');
        console.log('='.repeat(60));
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error during testing:', error);
        process.exit(1);
    }
}

// Run tests
testAssociations();
