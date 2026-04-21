/**
 * Model Verification Script
 * 
 * This script verifies that all Sequelize models can be imported correctly
 * and that their basic structure is valid.
 * 
 * Run with: node models-sequelize/verify-models.js
 */

import {
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
} from './index.js';

const models = {
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
};

console.log('🔍 Verifying Sequelize Models...\n');

let allValid = true;

Object.entries(models).forEach(([name, model]) => {
    try {
        // Check if model is defined
        if (!model) {
            console.log(`❌ ${name}: Model is undefined`);
            allValid = false;
            return;
        }

        // Check if model has required properties
        const hasTableName = model.tableName !== undefined;
        const hasAttributes = Object.keys(model.rawAttributes).length > 0;
        const hasPrimaryKey = model.primaryKeyAttribute !== undefined;

        if (!hasTableName) {
            console.log(`❌ ${name}: Missing tableName`);
            allValid = false;
            return;
        }

        if (!hasAttributes) {
            console.log(`❌ ${name}: No attributes defined`);
            allValid = false;
            return;
        }

        if (!hasPrimaryKey) {
            console.log(`❌ ${name}: No primary key defined`);
            allValid = false;
            return;
        }

        // Check if primary key is UUID
        const pkAttribute = model.rawAttributes[model.primaryKeyAttribute];
        const isUUID = pkAttribute.type.key === 'UUID';

        if (!isUUID) {
            console.log(`⚠️  ${name}: Primary key is not UUID (found: ${pkAttribute.type.key})`);
        }

        // Count attributes
        const attributeCount = Object.keys(model.rawAttributes).length;
        const indexCount = model.options.indexes ? model.options.indexes.length : 0;

        console.log(`✅ ${name}:`);
        console.log(`   - Table: ${model.tableName}`);
        console.log(`   - Attributes: ${attributeCount}`);
        console.log(`   - Indexes: ${indexCount}`);
        console.log(`   - Primary Key: ${model.primaryKeyAttribute} (${pkAttribute.type.key})`);
        console.log(`   - Timestamps: ${model.options.timestamps ? 'enabled' : 'disabled'}`);
        console.log('');

    } catch (error) {
        console.log(`❌ ${name}: Error - ${error.message}`);
        allValid = false;
    }
});

if (allValid) {
    console.log('✅ All models verified successfully!');
    console.log(`\n📊 Summary: ${Object.keys(models).length} models checked`);
} else {
    console.log('❌ Some models have issues. Please review the output above.');
    process.exit(1);
}
