import { Router } from 'express';
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import {
    addItemsToTableOrder,
    getCurrentTableOrder,
    checkoutTableOrder,
    cancelTableOrder,
    getAllActiveTableOrders,
    getCashierPendingOrders,
    confirmCashierPayment,
    cancelTableOrderItem,
    handleStripeWebhook,
    verifyStripeSession
} from '../controllers/tableOrder.controller.js';

const tableOrderRouter = Router();

tableOrderRouter.post('/add-items', verifyCognitoToken, addItemsToTableOrder);
tableOrderRouter.get('/current', verifyCognitoToken, getCurrentTableOrder);
tableOrderRouter.post('/checkout', verifyCognitoToken, checkoutTableOrder);
tableOrderRouter.post('/cancel', verifyCognitoToken, cancelTableOrder);
tableOrderRouter.get('/all-active', verifyCognitoToken, getAllActiveTableOrders);

// Cashier payment routes
tableOrderRouter.get('/cashier-pending', verifyCognitoToken, getCashierPendingOrders);
tableOrderRouter.post('/cashier-confirm', verifyCognitoToken, confirmCashierPayment);

// Waiter cancel item
tableOrderRouter.delete('/item/:orderId/:itemId', verifyCognitoToken, cancelTableOrderItem);

// US26 – Stripe webhook (no auth – Stripe calls this directly; raw body handled in index.js)
tableOrderRouter.post('/stripe-webhook', handleStripeWebhook);

// US26 – Verify stripe session (for success page)
tableOrderRouter.get('/verify-stripe-session', verifyCognitoToken, verifyStripeSession);

export default tableOrderRouter;
