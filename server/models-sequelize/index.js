/**
 * Sequelize Models Index
 * 
 * This file exports all Sequelize models for the PostgreSQL migration.
 * Models are defined with associations configured via associations.js.
 * 
 * Usage:
 *   import { User, Customer, Product, ... } from './models-sequelize/index.js';
 */

import User from './user.model.js';
import Customer from './customer.model.js';
import Category from './category.model.js';
import SubCategory from './subCategory.model.js';
import Product from './product.model.js';
import ProductOption from './productOption.model.js';
import Table from './table.model.js';
import TableOrder from './tableOrder.model.js';
import OrderItem from './orderItem.model.js';
import Booking from './booking.model.js';
import Voucher from './voucher.model.js';
import Payment from './payment.model.js';
import ServiceRequest from './serviceRequest.model.js';
import SupportChat from './supportChat.model.js';
import SupportChatMessage from './supportChatMessage.model.js';

// Junction table models for many-to-many relationships
import ProductCategory from './productCategory.model.js';
import ProductSubCategory from './productSubCategory.model.js';
import VoucherProduct from './voucherProduct.model.js';
import VoucherCategory from './voucherCategory.model.js';
import VoucherUsage from './voucherUsage.model.js';

// Import and define associations
import { defineAssociations } from './associations.js';

// Define all associations between models
defineAssociations();

// Export all models
export {
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
    SupportChatMessage,
    ProductCategory,
    ProductSubCategory,
    VoucherProduct,
    VoucherCategory,
    VoucherUsage
};

// Export as default object for convenience
export default {
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
    SupportChatMessage,
    ProductCategory,
    ProductSubCategory,
    VoucherProduct,
    VoucherCategory,
    VoucherUsage
};
