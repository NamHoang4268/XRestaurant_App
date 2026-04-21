import { Router } from 'express';
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import { getAllOrders, updateOrderStatus } from '../controllers/order.controller.js';

const orderRouter = Router();

// Re-enabled for BillPage
orderRouter.get('/all-orders', verifyCognitoToken, getAllOrders);
orderRouter.put('/update-status/:orderId', verifyCognitoToken, updateOrderStatus);

// Endpoint thông báo chuyển hướng cho các route cũ khác nếu có
orderRouter.use((req, res) => {
    res.status(410).json({
        success: false,
        message: 'Endpoint này đã ngừng hoạt động. Vui lòng sử dụng /api/table-order thay thế.',
    });
});

export default orderRouter;