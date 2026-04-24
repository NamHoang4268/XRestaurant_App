/**
 * Sequelize Models Index
 * 
 * This file exports all Sequelize models for the PostgreSQL migration.
 * Models are initialized using factory functions to avoid circular dependency issues.
 * 
 * Usage:
 *   import { initializeModels } from './models-sequelize/index.js';
 *   const models = initializeModels(sequelize);
 */

import { initUserModel } from './user.model.js';
import { initCustomerModel } from './customer.model.js';
import { initCategoryModel } from './category.model.js';
import { initSubCategoryModel } from './subCategory.model.js';
import { initProductModel } from './product.model.js';
import { initProductOptionModel } from './productOption.model.js';
import { initTableModel } from './table.model.js';
import { initTableOrderModel } from './tableOrder.model.js';
import { initOrderItemModel } from './orderItem.model.js';
import { initBookingModel } from './booking.model.js';
import { initVoucherModel } from './voucher.model.js';
import { initPaymentModel } from './payment.model.js';
import { initServiceRequestModel } from './serviceRequest.model.js';
import { initSupportChatModel } from './supportChat.model.js';
import { initSupportChatMessageModel } from './supportChatMessage.model.js';

// Junction table model factory functions
import { initProductCategoryModel } from './productCategory.model.js';
import { initProductSubCategoryModel } from './productSubCategory.model.js';
import { initVoucherProductModel } from './voucherProduct.model.js';
import { initVoucherCategoryModel } from './voucherCategory.model.js';
import { initVoucherUsageModel } from './voucherUsage.model.js';

/**
 * Initialize all models with the given sequelize instance
 * @param {Sequelize} sequelize - The sequelize instance
 * @returns {Object} Object containing all initialized models
 */
export function initializeModels(sequelize) {
    const User = initUserModel(sequelize);
    const Customer = initCustomerModel(sequelize);
    const Category = initCategoryModel(sequelize);
    const SubCategory = initSubCategoryModel(sequelize);
    const Product = initProductModel(sequelize);
    const ProductOption = initProductOptionModel(sequelize);
    const Table = initTableModel(sequelize);
    const TableOrder = initTableOrderModel(sequelize);
    const OrderItem = initOrderItemModel(sequelize);
    const Booking = initBookingModel(sequelize);
    const Voucher = initVoucherModel(sequelize);
    const Payment = initPaymentModel(sequelize);
    const ServiceRequest = initServiceRequestModel(sequelize);
    const SupportChat = initSupportChatModel(sequelize);
    const SupportChatMessage = initSupportChatMessageModel(sequelize);
    
    // Junction table models
    const ProductCategory = initProductCategoryModel(sequelize);
    const ProductSubCategory = initProductSubCategoryModel(sequelize);
    const VoucherProduct = initVoucherProductModel(sequelize);
    const VoucherCategory = initVoucherCategoryModel(sequelize);
    const VoucherUsage = initVoucherUsageModel(sequelize);
    
    return {
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
}
