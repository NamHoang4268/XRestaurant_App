import OrderModel from '../models/order.model.js';
import UserModel from '../models/user.model.js';

export async function getAllOrders(request, response) {
    try {
        const userId = request.userId;
        const user = await UserModel.findById(userId);

        if (!user || !['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'].includes(user.role)) {
            return response.status(403).json({
                message: 'Bạn không có quyền truy cập',
                error: true,
                success: false
            });
        }

        const { status, startDate, endDate } = request.query;

        let query = {};

        if (status) {
            query.payment_status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        const orders = await OrderModel.find(query)
            .populate('userId', 'name email mobile')
            .sort({ createdAt: -1 });

        return response.status(200).json({
            message: 'Lấy danh sách đơn hàng thành công',
            error: false,
            success: true,
            data: orders
        });

    } catch (error) {
        console.error('Error getting all orders:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi lấy danh sách đơn hàng',
            error: true,
            success: false
        });
    }
}

export async function updateOrderStatus(request, response) {
    try {
        const userId = request.userId;
        const { orderId } = request.params;
        const { status, cancelReason } = request.body;

        const user = await UserModel.findById(userId);

        if (!user || !['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'].includes(user.role)) {
            return response.status(403).json({
                message: 'Bạn không có quyền cập nhật trạng thái đơn hàng',
                error: true,
                success: false
            });
        }

        const order = await OrderModel.findById(orderId);

        if (!order) {
            return response.status(404).json({
                message: 'Không tìm thấy đơn hàng',
                error: true,
                success: false
            });
        }

        order.payment_status = status;
        
        if (status === 'Đã thanh toán' || status === 'paid') {
            order.isPaid = true;
            order.paidAt = new Date();
        }

        if (status === 'Đã hủy' || status === 'cancelled') {
            order.cancelReason = cancelReason || '';
            order.cancelledAt = new Date();
        }

        await order.save();

        return response.status(200).json({
            message: 'Cập nhật trạng thái đơn hàng thành công',
            error: false,
            success: true,
            data: order
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi khi cập nhật trạng thái đơn hàng',
            error: true,
            success: false
        });
    }
}
