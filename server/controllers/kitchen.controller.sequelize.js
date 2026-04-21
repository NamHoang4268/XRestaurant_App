import { TableOrder, OrderItem, Product, Table } from '../models-sequelize/index.js';
import { Op } from 'sequelize';

// ═══════════════════════════════════════════════════════════════════
// GET /api/kitchen/orders
// Lấy danh sách tất cả món chưa hoàn thành, group theo bàn
// ═══════════════════════════════════════════════════════════════════
export const getKitchenOrders = async (req, res) => {
    try {
        const orders = await TableOrder.findAll({
            where: {
                status: {
                    [Op.in]: ['pending', 'confirmed']
                }
            },
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['name', 'tableName', 'tableNumber']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['name', 'image']
                    }]
                }
            ],
            order: [['createdAt', 'ASC']]
        });

        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('getKitchenOrders error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/kitchen/active
// Lấy các món đang ở trạng thái cần bếp xử lý
// ═══════════════════════════════════════════════════════════════════
export const getActiveKitchenItems = async (req, res) => {
    try {
        // Find orders with items that need kitchen attention
        const orders = await TableOrder.findAll({
            where: {
                status: {
                    [Op.notIn]: ['cancelled', 'Đã hủy', 'paid']
                }
            },
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['name', 'tableName', 'tableNumber']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    where: {
                        kitchenStatus: {
                            [Op.in]: ['pending', 'cooking']
                        }
                    },
                    required: true,
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['name', 'image', 'price']
                    }]
                }
            ],
            order: [['createdAt', 'ASC']]
        });

        // Flatten items cần nấu, kèm thông tin bàn
        const kitchenItems = [];
        orders.forEach((order) => {
            order.orderItems.forEach((item) => {
                if (item.kitchenStatus === 'pending' || item.kitchenStatus === 'cooking') {
                    kitchenItems.push({
                        id: item.id,
                        orderId: order.id,
                        tableId: order.table,
                        product: item.product,
                        quantity: item.quantity,
                        note: item.note,
                        kitchenStatus: item.kitchenStatus,
                        sentAt: item.sentAt || order.createdAt
                    });
                }
            });
        });

        return res.status(200).json({ success: true, data: kitchenItems });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/kitchen/item/:orderId/:itemId/status
// Đầu bếp cập nhật trạng thái từng món: pending → cooking → ready
// ═══════════════════════════════════════════════════════════════════
export const updateItemKitchenStatus = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { status } = req.body; // "cooking" | "ready"

        const validStatuses = ['cooking', 'ready'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Trạng thái không hợp lệ. Chọn: ${validStatuses.join(', ')}`
            });
        }

        const order = await TableOrder.findByPk(orderId, {
            include: [{
                model: Table,
                as: 'table',
                attributes: ['name', 'tableName', 'tableNumber']
            }]
        });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Không tìm thấy đơn hàng.' 
            });
        }

        const item = await OrderItem.findOne({
            where: {
                id: itemId,
                tableOrderId: orderId
            }
        });

        if (!item) {
            return res.status(404).json({ 
                success: false, 
                message: 'Không tìm thấy món.' 
            });
        }

        // Update item status
        const updateData = { kitchenStatus: status };
        if (status === 'cooking') {
            updateData.cookingStartAt = new Date();
        }
        if (status === 'ready') {
            updateData.readyAt = new Date();
        }

        await item.update(updateData);

        // Update order payment status if needed
        if (status === 'cooking' && ['pending', 'Chờ xử lý', 'Đã phục vụ'].includes(order.paymentStatus)) {
            await order.update({ paymentStatus: 'Đang chuẩn bị' });
        }

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            if (status === 'ready') {
                io.emit('dish:ready', {
                    orderId,
                    itemId,
                    tableId: order.table?.id,
                    tableName: order.table?.tableNumber || order.table?.name || order.table?.tableName,
                    productName: item.name,
                    quantity: item.quantity
                });
            } else {
                io.emit('kitchen:status_update', {
                    orderId,
                    itemId,
                    status,
                    tableId: order.table?.id
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái món thành "${status}"`,
            data: item
        });
    } catch (error) {
        console.error('updateItemKitchenStatus error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/kitchen/item/:orderId/:itemId/served
// Nhân viên xác nhận đã phục vụ món ra bàn
// ═══════════════════════════════════════════════════════════════════
export const markItemServed = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;

        const order = await TableOrder.findByPk(orderId, {
            include: [{
                model: Table,
                as: 'table',
                attributes: ['name', 'tableName', 'tableNumber']
            }]
        });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Không tìm thấy đơn hàng.' 
            });
        }

        const item = await OrderItem.findOne({
            where: {
                id: itemId,
                tableOrderId: orderId
            }
        });

        if (!item) {
            return res.status(404).json({ 
                success: false, 
                message: 'Không tìm thấy món.' 
            });
        }

        if (item.kitchenStatus !== 'ready') {
            return res.status(400).json({
                success: false,
                message: 'Món chưa sẵn sàng để phục vụ.'
            });
        }

        // Mark item as served
        await item.update({
            kitchenStatus: 'served',
            servedAt: new Date()
        });

        // Check if all items are served
        const allItems = await OrderItem.findAll({
            where: { tableOrderId: orderId }
        });

        const allServed = allItems.every(i => i.kitchenStatus === 'served');
        if (allServed && order.paymentStatus === 'Đang chuẩn bị') {
            await order.update({ paymentStatus: 'Đã phục vụ' });
        }

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('dish:served', {
                orderId,
                itemId,
                tableId: order.table?.id,
                tableName: order.table?.tableNumber || order.table?.name || order.table?.tableName
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Đã xác nhận phục vụ món.',
            data: item
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/kitchen/waiter – Món đã xong, chờ phục vụ
// ═══════════════════════════════════════════════════════════════════
export const getReadyToServeItems = async (req, res) => {
    try {
        const orders = await TableOrder.findAll({
            where: {
                status: {
                    [Op.notIn]: ['cancelled', 'Đã hủy', 'paid']
                }
            },
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['name', 'tableName', 'tableNumber']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    where: {
                        kitchenStatus: 'ready'
                    },
                    required: true,
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['name', 'image']
                    }]
                }
            ],
            order: [[{ model: OrderItem, as: 'orderItems' }, 'readyAt', 'ASC']]
        });

        const readyItems = [];
        orders.forEach((order) => {
            order.orderItems.forEach((item) => {
                if (item.kitchenStatus === 'ready') {
                    readyItems.push({
                        id: item.id,
                        orderId: order.id,
                        tableId: order.table,
                        product: item.product,
                        quantity: item.quantity,
                        readyAt: item.readyAt
                    });
                }
            });
        });

        return res.status(200).json({ success: true, data: readyItems });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
