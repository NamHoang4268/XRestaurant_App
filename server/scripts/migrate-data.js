/**
 * Data Migration Script: MongoDB to PostgreSQL
 * 
 * This script migrates all data from MongoDB to PostgreSQL while:
 * - Converting ObjectIds to UUIDs
 * - Normalizing embedded documents to separate tables
 * - Maintaining referential integrity
 * - Using transactions for atomicity
 */

import mongoose from 'mongoose';
import { Sequelize } from 'sequelize';
import { initializeDatabase, closeDatabase } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// Import MongoDB models
import CategoryModel from '../models/category.model.js';
import SubCategoryModel from '../models/subCategory.model.js';
import ProductModel from '../models/product.model.js';
import TableModel from '../models/table.model.js';
import UserModel from '../models/user.model.js';
import CustomerModel from '../models/customer.model.js';
import VoucherModel from '../models/voucher.model.js';
import BookingModel from '../models/booking.model.js';
import TableOrderModel from '../models/tableOrder.model.js';
import PaymentModel from '../models/payment.model.js';
import ServiceRequestModel from '../models/serviceRequest.model.js';
import SupportChatModel from '../models/supportChat.model.js';

// Import Sequelize models
import {
    Category, SubCategory, Product, ProductOption,
    Table, User, Customer, Voucher, Booking,
    TableOrder, OrderItem, Payment, ServiceRequest,
    SupportChat, SupportChatMessage,
    ProductCategory, ProductSubCategory,
    VoucherProduct, VoucherCategory, VoucherUsage,
    sequelize
} from '../models-sequelize/index.js';

class DatabaseMigration {
    constructor() {
        // Map MongoDB ObjectIds to PostgreSQL UUIDs
        this.idMap = new Map();
        
        // Migration statistics
        this.stats = {
            categories: 0,
            subCategories: 0,
            products: 0,
            productOptions: 0,
            productCategories: 0,
            productSubCategories: 0,
            tables: 0,
            users: 0,
            customers: 0,
            vouchers: 0,
            voucherProducts: 0,
            voucherCategories: 0,
            bookings: 0,
            tableOrders: 0,
            orderItems: 0,
            payments: 0,
            voucherUsages: 0,
            serviceRequests: 0,
            supportChats: 0,
            supportChatMessages: 0
        };
        
        this.startTime = Date.now();
    }

    /**
     * Map MongoDB ObjectId to PostgreSQL UUID
     * Maintains consistent mapping throughout migration
     */
    mapId(objectId) {
        if (!objectId) return null;
        
        const key = objectId.toString();
        if (!this.idMap.has(key)) {
            this.idMap.set(key, uuidv4());
        }
        return this.idMap.get(key);
    }

    /**
     * Log progress with timestamp
     */
    log(message) {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
        console.log(`[${elapsed}s] ${message}`);
    }

    /**
     * Migrate Categories
     */
    async migrateCategories(transaction) {
        this.log('Migrating categories...');
        
        const mongoCategories = await CategoryModel.find({});
        
        for (const cat of mongoCategories) {
            const uuid = this.mapId(cat._id);
            
            await Category.create({
                id: uuid,
                name: cat.name,
                image: cat.image,
                isDeleted: cat.is_deleted || false,
                deletedAt: cat.deleted_at || null,
                createdAt: cat.createdAt,
                updatedAt: cat.updatedAt
            }, { transaction });
            
            this.stats.categories++;
        }
        
        this.log(`✓ Migrated ${this.stats.categories} categories`);
    }

    /**
     * Migrate SubCategories
     */
    async migrateSubCategories(transaction) {
        this.log('Migrating sub-categories...');
        
        const mongoSubCategories = await SubCategoryModel.find({});
        
        for (const subCat of mongoSubCategories) {
            const uuid = this.mapId(subCat._id);
            const categoryId = this.mapId(subCat.category);
            
            await SubCategory.create({
                id: uuid,
                name: subCat.name,
                categoryId: categoryId,
                createdAt: subCat.createdAt,
                updatedAt: subCat.updatedAt
            }, { transaction });
            
            this.stats.subCategories++;
        }
        
        this.log(`✓ Migrated ${this.stats.subCategories} sub-categories`);
    }

    /**
     * Migrate Products
     */
    async migrateProducts(transaction) {
        this.log('Migrating products...');
        
        const mongoProducts = await ProductModel.find({});
        
        for (const prod of mongoProducts) {
            const uuid = this.mapId(prod._id);
            
            await Product.create({
                id: uuid,
                name: prod.name,
                description: prod.description,
                price: prod.price,
                image: prod.image || [],
                status: prod.status,
                isFeatured: prod.is_featured || false,
                moreDetails: prod.more_details || {},
                createdAt: prod.createdAt,
                updatedAt: prod.updatedAt
            }, { transaction });
            
            this.stats.products++;
        }
        
        this.log(`✓ Migrated ${this.stats.products} products`);
    }

    /**
     * Migrate Product Options (normalize from embedded array)
     */
    async migrateProductOptions(transaction) {
        this.log('Migrating product options...');
        
        const mongoProducts = await ProductModel.find({ options: { $exists: true, $ne: [] } });
        
        for (const prod of mongoProducts) {
            const productId = this.mapId(prod._id);
            
            if (prod.options && Array.isArray(prod.options)) {
                for (const option of prod.options) {
                    await ProductOption.create({
                        id: uuidv4(),
                        productId: productId,
                        name: option.name,
                        choices: option.choices || [],
                        createdAt: prod.createdAt,
                        updatedAt: prod.updatedAt
                    }, { transaction });
                    
                    this.stats.productOptions++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.productOptions} product options`);
    }

    /**
     * Migrate Product-Category relationships (many-to-many)
     */
    async migrateProductCategories(transaction) {
        this.log('Migrating product-category relationships...');
        
        const mongoProducts = await ProductModel.find({ category: { $exists: true, $ne: [] } });
        
        for (const prod of mongoProducts) {
            const productId = this.mapId(prod._id);
            
            if (prod.category && Array.isArray(prod.category)) {
                for (const catId of prod.category) {
                    const categoryId = this.mapId(catId);
                    
                    await ProductCategory.create({
                        productId: productId,
                        categoryId: categoryId
                    }, { transaction });
                    
                    this.stats.productCategories++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.productCategories} product-category relationships`);
    }

    /**
     * Migrate Product-SubCategory relationships (many-to-many)
     */
    async migrateProductSubCategories(transaction) {
        this.log('Migrating product-subcategory relationships...');
        
        const mongoProducts = await ProductModel.find({ subCategory: { $exists: true, $ne: [] } });
        
        for (const prod of mongoProducts) {
            const productId = this.mapId(prod._id);
            
            if (prod.subCategory && Array.isArray(prod.subCategory)) {
                for (const subCatId of prod.subCategory) {
                    const subCategoryId = this.mapId(subCatId);
                    
                    await ProductSubCategory.create({
                        productId: productId,
                        subCategoryId: subCategoryId
                    }, { transaction });
                    
                    this.stats.productSubCategories++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.productSubCategories} product-subcategory relationships`);
    }

    /**
     * Migrate Tables
     */
    async migrateTables(transaction) {
        this.log('Migrating tables...');
        
        const mongoTables = await TableModel.find({});
        
        for (const table of mongoTables) {
            const uuid = this.mapId(table._id);
            const tableAccountId = table.table_account_id ? this.mapId(table.table_account_id) : null;
            
            await Table.create({
                id: uuid,
                tableNumber: table.table_number,
                capacity: table.capacity,
                status: table.status,
                location: table.location,
                qrCode: table.qr_code,
                isActive: table.is_active !== false,
                tableAccountId: tableAccountId,
                createdAt: table.createdAt,
                updatedAt: table.updatedAt
            }, { transaction });
            
            this.stats.tables++;
        }
        
        this.log(`✓ Migrated ${this.stats.tables} tables`);
    }

    /**
     * Migrate Users
     */
    async migrateUsers(transaction) {
        this.log('Migrating users...');
        
        const mongoUsers = await UserModel.find({});
        
        for (const user of mongoUsers) {
            const uuid = this.mapId(user._id);
            
            await User.create({
                id: uuid,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                rewardsPoint: user.rewards_point || 0,
                tierLevel: user.tier_level || 'bronze',
                employeeId: user.employee_id,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }, { transaction });
            
            this.stats.users++;
        }
        
        this.log(`✓ Migrated ${this.stats.users} users`);
    }

    /**
     * Migrate Customers
     */
    async migrateCustomers(transaction) {
        this.log('Migrating customers...');
        
        const mongoCustomers = await CustomerModel.find({});
        
        for (const customer of mongoCustomers) {
            const uuid = this.mapId(customer._id);
            
            await Customer.create({
                id: uuid,
                name: customer.name,
                phone: customer.phone,
                totalPoints: customer.total_points || 0,
                visitCount: customer.visit_count || 0,
                lastVisit: customer.last_visit,
                createdAt: customer.createdAt,
                updatedAt: customer.updatedAt
            }, { transaction });
            
            this.stats.customers++;
        }
        
        this.log(`✓ Migrated ${this.stats.customers} customers`);
    }

    /**
     * Migrate Vouchers
     */
    async migrateVouchers(transaction) {
        this.log('Migrating vouchers...');
        
        const mongoVouchers = await VoucherModel.find({});
        
        for (const voucher of mongoVouchers) {
            const uuid = this.mapId(voucher._id);
            
            await Voucher.create({
                id: uuid,
                code: voucher.code,
                description: voucher.description,
                discountType: voucher.discount_type,
                discountValue: voucher.discount_value,
                minOrderValue: voucher.min_order_value,
                maxDiscount: voucher.max_discount,
                startDate: voucher.start_date,
                endDate: voucher.end_date,
                usageLimit: voucher.usage_limit,
                usageCount: voucher.usage_count || 0,
                isActive: voucher.is_active !== false,
                createdAt: voucher.createdAt,
                updatedAt: voucher.updatedAt
            }, { transaction });
            
            this.stats.vouchers++;
        }
        
        this.log(`✓ Migrated ${this.stats.vouchers} vouchers`);
    }

    /**
     * Migrate Voucher-Product relationships (many-to-many)
     */
    async migrateVoucherProducts(transaction) {
        this.log('Migrating voucher-product relationships...');
        
        const mongoVouchers = await VoucherModel.find({ applicable_products: { $exists: true, $ne: [] } });
        
        for (const voucher of mongoVouchers) {
            const voucherId = this.mapId(voucher._id);
            
            if (voucher.applicable_products && Array.isArray(voucher.applicable_products)) {
                for (const prodId of voucher.applicable_products) {
                    const productId = this.mapId(prodId);
                    
                    await VoucherProduct.create({
                        voucherId: voucherId,
                        productId: productId
                    }, { transaction });
                    
                    this.stats.voucherProducts++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.voucherProducts} voucher-product relationships`);
    }

    /**
     * Migrate Voucher-Category relationships (many-to-many)
     */
    async migrateVoucherCategories(transaction) {
        this.log('Migrating voucher-category relationships...');
        
        const mongoVouchers = await VoucherModel.find({ applicable_categories: { $exists: true, $ne: [] } });
        
        for (const voucher of mongoVouchers) {
            const voucherId = this.mapId(voucher._id);
            
            if (voucher.applicable_categories && Array.isArray(voucher.applicable_categories)) {
                for (const catId of voucher.applicable_categories) {
                    const categoryId = this.mapId(catId);
                    
                    await VoucherCategory.create({
                        voucherId: voucherId,
                        categoryId: categoryId
                    }, { transaction });
                    
                    this.stats.voucherCategories++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.voucherCategories} voucher-category relationships`);
    }

    /**
     * Migrate Bookings
     */
    async migrateBookings(transaction) {
        this.log('Migrating bookings...');
        
        const mongoBookings = await BookingModel.find({});
        
        for (const booking of mongoBookings) {
            const uuid = this.mapId(booking._id);
            const tableId = booking.table_id ? this.mapId(booking.table_id) : null;
            const userId = booking.user_id ? this.mapId(booking.user_id) : null;
            const preOrderId = booking.pre_order_id ? this.mapId(booking.pre_order_id) : null;
            
            await Booking.create({
                id: uuid,
                customerName: booking.customer_name,
                phone: booking.phone,
                email: booking.email,
                numberOfGuests: booking.number_of_guests,
                bookingDate: booking.booking_date,
                bookingTime: booking.booking_time,
                specialRequests: booking.special_requests,
                status: booking.status,
                tableId: tableId,
                userId: userId,
                hasPreOrder: booking.has_pre_order || false,
                preOrderId: preOrderId,
                preOrderTotal: booking.pre_order_total,
                createdAt: booking.createdAt,
                updatedAt: booking.updatedAt
            }, { transaction });
            
            this.stats.bookings++;
        }
        
        this.log(`✓ Migrated ${this.stats.bookings} bookings`);
    }

    /**
     * Migrate Table Orders
     */
    async migrateTableOrders(transaction) {
        this.log('Migrating table orders...');
        
        const mongoOrders = await TableOrderModel.find({});
        
        for (const order of mongoOrders) {
            const uuid = this.mapId(order._id);
            const tableId = order.table_id ? this.mapId(order.table_id) : null;
            const customerId = order.customer_id ? this.mapId(order.customer_id) : null;
            const voucherId = order.voucher_id ? this.mapId(order.voucher_id) : null;
            const paymentId = order.payment_id ? this.mapId(order.payment_id) : null;
            
            await TableOrder.create({
                id: uuid,
                tableId: tableId,
                tableNumber: order.table_number,
                customerId: customerId,
                subTotal: order.sub_total,
                discount: order.discount || 0,
                total: order.total,
                status: order.status,
                voucherId: voucherId,
                paymentMethod: order.payment_method,
                paymentStatus: order.payment_status,
                paidAt: order.paid_at,
                paymentId: paymentId,
                stripeSessionId: order.stripe_session_id,
                billChangedAfterPayment: order.bill_changed_after_payment || false,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt
            }, { transaction });
            
            this.stats.tableOrders++;
        }
        
        this.log(`✓ Migrated ${this.stats.tableOrders} table orders`);
    }

    /**
     * Migrate Order Items (normalize from embedded array)
     */
    async migrateOrderItems(transaction) {
        this.log('Migrating order items...');
        
        const mongoOrders = await TableOrderModel.find({ items: { $exists: true, $ne: [] } });
        
        for (const order of mongoOrders) {
            const tableOrderId = this.mapId(order._id);
            
            if (order.items && Array.isArray(order.items)) {
                for (const item of order.items) {
                    const productId = item.product_id ? this.mapId(item.product_id) : null;
                    
                    await OrderItem.create({
                        id: uuidv4(),
                        tableOrderId: tableOrderId,
                        productId: productId,
                        productName: item.product_name,
                        quantity: item.quantity,
                        price: item.price,
                        subtotal: item.subtotal,
                        selectedOptions: item.selected_options || {},
                        kitchenStatus: item.kitchen_status || 'pending',
                        sentAt: item.sent_at,
                        cookingStartAt: item.cooking_start_at,
                        readyAt: item.ready_at,
                        servedAt: item.served_at,
                        createdAt: order.createdAt,
                        updatedAt: order.updatedAt
                    }, { transaction });
                    
                    this.stats.orderItems++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.orderItems} order items`);
    }

    /**
     * Migrate Payments
     */
    async migratePayments(transaction) {
        this.log('Migrating payments...');
        
        const mongoPayments = await PaymentModel.find({});
        
        for (const payment of mongoPayments) {
            const uuid = this.mapId(payment._id);
            const userId = payment.user_id ? this.mapId(payment.user_id) : null;
            const tableOrderId = payment.table_order_id ? this.mapId(payment.table_order_id) : null;
            
            await Payment.create({
                id: uuid,
                userId: userId,
                tableOrderId: tableOrderId,
                amount: payment.amount,
                paymentMethod: payment.payment_method,
                status: payment.status,
                stripePaymentIntentId: payment.stripe_payment_intent_id,
                stripeSessionId: payment.stripe_session_id,
                stripeCustomerId: payment.stripe_customer_id,
                refundStatus: payment.refund_status,
                refundAmount: payment.refund_amount,
                refundReason: payment.refund_reason,
                refundDetails: payment.refund_details || {},
                retryCount: payment.retry_count || 0,
                lastRetryAt: payment.last_retry_at,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt
            }, { transaction });
            
            this.stats.payments++;
        }
        
        this.log(`✓ Migrated ${this.stats.payments} payments`);
    }

    /**
     * Migrate Voucher Usage (many-to-many with users)
     */
    async migrateVoucherUsages(transaction) {
        this.log('Migrating voucher usages...');
        
        // This requires tracking which users used which vouchers
        // If this data exists in MongoDB, migrate it here
        // Otherwise, this can be populated from table_orders that have voucher_id
        
        const mongoOrders = await TableOrderModel.find({ 
            voucher_id: { $exists: true, $ne: null },
            customer_id: { $exists: true, $ne: null }
        });
        
        const usageMap = new Map(); // Track unique voucher-user pairs
        
        for (const order of mongoOrders) {
            const voucherId = this.mapId(order.voucher_id);
            const userId = this.mapId(order.customer_id);
            const key = `${voucherId}-${userId}`;
            
            if (!usageMap.has(key)) {
                await VoucherUsage.create({
                    voucherId: voucherId,
                    userId: userId,
                    usedAt: order.createdAt
                }, { transaction });
                
                usageMap.set(key, true);
                this.stats.voucherUsages++;
            }
        }
        
        this.log(`✓ Migrated ${this.stats.voucherUsages} voucher usages`);
    }

    /**
     * Migrate Service Requests
     */
    async migrateServiceRequests(transaction) {
        this.log('Migrating service requests...');
        
        const mongoRequests = await ServiceRequestModel.find({});
        
        for (const request of mongoRequests) {
            const uuid = this.mapId(request._id);
            const tableId = request.table_id ? this.mapId(request.table_id) : null;
            const tableOrderId = request.table_order_id ? this.mapId(request.table_order_id) : null;
            const handledBy = request.handled_by ? this.mapId(request.handled_by) : null;
            
            await ServiceRequest.create({
                id: uuid,
                tableId: tableId,
                tableOrderId: tableOrderId,
                type: request.type,
                note: request.note,
                status: request.status,
                handledBy: handledBy,
                handledAt: request.handled_at,
                createdAt: request.createdAt,
                updatedAt: request.updatedAt
            }, { transaction });
            
            this.stats.serviceRequests++;
        }
        
        this.log(`✓ Migrated ${this.stats.serviceRequests} service requests`);
    }

    /**
     * Migrate Support Chats
     */
    async migrateSupportChats(transaction) {
        this.log('Migrating support chats...');
        
        const mongoChats = await SupportChatModel.find({});
        
        for (const chat of mongoChats) {
            const uuid = this.mapId(chat._id);
            const assignedWaiterId = chat.assigned_waiter_id ? this.mapId(chat.assigned_waiter_id) : null;
            
            await SupportChat.create({
                id: uuid,
                conversationId: chat.conversation_id,
                customerName: chat.customer_name,
                customerId: chat.customer_id,
                tableNumber: chat.table_number,
                requestStatus: chat.request_status,
                status: chat.status,
                assignedWaiterId: assignedWaiterId,
                assignedWaiterName: chat.assigned_waiter_name,
                unreadByCustomer: chat.unread_by_customer || 0,
                unreadByWaiter: chat.unread_by_waiter || 0,
                lastMessage: chat.last_message,
                lastMessageAt: chat.last_message_at,
                expiresAt: chat.expires_at,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt
            }, { transaction });
            
            this.stats.supportChats++;
        }
        
        this.log(`✓ Migrated ${this.stats.supportChats} support chats`);
    }

    /**
     * Migrate Support Chat Messages
     */
    async migrateSupportChatMessages(transaction) {
        this.log('Migrating support chat messages...');
        
        // Assuming messages are embedded in SupportChat or in a separate collection
        const mongoChats = await SupportChatModel.find({ messages: { $exists: true, $ne: [] } });
        
        for (const chat of mongoChats) {
            const supportChatId = this.mapId(chat._id);
            
            if (chat.messages && Array.isArray(chat.messages)) {
                for (const message of chat.messages) {
                    await SupportChatMessage.create({
                        id: uuidv4(),
                        supportChatId: supportChatId,
                        sender: message.sender,
                        message: message.message,
                        timestamp: message.timestamp || message.createdAt,
                        createdAt: message.createdAt || message.timestamp,
                        updatedAt: message.updatedAt || message.timestamp
                    }, { transaction });
                    
                    this.stats.supportChatMessages++;
                }
            }
        }
        
        this.log(`✓ Migrated ${this.stats.supportChatMessages} support chat messages`);
    }

    /**
     * Verify Data Integrity
     */
    async verifyDataIntegrity() {
        this.log('Verifying data integrity...');
        
        const checks = [];
        
        // Check row counts
        checks.push({
            name: 'Categories',
            mongo: await CategoryModel.countDocuments(),
            postgres: await Category.count()
        });
        
        checks.push({
            name: 'SubCategories',
            mongo: await SubCategoryModel.countDocuments(),
            postgres: await SubCategory.count()
        });
        
        checks.push({
            name: 'Products',
            mongo: await ProductModel.countDocuments(),
            postgres: await Product.count()
        });
        
        checks.push({
            name: 'Tables',
            mongo: await TableModel.countDocuments(),
            postgres: await Table.count()
        });
        
        checks.push({
            name: 'Users',
            mongo: await UserModel.countDocuments(),
            postgres: await User.count()
        });
        
        checks.push({
            name: 'Customers',
            mongo: await CustomerModel.countDocuments(),
            postgres: await Customer.count()
        });
        
        checks.push({
            name: 'Vouchers',
            mongo: await VoucherModel.countDocuments(),
            postgres: await Voucher.count()
        });
        
        checks.push({
            name: 'Bookings',
            mongo: await BookingModel.countDocuments(),
            postgres: await Booking.count()
        });
        
        checks.push({
            name: 'TableOrders',
            mongo: await TableOrderModel.countDocuments(),
            postgres: await TableOrder.count()
        });
        
        checks.push({
            name: 'Payments',
            mongo: await PaymentModel.countDocuments(),
            postgres: await Payment.count()
        });
        
        checks.push({
            name: 'ServiceRequests',
            mongo: await ServiceRequestModel.countDocuments(),
            postgres: await ServiceRequest.count()
        });
        
        checks.push({
            name: 'SupportChats',
            mongo: await SupportChatModel.countDocuments(),
            postgres: await SupportChat.count()
        });
        
        // Display results
        console.log('\n=== Data Integrity Verification ===');
        let allMatch = true;
        
        for (const check of checks) {
            const match = check.mongo === check.postgres;
            const status = match ? '✓' : '✗';
            console.log(`${status} ${check.name}: MongoDB=${check.mongo}, PostgreSQL=${check.postgres}`);
            if (!match) allMatch = false;
        }
        
        if (allMatch) {
            this.log('✓ All record counts match!');
        } else {
            this.log('✗ Some record counts do not match. Please investigate.');
        }
        
        // Check for orphaned foreign keys
        this.log('Checking for orphaned foreign keys...');
        
        const orphanedOrderItems = await OrderItem.count({
            where: {
                tableOrderId: {
                    [Sequelize.Op.notIn]: Sequelize.literal('(SELECT id FROM table_orders)')
                }
            }
        });
        
        if (orphanedOrderItems > 0) {
            console.log(`✗ Found ${orphanedOrderItems} orphaned order items`);
            allMatch = false;
        } else {
            console.log('✓ No orphaned order items');
        }
        
        return allMatch;
    }

    /**
     * Print Migration Statistics
     */
    printStats() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
        
        console.log('\n=== Migration Statistics ===');
        console.log(`Categories:              ${this.stats.categories}`);
        console.log(`SubCategories:           ${this.stats.subCategories}`);
        console.log(`Products:                ${this.stats.products}`);
        console.log(`Product Options:         ${this.stats.productOptions}`);
        console.log(`Product-Categories:      ${this.stats.productCategories}`);
        console.log(`Product-SubCategories:   ${this.stats.productSubCategories}`);
        console.log(`Tables:                  ${this.stats.tables}`);
        console.log(`Users:                   ${this.stats.users}`);
        console.log(`Customers:               ${this.stats.customers}`);
        console.log(`Vouchers:                ${this.stats.vouchers}`);
        console.log(`Voucher-Products:        ${this.stats.voucherProducts}`);
        console.log(`Voucher-Categories:      ${this.stats.voucherCategories}`);
        console.log(`Bookings:                ${this.stats.bookings}`);
        console.log(`Table Orders:            ${this.stats.tableOrders}`);
        console.log(`Order Items:             ${this.stats.orderItems}`);
        console.log(`Payments:                ${this.stats.payments}`);
        console.log(`Voucher Usages:          ${this.stats.voucherUsages}`);
        console.log(`Service Requests:        ${this.stats.serviceRequests}`);
        console.log(`Support Chats:           ${this.stats.supportChats}`);
        console.log(`Support Chat Messages:   ${this.stats.supportChatMessages}`);
        console.log(`\nTotal Time: ${elapsed}s`);
    }

    /**
     * Execute Full Migration
     */
    async migrate() {
        console.log('=== Starting MongoDB to PostgreSQL Migration ===\n');
        
        const transaction = await sequelize.transaction();
        
        try {
            // Execute migrations in order to maintain referential integrity
            await this.migrateCategories(transaction);
            await this.migrateSubCategories(transaction);
            await this.migrateProducts(transaction);
            await this.migrateProductOptions(transaction);
            await this.migrateProductCategories(transaction);
            await this.migrateProductSubCategories(transaction);
            await this.migrateTables(transaction);
            await this.migrateUsers(transaction);
            await this.migrateCustomers(transaction);
            await this.migrateVouchers(transaction);
            await this.migrateVoucherProducts(transaction);
            await this.migrateVoucherCategories(transaction);
            await this.migrateBookings(transaction);
            await this.migrateTableOrders(transaction);
            await this.migrateOrderItems(transaction);
            await this.migratePayments(transaction);
            await this.migrateVoucherUsages(transaction);
            await this.migrateServiceRequests(transaction);
            await this.migrateSupportChats(transaction);
            await this.migrateSupportChatMessages(transaction);
            
            // Commit transaction
            await transaction.commit();
            this.log('✓ Transaction committed successfully');
            
            // Print statistics
            this.printStats();
            
            // Verify data integrity
            const integrityOk = await this.verifyDataIntegrity();
            
            if (integrityOk) {
                console.log('\n✅ Migration completed successfully!');
                return true;
            } else {
                console.log('\n⚠️  Migration completed with warnings. Please review integrity checks.');
                return false;
            }
            
        } catch (error) {
            await transaction.rollback();
            this.log('✗ Transaction rolled back due to error');
            console.error('\n❌ Migration failed:', error);
            throw error;
        }
    }
}

/**
 * Main Execution
 */
async function main() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/xrestaurant');
        console.log('✓ Connected to MongoDB');
        
        // Connect to PostgreSQL
        console.log('Connecting to PostgreSQL...');
        await initializeDatabase();
        console.log('✓ Connected to PostgreSQL');
        
        // Run migration
        const migration = new DatabaseMigration();
        const success = await migration.migrate();
        
        // Close connections
        await mongoose.connection.close();
        await closeDatabase();
        
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default DatabaseMigration;
