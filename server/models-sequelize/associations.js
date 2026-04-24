/**
 * Sequelize Model Associations
 * 
 * This file defines all relationships between models.
 * Call this function after all models are initialized to establish associations.
 * 
 * Association Types:
 * - hasMany: One-to-Many relationship
 * - belongsTo: Many-to-One relationship (inverse of hasMany)
 * - belongsToMany: Many-to-Many relationship (requires junction table)
 * - hasOne: One-to-One relationship
 */

/**
 * Define all model associations
 * @param {Object} models - Object containing all initialized models
 */
export function defineAssociations(models) {
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
        SupportChatMessage,
        ProductCategory,
        ProductSubCategory,
        VoucherProduct,
        VoucherCategory,
        VoucherUsage
    } = models;

    // ============================================
    // User Associations
    // ============================================
    
    // User has many TableOrders
    User.hasMany(TableOrder, { 
        foreignKey: 'userId', 
        as: 'orders' 
    });
    TableOrder.belongsTo(User, { 
        foreignKey: 'userId', 
        as: 'user' 
    });
    
    // User has many Bookings
    User.hasMany(Booking, { 
        foreignKey: 'userId', 
        as: 'bookings' 
    });
    Booking.belongsTo(User, { 
        foreignKey: 'userId', 
        as: 'user' 
    });
    
    // User has one linked Table (for TABLE role users)
    User.hasOne(Table, { 
        foreignKey: 'tableAccountId', 
        as: 'linkedTable' 
    });
    Table.belongsTo(User, { 
        foreignKey: 'tableAccountId', 
        as: 'tableAccount' 
    });
    
    // User has many Payments
    User.hasMany(Payment, { 
        foreignKey: 'userId', 
        as: 'payments' 
    });
    Payment.belongsTo(User, { 
        foreignKey: 'userId', 
        as: 'user' 
    });
    
    // User handles many ServiceRequests
    User.hasMany(ServiceRequest, { 
        foreignKey: 'handledBy', 
        as: 'handledRequests' 
    });
    ServiceRequest.belongsTo(User, { 
        foreignKey: 'handledBy', 
        as: 'handler' 
    });
    
    // ============================================
    // Product Associations
    // ============================================
    
    // Product belongs to many Categories (through product_categories)
    Product.belongsToMany(Category, { 
        through: ProductCategory,
        foreignKey: 'product_id',
        otherKey: 'category_id',
        as: 'categories'
    });
    Category.belongsToMany(Product, { 
        through: ProductCategory,
        foreignKey: 'category_id',
        otherKey: 'product_id',
        as: 'products'
    });
    
    // Product belongs to many SubCategories (through product_sub_categories)
    Product.belongsToMany(SubCategory, { 
        through: ProductSubCategory,
        foreignKey: 'product_id',
        otherKey: 'sub_category_id',
        as: 'subCategories'
    });
    SubCategory.belongsToMany(Product, { 
        through: ProductSubCategory,
        foreignKey: 'sub_category_id',
        otherKey: 'product_id',
        as: 'products'
    });
    
    // Product has many ProductOptions
    Product.hasMany(ProductOption, { 
        foreignKey: 'productId', 
        as: 'options' 
    });
    ProductOption.belongsTo(Product, { 
        foreignKey: 'productId', 
        as: 'product' 
    });
    
    // Product has many OrderItems
    Product.hasMany(OrderItem, { 
        foreignKey: 'productId', 
        as: 'orderItems' 
    });
    OrderItem.belongsTo(Product, { 
        foreignKey: 'productId', 
        as: 'product' 
    });
    
    // ============================================
    // TableOrder Associations
    // ============================================
    
    // TableOrder belongs to Table
    TableOrder.belongsTo(Table, { 
        foreignKey: 'tableId', 
        as: 'table' 
    });
    Table.hasMany(TableOrder, { 
        foreignKey: 'tableId', 
        as: 'orders' 
    });
    
    // TableOrder belongs to Customer
    TableOrder.belongsTo(Customer, { 
        foreignKey: 'customerId', 
        as: 'customer' 
    });
    Customer.hasMany(TableOrder, { 
        foreignKey: 'customerId', 
        as: 'orders' 
    });
    
    // TableOrder belongs to Voucher
    TableOrder.belongsTo(Voucher, { 
        foreignKey: 'voucherId', 
        as: 'voucher' 
    });
    Voucher.hasMany(TableOrder, { 
        foreignKey: 'voucherId', 
        as: 'orders' 
    });
    
    // TableOrder belongs to Payment
    TableOrder.belongsTo(Payment, { 
        foreignKey: 'paymentId', 
        as: 'payment' 
    });
    Payment.hasOne(TableOrder, { 
        foreignKey: 'paymentId', 
        as: 'order' 
    });
    
    // TableOrder has many OrderItems
    TableOrder.hasMany(OrderItem, { 
        foreignKey: 'tableOrderId', 
        as: 'items' 
    });
    OrderItem.belongsTo(TableOrder, { 
        foreignKey: 'tableOrderId', 
        as: 'order' 
    });
    
    // TableOrder has many ServiceRequests
    TableOrder.hasMany(ServiceRequest, { 
        foreignKey: 'tableOrderId', 
        as: 'serviceRequests' 
    });
    ServiceRequest.belongsTo(TableOrder, { 
        foreignKey: 'tableOrderId', 
        as: 'order' 
    });
    
    // ============================================
    // Voucher Associations
    // ============================================
    
    // Voucher belongs to many Products (through voucher_products)
    Voucher.belongsToMany(Product, {
        through: VoucherProduct,
        foreignKey: 'voucher_id',
        otherKey: 'product_id',
        as: 'products'
    });
    Product.belongsToMany(Voucher, {
        through: VoucherProduct,
        foreignKey: 'product_id',
        otherKey: 'voucher_id',
        as: 'vouchers'
    });
    
    // Voucher belongs to many Categories (through voucher_categories)
    Voucher.belongsToMany(Category, {
        through: VoucherCategory,
        foreignKey: 'voucher_id',
        otherKey: 'category_id',
        as: 'categories'
    });
    Category.belongsToMany(Voucher, {
        through: VoucherCategory,
        foreignKey: 'category_id',
        otherKey: 'voucher_id',
        as: 'vouchers'
    });
    
    // Voucher belongs to many Users (through voucher_usage)
    Voucher.belongsToMany(User, {
        through: VoucherUsage,
        foreignKey: 'voucher_id',
        otherKey: 'user_id',
        as: 'usersUsed'
    });
    User.belongsToMany(Voucher, {
        through: VoucherUsage,
        foreignKey: 'user_id',
        otherKey: 'voucher_id',
        as: 'usedVouchers'
    });
    
    // ============================================
    // SupportChat Associations
    // ============================================
    
    // SupportChat has many SupportChatMessages
    SupportChat.hasMany(SupportChatMessage, { 
        foreignKey: 'supportChatId', 
        as: 'messages' 
    });
    SupportChatMessage.belongsTo(SupportChat, { 
        foreignKey: 'supportChatId', 
        as: 'chat' 
    });
    
    // ============================================
    // Table Associations
    // ============================================
    
    // Table has many Bookings
    Table.hasMany(Booking, { 
        foreignKey: 'tableId', 
        as: 'bookings' 
    });
    Booking.belongsTo(Table, { 
        foreignKey: 'tableId', 
        as: 'table' 
    });
    
    // Table has many ServiceRequests
    Table.hasMany(ServiceRequest, { 
        foreignKey: 'tableId', 
        as: 'serviceRequests' 
    });
    ServiceRequest.belongsTo(Table, { 
        foreignKey: 'tableId', 
        as: 'table' 
    });
    
    // ============================================
    // Booking Associations
    // ============================================
    
    // Booking can have a pre-order (TableOrder)
    Booking.belongsTo(TableOrder, { 
        foreignKey: 'preOrderId', 
        as: 'preOrder' 
    });
    
    console.log('✅ Model associations defined successfully');
}

export default defineAssociations;
