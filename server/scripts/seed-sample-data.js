#!/usr/bin/env node

/**
 * Seed Sample Data Script for PostgreSQL
 * 
 * This script populates the PostgreSQL database with sample categories and products
 * to replace the mock data from the previous implementation.
 */

import { initializeDatabase, closeDatabase } from '../config/database.js';
import { Category, Product, ProductCategory } from '../models-sequelize/index.js';

// Sample data matching the previous mock data
const SAMPLE_CATEGORIES = [
    { name: 'Appetizers', description: 'Món khai vị' },
    { name: 'Main Course', description: 'Món chính' },
    { name: 'Desserts', description: 'Món tráng miệng' },
    { name: 'Beverages', description: 'Đồ uống' },
    { name: 'Specials', description: 'Món đặc biệt' }
];

const SAMPLE_PRODUCTS = [
    { 
        name: 'Spring Rolls', 
        description: 'Chả giò giòn rụm', 
        price: 50000, 
        categoryName: 'Appetizers',
        images: ['https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/spring-rolls.jpg']
    },
    { 
        name: 'Pho Bo', 
        description: 'Phở bò truyền thống', 
        price: 80000, 
        categoryName: 'Main Course',
        images: ['https://xrestaurant-media-905418484418.s3.ap-southeast-1.amazonaws.com/pho-bo.jpg']
    },
    { 
        name: 'Banh Mi', 
        description: 'Bánh mì Việt Nam', 
        price: 35000, 
        categoryName: 'Main Course',
        images: ['https://via.placeholder.com/300/45B7D1/FFFFFF?text=Banh+Mi']
    },
    { 
        name: 'Che Ba Mau', 
        description: 'Chè ba màu', 
        price: 30000, 
        categoryName: 'Desserts',
        images: ['https://via.placeholder.com/300/FFA07A/FFFFFF?text=Che+Ba+Mau']
    },
    { 
        name: 'Ca Phe Sua Da', 
        description: 'Cà phê sữa đá', 
        price: 25000, 
        categoryName: 'Beverages',
        images: ['https://via.placeholder.com/300/96CEB4/FFFFFF?text=Coffee']
    },
    { 
        name: 'Goi Cuon', 
        description: 'Gỏi cuốn tôm thịt', 
        price: 45000, 
        categoryName: 'Appetizers',
        images: ['https://via.placeholder.com/300/FFEAA7/333333?text=Goi+Cuon']
    },
    { 
        name: 'Com Tam', 
        description: 'Cơm tấm sườn bì chả', 
        price: 55000, 
        categoryName: 'Main Course',
        images: ['https://via.placeholder.com/300/DFE6E9/333333?text=Com+Tam']
    },
    { 
        name: 'Bun Cha', 
        description: 'Bún chả Hà Nội', 
        price: 60000, 
        categoryName: 'Main Course',
        images: ['https://via.placeholder.com/300/74B9FF/FFFFFF?text=Bun+Cha']
    }
];

async function seedSampleData() {
    console.log('🌱 Starting sample data seeding...');
    
    try {
        // Initialize database connection
        await initializeDatabase();
        console.log('✅ Database connection established');
        
        // Check if data already exists
        const existingCategories = await Category.count({ where: { isDeleted: false } });
        const existingProducts = await Product.count({ where: { publish: true } });
        
        if (existingCategories > 0 || existingProducts > 0) {
            console.log(`⚠️  Data already exists: ${existingCategories} categories, ${existingProducts} products`);
            console.log('🔄 Skipping seeding to avoid duplicates');
            return;
        }
        
        console.log('📋 Creating sample categories...');
        
        // Create categories
        const createdCategories = {};
        for (const categoryData of SAMPLE_CATEGORIES) {
            const category = await Category.create({
                name: categoryData.name,
                description: categoryData.description,
                image: '',
                isDeleted: false
            });
            
            createdCategories[categoryData.name] = category;
            console.log(`✅ Created category: ${category.name} (${category.id})`);
        }
        
        console.log('🍽️  Creating sample products...');
        
        // Create products and associate with categories
        for (const productData of SAMPLE_PRODUCTS) {
            const product = await Product.create({
                name: productData.name,
                description: productData.description,
                price: productData.price,
                discount: 0,
                images: productData.images,
                status: 'available',
                preparationTime: 15,
                isFeatured: false,
                publish: true,
                moreDetails: {}
            });
            
            // Associate with category
            const category = createdCategories[productData.categoryName];
            if (category) {
                await ProductCategory.create({
                    productId: product.id,
                    categoryId: category.id
                });
                console.log(`✅ Created product: ${product.name} → ${category.name}`);
            } else {
                console.log(`⚠️  Product created without category: ${product.name}`);
            }
        }
        
        // Summary
        const finalCategories = await Category.count({ where: { isDeleted: false } });
        const finalProducts = await Product.count({ where: { publish: true } });
        
        console.log('');
        console.log('🎉 Sample data seeding completed successfully!');
        console.log('📊 Summary:');
        console.log(`   - Categories created: ${finalCategories}`);
        console.log(`   - Products created: ${finalProducts}`);
        console.log('');
        console.log('🚀 Your PostgreSQL database is now ready with sample data!');
        
    } catch (error) {
        console.error('❌ Error during sample data seeding:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await closeDatabase();
        console.log('✅ Database connection closed');
    }
}

// Run the seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedSampleData();
}

export default seedSampleData;