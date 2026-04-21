import express from 'express';
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import {
    callWaiter,
    getPendingRequests,
    handleRequest
} from '../controllers/serviceRequest.controller.js';

const serviceRequestRouter = express.Router();

// Khách bàn gọi phục vụ
serviceRequestRouter.post('/call', verifyCognitoToken, callWaiter);

// Waiter xem danh sách pending
serviceRequestRouter.get('/pending', verifyCognitoToken, getPendingRequests);

// Waiter cập nhật trạng thái
serviceRequestRouter.patch('/:id/handle', verifyCognitoToken, handleRequest);

export default serviceRequestRouter;
