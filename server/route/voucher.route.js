import { Router } from 'express';
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import {
    addVoucerController, bulkDeleteVouchersController,
    bulkUpdateVouchersStatusController, deleteVoucherController,
    getAllVoucherController, updateVoucherController,
    getAvailableVouchersController,
    applyVoucherController,
    getBestVoucherController,
    getVoucherOverviewController,
    getTopVouchersController,
    getUsageTrendController
} from '../controllers/voucher.controller.js';

const voucherRouter = Router()

voucherRouter.post('/add-voucher', verifyCognitoToken, addVoucerController)
voucherRouter.get('/get-all-voucher', getAllVoucherController)
voucherRouter.put('/update-voucher', verifyCognitoToken, updateVoucherController)
voucherRouter.delete('/delete-voucher', verifyCognitoToken, deleteVoucherController)
voucherRouter.delete('/bulk-delete-vouchers', verifyCognitoToken, bulkDeleteVouchersController)
voucherRouter.put('/bulk-update-vouchers-status', verifyCognitoToken, bulkUpdateVouchersStatusController)

// Get available vouchers for checkout
voucherRouter.post('/available', getAvailableVouchersController)

// Apply a voucher
voucherRouter.post('/apply', applyVoucherController)

// Get best voucher combination
voucherRouter.post('/best', getBestVoucherController)

// Analytics routes (admin only)
voucherRouter.get('/analytics/overview', verifyCognitoToken, getVoucherOverviewController)
voucherRouter.get('/analytics/top-vouchers', verifyCognitoToken, getTopVouchersController)
voucherRouter.get('/analytics/usage-trend', verifyCognitoToken, getUsageTrendController)

export default voucherRouter
