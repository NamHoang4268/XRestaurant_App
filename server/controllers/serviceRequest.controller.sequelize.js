import { ServiceRequest, TableOrder, User, Table } from '../models-sequelize/index.js';
import { Op } from 'sequelize';

// ═══════════════════════════════════════════════════════════════════
// POST /api/service-request/call
// Khách gọi phục vụ (role TABLE)
// ═══════════════════════════════════════════════════════════════════
export async function callWaiter(request, response) {
    try {
        const userId = request.userId;
        const { type = 'cancel_item', note = '' } = request.body;

        const user = await User.findByPk(userId);
        if (!user || user.role !== 'TABLE') {
            return response.status(403).json({
                message: 'Chỉ tài khoản bàn mới có thể gọi phục vụ',
                error: true, 
                success: false
            });
        }

        // Lấy tableNumber từ Table record
        const table = await Table.findByPk(user.linkedTableId, {
            attributes: ['tableNumber']
        });
        const tableNumber = table?.tableNumber || 'N/A';

        // Tìm đơn active hiện tại
        const tableOrder = await TableOrder.findOne({
            where: {
                tableId: user.linkedTableId,
                status: {
                    [Op.in]: ['active', 'pending_payment']
                }
            }
        });

        const newRequest = await ServiceRequest.create({
            tableId: user.linkedTableId,
            tableOrderId: tableOrder?.id || null,
            tableNumber,
            type,
            note: note.trim(),
            status: 'pending'
        });

        // Emit socket event cho Waiter Dashboard
        const io = request.app.get('io');
        if (io) {
            io.emit('waiter:service_request', {
                id: newRequest.id,
                tableNumber: newRequest.tableNumber,
                tableId: newRequest.tableId,
                type: newRequest.type,
                note: newRequest.note,
                createdAt: newRequest.createdAt
            });
        }

        return response.status(201).json({
            message: 'Đã gửi yêu cầu gọi phục vụ. Nhân viên sẽ đến ngay!',
            error: false,
            success: true,
            data: newRequest
        });

    } catch (error) {
        console.error('callWaiter error:', error);
        return response.status(500).json({
            message: error.message || 'Lỗi server',
            error: true, 
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/service-request/pending
// Waiter lấy danh sách request đang pending
// ═══════════════════════════════════════════════════════════════════
export async function getPendingRequests(request, response) {
    try {
        const requests = await ServiceRequest.findAll({
            where: { status: 'pending' },
            order: [['createdAt', 'DESC']]
        });

        return response.status(200).json({
            message: 'OK',
            error: false,
            success: true,
            data: requests
        });
    } catch (error) {
        return response.status(500).json({
            message: error.message, 
            error: true, 
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// PATCH /api/service-request/:id/handle
// Waiter cập nhật trạng thái (accepted / done / rejected)
// ═══════════════════════════════════════════════════════════════════
export async function handleRequest(request, response) {
    try {
        const { id } = request.params;
        const { status } = request.body;
        const handlerId = request.userId;

        if (!['accepted', 'done', 'rejected'].includes(status)) {
            return response.status(400).json({
                message: 'Trạng thái không hợp lệ',
                error: true, 
                success: false
            });
        }

        const serviceRequest = await ServiceRequest.findByPk(id);
        if (!serviceRequest) {
            return response.status(404).json({
                message: 'Không tìm thấy yêu cầu',
                error: true, 
                success: false
            });
        }

        await serviceRequest.update({
            status,
            handledBy: handlerId,
            handledAt: new Date()
        });

        // Thông báo realtime khi done/rejected
        const io = request.app.get('io');
        if (io && (status === 'done' || status === 'rejected')) {
            io.emit('waiter:service_request_updated', {
                id: serviceRequest.id,
                status: serviceRequest.status,
                tableNumber: serviceRequest.tableNumber
            });
        }

        return response.status(200).json({
            message: `Đã cập nhật yêu cầu: ${status}`,
            error: false, 
            success: true,
            data: serviceRequest
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message, 
            error: true, 
            success: false
        });
    }
}
