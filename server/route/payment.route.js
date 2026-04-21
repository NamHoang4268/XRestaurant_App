import { Router } from 'express';
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import {
    markAsPaid,
    createStripeSession,
    handleStripeWebhook,
    getPaymentDetails,
    processRefund,
    generateReceipt
} from '../controllers/payment.controller.js';

const paymentRouter = Router();

// Webhook (no auth required)
paymentRouter.post('/stripe/webhook', handleStripeWebhook);

// Protected endpoints
paymentRouter.post('/mark-paid', verifyCognitoToken, markAsPaid);
paymentRouter.post('/stripe/create-session', verifyCognitoToken, createStripeSession);
paymentRouter.get('/:paymentId', verifyCognitoToken, getPaymentDetails);
paymentRouter.post('/refund', verifyCognitoToken, processRefund);
paymentRouter.post('/generate-receipt', verifyCognitoToken, generateReceipt);

export default paymentRouter;
