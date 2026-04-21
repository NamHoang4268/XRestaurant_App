import { TableOrder, OrderItem, Product, User, Table } from '../models-sequelize/index.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';
import Stripe from '../config/stripe.js';

// ═══════════════════════════════════════════════════════════════════
// Add items to table order
// ═══════════════════════════════════════════════════════════════════
export async function addItemsToTableOrder(request, response) {
    try {
        const userId = request.userId;
        const { items, tableNumber } = request.body;

        if (!items || items.length === 0) {
            return response.status(400).json({
                message: 'Vui lòng chọn món',
                error: true,
                success: false
            });
        }

        // Get user's table info
        const user = await User.findByPk(userId);
        console.log('User found:', user ? { id: user.id, role: user.role, email: user.email } : 'null');

        if (!user || user.role !== 'TABLE') {
            console.log('Access denied - User role:', user?.role);
            return response.status(403).json({
                message: 'Chỉ tài khoản bàn mới có thể gọi món',
                error: true,
                success: false
            });
        }

        const tableId = user.linkedTableId;
        const actualTableNumber = tableNumber || user.email.split('_')[1]?.split('@')[0]?.toUpperCase();

        // Find or create active table order
        let tableOrder = await TableOrder.findOne({
            where: {
                tableId: tableId,
                status: 'active'
            }
        });

        // Prepare items with product details
        const itemsToAdd = [];
        let subTotal = 0;

        for (const item of items) {
            // AC 7.4 – Validate quantity
            const qty = parseInt(item.quantity);
            if (!qty || qty < 1 || !Number.isInteger(qty)) {
                return response.status(400).json({
                    message: 'Số lượng món ăn không hợp lệ.',
                    error: true,
                    success: false
                });
            }

            // AC 7.1 – Product must exist
            const product = await Product.findByPk(item.productId);
            if (!product) {
                return response.status(404).json({
                    message: 'Món ăn không tồn tại.',
                    error: true,
                    success: false
                });
            }

            // Validate stock still uses status field
            const isProductAvailable = product.status === 'available';
            if (!isProductAvailable) {
                return response.status(400).json({
                    message: `"${product.name}" hiện không khả dụng.`,
                    error: true,
                    success: false
                });
            }

            const itemTotal = product.price * qty;
            subTotal += itemTotal;

            itemsToAdd.push({
                productId: product.id,
                name: product.name,
                price: product.price,
                quantity: qty,
                note: item.note || '',
                addedAt: new Date(),
                kitchenStatus: 'pending'
            });
        }

        if (tableOrder) {
            // Update existing order - create OrderItem records
            await OrderItem.bulkCreate(
                itemsToAdd.map(item => ({
                    tableOrderId: tableOrder.id,
                    ...item
                }))
            );

            // Update order totals
            const newSubTotal = tableOrder.subTotal + subTotal;
            await tableOrder.update({
                subTotal: newSubTotal,
                total: newSubTotal,
                paymentStatus: ['Đã phục vụ', 'Đang chuẩn bị'].includes(tableOrder.paymentStatus) 
                    ? 'Chờ xử lý' 
                    : tableOrder.paymentStatus
            });

            // Reload with items
            await tableOrder.reload({
                include: [{
                    model: OrderItem,
                    as: 'orderItems'
                }]
            });
        } else {
            // Create new order with transaction
            const transaction = await sequelize.transaction();
            try {
                // Create table order
                tableOrder = await TableOrder.create({
                    tableId: tableId,
                    tableNumber: actualTableNumber,
                    subTotal: subTotal,
                    total: subTotal,
                    status: 'active',
                    paymentStatus: 'Chờ xử lý'
                }, { transaction });

                // Create order items
                await OrderItem.bulkCreate(
                    itemsToAdd.map(item => ({
                        tableOrderId: tableOrder.id,
                        ...item
                    })),
                    { transaction }
                );

                await transaction.commit();

                // Reload with items
                await tableOrder.reload({
                    include: [{
                        model: OrderItem,
                        as: 'orderItems'
                    }]
                });
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        }

        return response.status(200).json({
            message: 'Đã thêm món vào đơn',
            error: false,
            success: true,
            data: {
                tableOrder: tableOrder,
                itemsAdded: itemsToAdd.length
            }
        });

    } catch (error) {
        console.error('Error adding items to table order:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi thêm món',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Get current table order
// ═══════════════════════════════════════════════════════════════════
export async function getCurrentTableOrder(request, response) {
    try {
        const userId = request.userId;

        const user = await User.findByPk(userId);
        if (!user || user.role !== 'TABLE') {
            return response.status(403).json({
                message: 'Chỉ tài khoản bàn mới có thể xem đơn',
                error: true,
                success: false
            });
        }

        const tableOrder = await TableOrder.findOne({
            where: {
                tableId: user.linkedTableId,
                status: 'active'
            },
            include: [{
                model: OrderItem,
                as: 'orderItems',
                include: [{
                    model: Product,
                    as: 'product',
                    attributes: ['name', 'image']
                }]
            }]
        });

        if (!tableOrder) {
            return response.status(200).json({
                message: 'Chưa có món nào được gọi',
                error: false,
                success: true,
                data: null
            });
        }

        return response.status(200).json({
            message: 'Lấy đơn hàng thành công',
            error: false,
            success: true,
            data: tableOrder
        });

    } catch (error) {
        console.error('Error getting table order:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi lấy đơn hàng',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Checkout table order
// ═══════════════════════════════════════════════════════════════════
export async function checkoutTableOrder(request, response) {
    try {
        const userId = request.userId;
        const { paymentMethod } = request.body;

        if (!paymentMethod || !['at_counter', 'online'].includes(paymentMethod)) {
            return response.status(400).json({
                message: 'Vui lòng chọn phương thức thanh toán',
                error: true,
                success: false
            });
        }

        const user = await User.findByPk(userId);
        if (!user || user.role !== 'TABLE') {
            return response.status(403).json({
                message: 'Chỉ tài khoản bàn mới có thể thanh toán',
                error: true,
                success: false
            });
        }

        const tableOrder = await TableOrder.findOne({
            where: {
                tableId: user.linkedTableId,
                status: 'active'
            },
            include: [{
                model: OrderItem,
                as: 'orderItems',
                include: [{
                    model: Product,
                    as: 'product',
                    attributes: ['name', 'image']
                }]
            }]
        });

        if (!tableOrder || !tableOrder.orderItems || tableOrder.orderItems.length === 0) {
            return response.status(404).json({
                message: 'Không có đơn hàng nào để thanh toán',
                error: true,
                success: false
            });
        }

        // AC: Tất cả món phải ở trạng thái 'served' trước khi được phép thanh toán
        const unservedItems = tableOrder.orderItems.filter(item => item.kitchenStatus !== 'served');
        if (unservedItems.length > 0) {
            return response.status(400).json({
                message: `Còn ${unservedItems.length} món chưa được phục vụ. Vui lòng chờ nhân viên mang món ra bàn trước khi thanh toán.`,
                error: true,
                success: false
            });
        }

        if (paymentMethod === 'at_counter') {
            // At-counter: mark as pending_payment so Cashier can confirm cash later
            await tableOrder.update({
                status: 'pending_payment',
                paymentStatus: 'Chờ thanh toán',
                paymentRequest: 'at_counter',
                checkedOutAt: new Date()
            });

            return response.status(200).json({
                message: 'Yeu cau thanh toan tai quay da duoc gui. Nhan vien se den ho tro ban.',
                error: false,
                success: true,
                data: { paymentMethod: 'at_counter' }
            });

        } else {
            // Online payment – create Stripe Checkout Session
            const line_items = tableOrder.orderItems.map(item => ({
                price_data: {
                    currency: 'vnd',
                    product_data: {
                        name: item.name,
                        metadata: { productId: item.productId.toString() }
                    },
                    unit_amount: Math.round(item.price),
                },
                quantity: item.quantity
            }));

            const params = {
                submit_type: 'pay',
                mode: 'payment',
                payment_method_types: ['card'],
                customer_email: user.email,
                metadata: {
                    userId: userId.toString(),
                    tableOrderId: tableOrder.id.toString(),
                    tableNumber: tableOrder.tableNumber,
                    orderType: 'dine_in'
                },
                line_items,
                success_url: `${process.env.FRONTEND_URL}/table-payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/table-order-management`
            };

            const stripeSession = await Stripe.checkout.sessions.create(params);

            // Snapshot: save sessionId + expectedTotal for webhook verification
            await tableOrder.update({
                stripeSessionId: stripeSession.id,
                expectedTotal: tableOrder.total,
                status: 'pending_payment',
                paymentStatus: 'Chờ thanh toán',
                paymentRequest: 'online',
                checkedOutAt: new Date()
            });

            return response.status(200).json({
                message: 'Tạo phiên thanh toán thành công',
                error: false,
                success: true,
                data: {
                    checkoutUrl: stripeSession.url,
                    sessionId: stripeSession.id
                }
            });
        }

    } catch (error) {
        console.error('Error checkout table order:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi thanh toán',
            error: true,
            success: false
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// Cancel table order
// ═══════════════════════════════════════════════════════════════════
export async function cancelTableOrder(request, response) {
    try {
        const userId = request.userId;

        const user = await User.findByPk(userId);
        if (!user || user.role !== 'TABLE') {
            return response.status(403).json({
                message: 'Không có quyền hủy đơn',
                error: true,
                success: false
            });
        }

        const tableOrder = await TableOrder.findOne({
            where: {
                tableId: user.linkedTableId,
                status: 'active'
            }
        });

        if (!tableOrder) {
            return response.status(404).json({
                message: 'Không tìm thấy đơn hàng',
                error: true,
                success: false
            });
        }

        await tableOrder.update({
            status: 'cancelled',
            paymentStatus: 'Đã hủy'
        });

        return response.status(200).json({
            message: 'Đã hủy đơn hàng',
            error: false,
            success: true
        });

    } catch (error) {
        console.error('Error cancelling table order:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi hủy đơn',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Get all active table orders (for Manager/Admin)
// ═══════════════════════════════════════════════════════════════════
export async function getAllActiveTableOrders(request, response) {
    try {
        const userId = request.userId;

        const user = await User.findByPk(userId);
        if (!user || !['ADMIN', 'WAITER', 'CHEF'].includes(user.role)) {
            return response.status(403).json({
                message: 'Không có quyền truy cập',
                error: true,
                success: false
            });
        }

        const tableOrders = await TableOrder.findAll({
            where: {
                status: 'active'
            },
            order: [['updatedAt', 'DESC']]
        });

        return response.status(200).json({
            message: 'Lấy danh sách đơn hàng thành công',
            error: false,
            success: true,
            data: tableOrders
        });

    } catch (error) {
        console.error('Error getting all table orders:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi lấy danh sách đơn hàng',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// AC3 - List all at-counter pending payment orders (for Cashier dashboard)
// ═══════════════════════════════════════════════════════════════════
export async function getCashierPendingOrders(request, response) {
    try {
        const user = await User.findByPk(request.userId);
        if (!user || !['ADMIN', 'CASHIER'].includes(user.role)) {
            return response.status(403).json({
                message: 'Khong co quyen truy cap',
                error: true, 
                success: false
            });
        }

        const orders = await TableOrder.findAll({
            where: {
                status: 'pending_payment',
                paymentRequest: 'at_counter'
            },
            order: [['checkedOutAt', 'ASC']]
        });

        return response.status(200).json({
            message: 'Danh sach don cho thanh toan',
            error: false,
            success: true,
            data: orders
        });
    } catch (error) {
        return response.status(500).json({
            message: error.message || 'Loi server',
            error: true, 
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// AC9-12 - Cashier confirms cash payment
// ═══════════════════════════════════════════════════════════════════
export async function confirmCashierPayment(request, response) {
    try {
        const user = await User.findByPk(request.userId);
        if (!user || !['ADMIN', 'CASHIER'].includes(user.role)) {
            return response.status(403).json({
                message: 'Khong co quyen thuc hien',
                error: true, 
                success: false
            });
        }

        const { tableOrderId } = request.body;

        const tableOrder = await TableOrder.findByPk(tableOrderId);
        if (!tableOrder) {
            return response.status(404).json({
                message: 'Khong tim thay hoa don.',
                error: true, 
                success: false
            });
        }

        if (tableOrder.status !== 'pending_payment') {
            return response.status(400).json({
                message: 'Thanh toan chua hoan tat. Vui long kiem tra lai.',
                error: true, 
                success: false
            });
        }

        // Use Sequelize transaction
        const transaction = await sequelize.transaction();
        try {
            await tableOrder.update({
                status: 'paid',
                paymentStatus: 'paid',
                paymentMethod: 'cash',
                paidAt: new Date()
            }, { transaction });

            await transaction.commit();

            return response.status(200).json({
                message: 'Thanh toan thanh cong. don hang da duoc hoan tat.',
                error: false,
                success: true,
                data: { 
                    totalPaid: tableOrder.total, 
                    tableNumber: tableOrder.tableNumber 
                }
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error confirming cashier payment:', error);
        return response.status(500).json({
            message: error.message || 'Loi xac nhan thanh toan',
            error: true, 
            success: false
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// Waiter huỷ một món trong đơn (chỉ khi kitchenStatus === 'pending')
// ═══════════════════════════════════════════════════════════════════
export async function cancelTableOrderItem(request, response) {
    try {
        const user = await User.findByPk(request.userId);
        if (!user || !['ADMIN', 'WAITER'].includes(user.role)) {
            return response.status(403).json({
                message: 'Không có quyền huỷ món',
                error: true, 
                success: false
            });
        }

        const { orderId, itemId } = request.params;

        const tableOrder = await TableOrder.findByPk(orderId);
        if (!tableOrder) {
            return response.status(404).json({
                message: 'Không tìm thấy đơn hàng',
                error: true, 
                success: false
            });
        }

        const item = await OrderItem.findOne({
            where: {
                id: itemId,
                tableOrderId: orderId
            }
        });

        if (!item) {
            return response.status(404).json({
                message: 'Không tìm thấy món trong đơn',
                error: true, 
                success: false
            });
        }

        if (item.kitchenStatus !== 'pending') {
            return response.status(400).json({
                message: `Không thể huỷ món đang ở trạng thái "${item.kitchenStatus}". Chỉ huỷ được món chờ bếp.`,
                error: true, 
                success: false
            });
        }

        // Delete item from OrderItem table
        await item.destroy();

        // Recalculate totals
        const remainingItems = await OrderItem.findAll({
            where: { tableOrderId: orderId }
        });

        const subTotal = remainingItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = Math.max(0, subTotal - (tableOrder.discount || 0));

        await tableOrder.update({
            subTotal: subTotal,
            total: total
        });

        return response.status(200).json({
            message: 'Đã huỷ món thành công',
            error: false, 
            success: true,
            data: { 
                orderId, 
                itemId, 
                newTotal: total 
            }
        });

    } catch (error) {
        console.error('cancelTableOrderItem error:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi server',
            error: true, 
            success: false
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// US26 – Stripe Webhook (server-side payment confirmation)
// ═══════════════════════════════════════════════════════════════════
export async function handleStripeWebhook(request, response) {
    const sig = request.headers['stripe-signature'];
    // Use CLI webhook secret when testing locally, else use dashboard secret
    const webhookSecret = process.env.STRIPE_CLI_WEBHOOK_SECRET || process.env.STRIPE_ENPOINT_WEBHOOK_SECRET_KEY;

    let event;
    try {
        event = Stripe.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return response.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { orderType, tableOrderId } = session.metadata || {};

        // Only handle dine-in orders
        if (orderType !== 'dine_in' || !tableOrderId) {
            return response.status(200).json({ received: true });
        }

        try {
            const tableOrder = await TableOrder.findByPk(tableOrderId);

            if (!tableOrder) {
                console.error('[Stripe Webhook] TableOrder not found:', tableOrderId);
                return response.status(200).json({ received: true }); // Ack to Stripe
            }

            // Idempotency: already paid
            if (tableOrder.status === 'paid') {
                return response.status(200).json({ received: true });
            }

            // AC 9.1 – Bill integrity check
            if (tableOrder.expectedTotal !== null &&
                Math.round(tableOrder.total) !== Math.round(tableOrder.expectedTotal)) {
                console.warn(
                    `[Stripe Webhook] Bill changed for order ${tableOrderId}: ` +
                    `expected ${tableOrder.expectedTotal}, current ${tableOrder.total}`
                );
                await tableOrder.update({
                    billChangedAfterPayment: true
                });
                return response.status(200).json({ received: true });
            }

            // Sequelize transaction: mark paid
            const transaction = await sequelize.transaction();
            try {
                await tableOrder.update({
                    status: 'paid',
                    paymentStatus: 'paid',
                    paymentMethod: 'online',
                    paidAt: new Date()
                }, { transaction });

                await transaction.commit();

                console.log(`[Stripe Webhook] ✅ Order ${tableOrderId} marked paid (table ${tableOrder.tableNumber})`);

                // AC 11 – Notify Cashier Dashboard via Socket.io
                const io = request.app.get('io');
                if (io) {
                    io.emit('cashier:order_paid_online', {
                        tableOrderId: tableOrder.id.toString(),
                        tableNumber: tableOrder.tableNumber,
                        total: tableOrder.total,
                        paidAt: tableOrder.paidAt
                    });
                }
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            console.error('[Stripe Webhook] Error processing payment:', error);
            return response.status(500).json({ error: 'Internal server error' });
        }
    }

    return response.status(200).json({ received: true });
}

// ═══════════════════════════════════════════════════════════════════
// US26 – Verify Stripe Session (for success page)
// ═══════════════════════════════════════════════════════════════════
export async function verifyStripeSession(request, response) {
    try {
        const { session_id } = request.query;

        if (!session_id) {
            return response.status(400).json({
                message: 'session_id là bắt buộc',
                error: true, 
                success: false
            });
        }

        // Look up by stripeSessionId
        const tableOrder = await TableOrder.findOne({ 
            where: { stripeSessionId: session_id },
            include: [{
                model: OrderItem,
                as: 'orderItems'
            }]
        });

        if (!tableOrder) {
            // Fallback: try fetching from Stripe API
            try {
                const stripeSession = await Stripe.checkout.sessions.retrieve(session_id);
                const { payment_status } = stripeSession;
                return response.status(200).json({
                    message: payment_status === 'paid' ? 'Đang xử lý...' : 'Chưa thanh toán',
                    error: false,
                    success: true,
                    data: { status: payment_status === 'paid' ? 'processing' : 'pending' }
                });
            } catch {
                return response.status(404).json({
                    message: 'Không tìm thấy phiên thanh toán',
                    error: true, 
                    success: false
                });
            }
        }

        // AC 9.1 – bill changed
        if (tableOrder.billChangedAfterPayment) {
            return response.status(200).json({
                message: 'Đơn hàng đã thay đổi. Vui lòng thanh toán lại.',
                error: false,
                success: true,
                data: { 
                    status: 'bill_changed', 
                    tableNumber: tableOrder.tableNumber 
                }
            });
        }

        // AC 12 – success
        if (tableOrder.status === 'paid') {
            return response.status(200).json({
                message: 'Thanh toán thành công. Cảm ơn quý khách!',
                error: false,
                success: true,
                data: {
                    status: 'paid',
                    tableNumber: tableOrder.tableNumber,
                    total: tableOrder.total,
                    paidAt: tableOrder.paidAt,
                    items: tableOrder.orderItems
                }
            });
        }

        // Still pending (webhook not yet received)
        return response.status(200).json({
            message: 'Đang chờ xác nhận thanh toán...',
            error: false,
            success: true,
            data: { 
                status: 'pending', 
                tableNumber: tableOrder.tableNumber 
            }
        });

    } catch (error) {
        console.error('[verifyStripeSession] Error:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi server',
            error: true, 
            success: false
        });
    }
}
