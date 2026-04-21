import { Voucher, VoucherProduct, VoucherCategory, VoucherUsage, TableOrder, Product, Category } from '../models-sequelize/index.js';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';

// ═══════════════════════════════════════════════════════════════════
// Helper: Check if customer is first-time (no paid orders)
// ═══════════════════════════════════════════════════════════════════
const checkFirstTimeCustomer = async (userId) => {
    if (!userId) return false;
    const orderCount = await TableOrder.count({
        where: {
            customerId: userId,
            paymentStatus: 'paid'
        }
    });
    return orderCount === 0;
};

// ═══════════════════════════════════════════════════════════════════
// Add new voucher
// ═══════════════════════════════════════════════════════════════════
export const addVoucerController = async (req, res) => {
    try {
        const { 
            code, name, description, discountType, discountValue, minOrderValue,
            maxDiscount, startDate, endDate, usageLimit, isActive, isFirstTimeCustomer, 
            applyForAllProducts, products, categories 
        } = req.body;

        // Validate percentage discount
        if (discountType === 'percentage' && !maxDiscount) {
            return res.status(400).json({
                message: "Vui lòng nhập giảm giá tối đa cho loại giảm giá phần trăm",
                error: true,
                success: false
            });
        }

        const existVoucher = await Voucher.findOne({ where: { code } });

        if (existVoucher) {
            return res.status(400).json({
                message: "Mã giảm giá đã tồn tại",
                error: true,
                success: false
            });
        }

        const transaction = await sequelize.transaction();
        try {
            // Create voucher
            const voucherData = {
                code,
                name,
                description,
                discountType,
                discountValue,
                minOrderValue: minOrderValue || 0,
                maxDiscount: discountType === 'percentage' ? maxDiscount : null,
                startDate,
                endDate,
                usageLimit: usageLimit || null,
                isActive: isActive !== undefined ? isActive : true,
                isFirstTimeCustomer: isFirstTimeCustomer || false,
                applyForAllProducts: applyForAllProducts !== undefined ? applyForAllProducts : true
            };

            const voucher = await Voucher.create(voucherData, { transaction });

            // Create product associations if not applying to all products
            if (!applyForAllProducts && products && products.length > 0) {
                const productAssociations = products.map(productId => ({
                    voucherId: voucher.id,
                    productId: productId
                }));
                await VoucherProduct.bulkCreate(productAssociations, { transaction });
            }

            // Create category associations if provided
            if (!applyForAllProducts && categories && categories.length > 0) {
                const categoryAssociations = categories.map(categoryId => ({
                    voucherId: voucher.id,
                    categoryId: categoryId
                }));
                await VoucherCategory.bulkCreate(categoryAssociations, { transaction });
            }

            await transaction.commit();

            // Reload with associations
            await voucher.reload({
                include: [
                    { model: Product, as: 'products', through: { attributes: [] } },
                    { model: Category, as: 'categories', through: { attributes: [] } }
                ]
            });

            return res.json({
                message: "Thêm thành công",
                data: voucher,
                error: false,
                success: true
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Get all vouchers
// ═══════════════════════════════════════════════════════════════════
export const getAllVoucherController = async (req, res) => {
    try {
        const data = await Voucher.findAll({
            include: [
                { model: Product, as: 'products', through: { attributes: [] } },
                { model: Category, as: 'categories', through: { attributes: [] } }
            ],
            order: [['createdAt', 'DESC']]
        });

        return res.json({
            message: 'Danh mục Data',
            data: data,
            error: false,
            success: true
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Update voucher
// ═══════════════════════════════════════════════════════════════════
export const updateVoucherController = async (req, res) => {
    try {
        const { 
            _id, code, name, description, discountType, discountValue, minOrderValue,
            maxDiscount, startDate, endDate, usageLimit, isActive, isFirstTimeCustomer, 
            applyForAllProducts, products, categories 
        } = req.body;

        const voucher = await Voucher.findByPk(_id);

        if (!voucher) {
            return res.status(400).json({
                message: 'Không tìm thấy _id',
                error: true,
                success: false
            });
        }

        const transaction = await sequelize.transaction();
        try {
            // Update voucher
            const updateData = {
                code,
                name,
                description,
                discountType,
                discountValue,
                minOrderValue,
                maxDiscount,
                startDate,
                endDate,
                usageLimit,
                isActive,
                isFirstTimeCustomer: isFirstTimeCustomer || false,
                applyForAllProducts
            };

            await voucher.update(updateData, { transaction });

            // Update product associations
            await VoucherProduct.destroy({ 
                where: { voucherId: voucher.id },
                transaction 
            });

            if (!applyForAllProducts && products && products.length > 0) {
                const productAssociations = products.map(productId => ({
                    voucherId: voucher.id,
                    productId: productId
                }));
                await VoucherProduct.bulkCreate(productAssociations, { transaction });
            }

            // Update category associations
            await VoucherCategory.destroy({ 
                where: { voucherId: voucher.id },
                transaction 
            });

            if (!applyForAllProducts && categories && categories.length > 0) {
                const categoryAssociations = categories.map(categoryId => ({
                    voucherId: voucher.id,
                    categoryId: categoryId
                }));
                await VoucherCategory.bulkCreate(categoryAssociations, { transaction });
            }

            await transaction.commit();

            // Reload with associations
            await voucher.reload({
                include: [
                    { model: Product, as: 'products', through: { attributes: [] } },
                    { model: Category, as: 'categories', through: { attributes: [] } }
                ]
            });

            return res.json({
                message: 'Cập nhật thành công',
                data: voucher,
                error: false,
                success: true
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Delete voucher
// ═══════════════════════════════════════════════════════════════════
export const deleteVoucherController = async (req, res) => {
    try {
        const { _id } = req.body;

        const voucher = await Voucher.findByPk(_id);
        if (!voucher) {
            return res.status(404).json({
                message: 'Không tìm thấy voucher',
                error: true,
                success: false
            });
        }

        await voucher.destroy();

        return res.json({
            message: 'Xóa thành công',
            data: voucher,
            error: false,
            success: true
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Bulk delete vouchers
// ═══════════════════════════════════════════════════════════════════
export const bulkDeleteVouchersController = async (req, res) => {
    try {
        const { voucherIds } = req.body;

        if (!voucherIds || !Array.isArray(voucherIds) || voucherIds.length === 0) {
            return res.status(400).json({
                message: 'Danh sách voucher không hợp lệ',
                error: true,
                success: false
            });
        }

        const deletedCount = await Voucher.destroy({
            where: {
                id: { [Op.in]: voucherIds }
            }
        });

        if (deletedCount === 0) {
            return res.status(404).json({
                message: 'Không tìm thấy mã giảm giá để xóa',
                error: true,
                success: false
            });
        }

        return res.status(200).json({
            message: `Đã xóa thành công ${deletedCount} mã giảm giá`,
            data: { deletedCount },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Lỗi khi xóa hàng loạt mã giảm giá:', error);
        return res.status(500).json({
            message: error.message || 'Đã xảy ra lỗi khi xóa mã giảm giá',
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Bulk update vouchers status
// ═══════════════════════════════════════════════════════════════════
export const bulkUpdateVouchersStatusController = async (req, res) => {
    try {
        const { voucherIds, isActive } = req.body;

        if (!voucherIds || !Array.isArray(voucherIds) || voucherIds.length === 0) {
            return res.status(400).json({
                message: 'Danh sách mã giảm giá không hợp lệ',
                error: true,
                success: false
            });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                message: 'Trạng thái không hợp lệ',
                error: true,
                success: false
            });
        }

        const [updatedCount] = await Voucher.update(
            { isActive },
            {
                where: {
                    id: { [Op.in]: voucherIds }
                }
            }
        );

        if (updatedCount === 0) {
            return res.status(404).json({
                message: 'Không tìm thấy mã giảm giá để cập nhật',
                error: true,
                success: false
            });
        }

        return res.status(200).json({
            message: `Đã cập nhật trạng thái thành công cho ${updatedCount} mã giảm giá`,
            data: {
                matchedCount: updatedCount,
                modifiedCount: updatedCount
            },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái hàng loạt mã giảm giá:', error);
        return res.status(500).json({
            message: error.message || 'Đã xảy ra lỗi khi cập nhật trạng thái mã giảm giá',
            error: true,
            success: false
        });
    }
};


// ═══════════════════════════════════════════════════════════════════
// Get available vouchers for order
// ═══════════════════════════════════════════════════════════════════
export const getAvailableVouchersController = async (req, res) => {
    try {
        const { orderAmount, productIds = [], cartItems = [], userId } = req.body;

        console.log('Received request with:', {
            orderAmount,
            productIds: productIds.length,
            cartItems: cartItems.length,
            userId
        });

        if (orderAmount === undefined || orderAmount === null) {
            return res.status(400).json({
                message: "Vui lòng cung cấp tổng giá trị đơn hàng",
                error: true,
                success: false
            });
        }

        const currentDate = new Date();

        // Calculate actual total
        let actualTotal = 0;
        if (Array.isArray(cartItems) && cartItems.length > 0) {
            actualTotal = parseFloat(orderAmount);
            const calculatedTotal = cartItems.reduce((total, item) => {
                const product = item.productId || {};
                const price = product.discountPrice > 0 && product.discountPrice < product.price
                    ? product.discountPrice
                    : product.price;
                const itemTotal = price * (item.quantity || 1);
                return total + itemTotal;
            }, 0);
            actualTotal = Math.min(actualTotal, calculatedTotal);
        } else {
            actualTotal = parseFloat(orderAmount);
        }

        // Check if user is first time customer
        const isFirstTimer = await checkFirstTimeCustomer(userId);

        // Find all active vouchers
        const vouchers = await Voucher.findAll({
            where: {
                isActive: true,
                endDate: { [Op.gte]: currentDate },
                [Op.or]: [
                    { usageLimit: null },
                    { usageLimit: -1 },
                    { usageLimit: { [Op.gt]: 0 } }
                ]
            },
            include: [
                { model: Product, as: 'products', through: { attributes: [] } }
            ],
            order: [['startDate', 'ASC']]
        });

        // Filter vouchers
        const applicableVouchers = vouchers.filter(voucher => {
            // Check first time customer requirement
            if (voucher.isFirstTimeCustomer) {
                if (!userId || !isFirstTimer) return false;
            }

            // Check min order value
            const meetsMinOrder = actualTotal >= voucher.minOrderValue;
            if (!meetsMinOrder) return false;

            // Check product applicability
            if (voucher.applyForAllProducts) return true;
            if (!voucher.products || voucher.products.length === 0) return true;
            return productIds.some(productId =>
                voucher.products.some(p => p.id === productId)
            );
        });

        // Format response
        const formattedVouchers = applicableVouchers.map(voucher => {
            const now = new Date();
            const isUpcoming = new Date(voucher.startDate) > now;
            const isActive = !isUpcoming && new Date(voucher.endDate) > now;
            const isFreeShipping = voucher.discountType === 'free_shipping' || voucher.isFreeShipping === true;

            return {
                id: voucher.id,
                code: voucher.code,
                name: voucher.name,
                description: voucher.description,
                minOrder: voucher.minOrderValue,
                discount: isFreeShipping ? 0 : voucher.discountValue,
                discountType: voucher.discountType,
                startDate: voucher.startDate,
                expiryDate: new Date(voucher.endDate).toLocaleDateString('vi-VN'),
                isFreeShipping,
                isFirstTimeCustomer: voucher.isFirstTimeCustomer,
                maxDiscount: isFreeShipping ? null : (voucher.maxDiscount || null),
                isActive,
                isUpcoming,
                availableFrom: isUpcoming ? new Date(voucher.startDate).toLocaleDateString('vi-VN') : null,
                discountText: isFreeShipping
                    ? 'Miễn phí vận chuyển'
                    : voucher.discountType === 'percentage'
                        ? `Giảm ${voucher.discountValue}% (Tối đa ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.maxDiscount || 0)})`
                        : `Giảm ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.discountValue || 0)}`
            };
        });

        return res.json({
            message: 'Danh sách voucher khả dụng',
            data: formattedVouchers,
            error: false,
            success: true
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Apply voucher to order
// ═══════════════════════════════════════════════════════════════════
export const applyVoucherController = async (req, res) => {
    try {
        const { code, orderAmount, productIds, userId } = req.body;

        if (!code) {
            return res.status(400).json({
                message: 'Vui lòng nhập mã giảm giá',
                error: true,
                success: false
            });
        }

        const voucher = await Voucher.findOne({ 
            where: { code },
            include: [
                { model: Product, as: 'products', through: { attributes: [] } }
            ]
        });

        if (!voucher) {
            return res.status(404).json({
                message: 'Mã giảm giá không tồn tại',
                error: true,
                success: false
            });
        }

        // Check if voucher is active
        if (!voucher.isActive) {
            return res.status(400).json({
                message: 'Mã giảm giá đã bị vô hiệu hóa',
                error: true,
                success: false
            });
        }

        // Check first time customer requirement
        if (voucher.isFirstTimeCustomer) {
            const isFirstTimer = await checkFirstTimeCustomer(userId);
            if (!isFirstTimer) {
                return res.status(400).json({
                    message: "Mã giảm giá này chỉ dành cho khách hàng mới",
                    error: true,
                    success: false
                });
            }
        }

        // Check voucher validity
        const currentDate = new Date();
        if (voucher.startDate && new Date(voucher.startDate) > currentDate) {
            return res.status(400).json({
                message: 'Mã giảm giá chưa đến thời gian áp dụng',
                error: true,
                success: false
            });
        }

        if (voucher.endDate && new Date(voucher.endDate) < currentDate) {
            return res.status(400).json({
                message: 'Mã giảm giá đã hết hạn',
                error: true,
                success: false
            });
        }

        // Check minimum order value
        if (orderAmount < (voucher.minOrderValue || 0)) {
            return res.status(400).json({
                message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()}đ để áp dụng mã giảm giá này`,
                error: true,
                success: false
            });
        }

        // Check if voucher applies to all products or specific products
        if (!voucher.applyForAllProducts && voucher.products && voucher.products.length > 0) {
            const validProduct = productIds.some(id =>
                voucher.products.some(p => p.id === id)
            );

            if (!validProduct) {
                return res.status(400).json({
                    message: 'Mã giảm giá không áp dụng cho sản phẩm trong đơn hàng',
                    error: true,
                    success: false
                });
            }
        }

        // Check usage limit
        if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
            return res.status(400).json({
                message: 'Mã giảm giá đã hết số lần sử dụng',
                error: true,
                success: false
            });
        }

        // Calculate discount amount
        let discountAmount = 0;
        if (voucher.isFreeShipping) {
            discountAmount = 0;
        } else if (voucher.discountType === 'percentage') {
            const percentageDiscount = (orderAmount * voucher.discountValue) / 100;
            discountAmount = voucher.maxDiscount
                ? Math.min(percentageDiscount, voucher.maxDiscount)
                : percentageDiscount;
        } else if (voucher.discountType === 'fixed') {
            discountAmount = Math.min(voucher.discountValue, orderAmount);
        }

        return res.json({
            message: 'Áp dụng mã giảm giá thành công',
            data: {
                ...voucher.toJSON(),
                calculatedDiscount: discountAmount
            },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error applying voucher:', error);
        return res.status(500).json({
            message: error.message || 'Có lỗi xảy ra khi áp dụng mã giảm giá',
            error: true,
            success: false
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// Get best voucher for maximum savings
// ═══════════════════════════════════════════════════════════════════
export const getBestVoucherController = async (req, res) => {
    try {
        const { orderAmount, productIds = [], cartItems = [], userId } = req.body;

        if (orderAmount === undefined || orderAmount === null) {
            return res.status(400).json({
                message: "Vui lòng cung cấp tổng giá trị đơn hàng",
                error: true,
                success: false
            });
        }

        const currentDate = new Date();

        // Calculate actual total
        let actualTotal = parseFloat(orderAmount);
        if (Array.isArray(cartItems) && cartItems.length > 0) {
            const calculatedTotal = cartItems.reduce((total, item) => {
                const product = item.productId || {};
                const price = product.discountPrice > 0 && product.discountPrice < product.price
                    ? product.discountPrice
                    : product.price;
                return total + (price * (item.quantity || 1));
            }, 0);
            actualTotal = Math.min(actualTotal, calculatedTotal);
        }

        // Check if user is first time customer
        const isFirstTimer = await checkFirstTimeCustomer(userId);

        // Find all applicable vouchers
        const vouchers = await Voucher.findAll({
            where: {
                isActive: true,
                startDate: { [Op.lte]: currentDate },
                endDate: { [Op.gte]: currentDate },
                [Op.or]: [
                    { usageLimit: null },
                    { usageLimit: -1 },
                    sequelize.where(
                        sequelize.col('usageLimit'),
                        Op.gt,
                        sequelize.col('usageCount')
                    )
                ]
            },
            include: [
                { model: Product, as: 'products', through: { attributes: [] } }
            ]
        });

        // Filter applicable vouchers
        const applicableVouchers = vouchers.filter(voucher => {
            // Check first time customer requirement
            if (voucher.isFirstTimeCustomer) {
                if (!userId || !isFirstTimer) return false;
            }

            // Check minimum order value
            if (actualTotal < voucher.minOrderValue) return false;

            // Check product applicability
            if (voucher.applyForAllProducts) return true;
            if (!voucher.products || voucher.products.length === 0) return true;

            return productIds.some(productId =>
                voucher.products.some(p => p.id === productId)
            );
        });

        // Calculate discount for each voucher
        const vouchersWithDiscount = applicableVouchers.map(voucher => {
            let discount = 0;
            if (voucher.discountType === 'percentage') {
                const percentageDiscount = (actualTotal * voucher.discountValue) / 100;
                discount = voucher.maxDiscount
                    ? Math.min(percentageDiscount, voucher.maxDiscount)
                    : percentageDiscount;
            } else if (voucher.discountType === 'fixed') {
                discount = Math.min(voucher.discountValue, actualTotal);
            }

            return {
                ...voucher.toJSON(),
                calculatedDiscount: Math.round(discount)
            };
        });

        // Sort by discount amount (highest first)
        vouchersWithDiscount.sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);

        // Get best voucher
        const bestVoucher = vouchersWithDiscount.length > 0 ? vouchersWithDiscount[0] : null;

        // Prepare alternatives (top 3 other options)
        const alternatives = [];
        for (let i = 1; i < Math.min(4, vouchersWithDiscount.length); i++) {
            alternatives.push({
                voucher: vouchersWithDiscount[i],
                savings: vouchersWithDiscount[i].calculatedDiscount,
                reason: `Giảm ${vouchersWithDiscount[i].calculatedDiscount.toLocaleString('vi-VN')}đ`
            });
        }

        return res.json({
            message: 'Tìm mã giảm giá tốt nhất thành công',
            data: {
                bestCombination: bestVoucher ? {
                    regular: bestVoucher,
                    totalSavings: bestVoucher.calculatedDiscount
                } : null,
                alternatives,
                currentOrderTotal: actualTotal
            },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error finding best voucher:', error);
        return res.status(500).json({
            message: error.message || 'Có lỗi xảy ra khi tìm mã giảm giá tốt nhất',
            error: true,
            success: false
        });
    }
};


// ═══════════════════════════════════════════════════════════════════
// ANALYTICS CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

// Get voucher overview statistics
export const getVoucherOverviewController = async (req, res) => {
    try {
        // Total vouchers
        const totalVouchers = await Voucher.count();

        // Active vouchers
        const currentDate = new Date();
        const activeVouchers = await Voucher.count({
            where: {
                isActive: true,
                startDate: { [Op.lte]: currentDate },
                endDate: { [Op.gte]: currentDate }
            }
        });

        // Usage stats from table orders
        const usageStats = await TableOrder.findAll({
            where: {
                voucherId: { [Op.ne]: null }
            },
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalUsage'],
                [sequelize.fn('SUM', sequelize.col('discount')), 'totalSavings']
            ],
            raw: true
        });

        const totalUsage = usageStats[0]?.totalUsage || 0;
        const totalSavings = usageStats[0]?.totalSavings || 0;
        const avgDiscountPerOrder = totalUsage > 0 ? totalSavings / totalUsage : 0;

        return res.json({
            message: 'Lấy thống kê tổng quan thành công',
            data: {
                totalVouchers,
                activeVouchers,
                totalUsage: parseInt(totalUsage),
                totalSavings: Math.round(parseFloat(totalSavings)),
                avgDiscountPerOrder: Math.round(avgDiscountPerOrder)
            },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error getting voucher overview:', error);
        return res.status(500).json({
            message: error.message || 'Có lỗi xảy ra khi lấy thống kê',
            error: true,
            success: false
        });
    }
};

// Get top vouchers by usage
export const getTopVouchersController = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        // Get voucher usage from table orders
        const topVouchers = await TableOrder.findAll({
            where: {
                voucherId: { [Op.ne]: null }
            },
            attributes: [
                'voucherId',
                [sequelize.fn('COUNT', sequelize.col('TableOrder.id')), 'usageCount'],
                [sequelize.fn('SUM', sequelize.col('discount')), 'totalSavings']
            ],
            include: [{
                model: Voucher,
                as: 'voucher',
                attributes: ['code', 'name', 'discountType']
            }],
            group: ['voucherId', 'voucher.id'],
            order: [[sequelize.literal('usageCount'), 'DESC']],
            limit: limit,
            raw: false
        });

        const formattedVouchers = topVouchers.map(order => ({
            code: order.voucher?.code || 'N/A',
            name: order.voucher?.name || 'Không rõ',
            usageCount: parseInt(order.dataValues.usageCount),
            totalSavings: Math.round(parseFloat(order.dataValues.totalSavings)),
            discountType: order.voucher?.discountType || 'unknown'
        }));

        return res.json({
            message: 'Lấy top vouchers thành công',
            data: { vouchers: formattedVouchers },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error getting top vouchers:', error);
        return res.status(500).json({
            message: error.message || 'Có lỗi xảy ra khi lấy top vouchers',
            error: true,
            success: false
        });
    }
};

// Get usage trend over time
export const getUsageTrendController = async (req, res) => {
    try {
        const period = req.query.period || '7d'; // 7d, 30d, 90d

        let daysAgo = 7;
        if (period === '30d') daysAgo = 30;
        else if (period === '90d') daysAgo = 90;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        startDate.setHours(0, 0, 0, 0);

        // Get trend from table orders
        const trend = await TableOrder.findAll({
            where: {
                voucherId: { [Op.ne]: null },
                createdAt: { [Op.gte]: startDate }
            },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'usageCount'],
                [sequelize.fn('SUM', sequelize.col('discount')), 'totalSavings']
            ],
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        const formattedTrend = trend.map(item => ({
            date: item.date,
            usageCount: parseInt(item.usageCount),
            totalSavings: Math.round(parseFloat(item.totalSavings))
        }));

        return res.json({
            message: 'Lấy xu hướng sử dụng thành công',
            data: { trend: formattedTrend, period, daysAgo },
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error getting usage trend:', error);
        return res.status(500).json({
            message: error.message || 'Có lỗi xảy ra khi lấy xu hướng',
            error: true,
            success: false
        });
    }
};
