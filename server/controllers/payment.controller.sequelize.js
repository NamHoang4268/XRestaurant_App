import { Payment, TableOrder, User } from '../models-sequelize/index.js';
import { sequelize } from '../config/database.js';
import stripe from '../config/stripe.js';

// ═══════════════════════════════════════════════════════════════════
// Helper: Check authorization
// ═══════════════════════════════════════════════════════════════════
async function checkAuthorization(userId, requiredRoles) {
    const user = await User.findByPk(userId);
    if (!user || !requiredRoles.includes(user.role)) {
        return null;
    }
    return user;
}

// ═══════════════════════════════════════════════════════════════════
// Mark payment as paid (Cash payment)
// ═══════════════════════════════════════════════════════════════════
export async function markAsPaid(request, response) {
    try {
        const { tableOrderId, orderId, amount, notes } = request.body;
        const userId = request.userId;

        // Validate user role
        const user = await checkAuthorization(userId, ['ADMIN', 'CASHIER', 'WAITER']);
        if (!user) {
            return response.status(403).json({
                message: 'Bạn không có quyền thực hiện hành động này',
                error: true,
                success: false
            });
        }

        const transaction = await sequelize.transaction();
        try {
            // Generate receipt number
            const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

            // Create payment record
            const payment = await Payment.create({
                amount,
                currency: 'VND',
                paymentMethod: 'cash',
                paymentStatus: 'completed',
                userId,
                tableOrderId: tableOrderId || null,
                orderId: orderId || null,
                notes,
                receiptNumber,
                processingDetails: {
                    processor: 'local',
                    processedAt: new Date(),
                    processingTime: 0
                }
            }, { transaction });

            // Update related table order if exists
            if (tableOrderId) {
                await TableOrder.update(
                    {
                        paymentMethod: 'cash',
                        paymentStatus: 'paid',
                        paidAt: new Date(),
                        paymentId: payment.id
                    },
                    {
                        where: { id: tableOrderId },
                        transaction
                    }
                );
            }

            await transaction.commit();

            return response.status(200).json({
                message: 'Thanh toán tiền mặt thành công',
                error: false,
                success: true,
                data: {
                    paymentId: payment.id,
                    receiptNumber: payment.receiptNumber,
                    amount: payment.amount,
                    paymentStatus: payment.paymentStatus
                }
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error marking payment as paid:', error);
        return response.status(500).json({
            message: 'Lỗi khi xử lý thanh toán',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Create Stripe checkout session
// ═══════════════════════════════════════════════════════════════════
export async function createStripeSession(request, response) {
    try {
        const { tableOrderId, orderId, amount, items } = request.body;
        const userId = request.userId;

        const user = await checkAuthorization(userId, ['ADMIN', 'CASHIER', 'CUSTOMER', 'WAITER']);
        if (!user) {
            return response.status(403).json({
                message: 'Bạn không có quyền thực hiện hành động này',
                error: true,
                success: false
            });
        }

        // Create payment record first
        const payment = await Payment.create({
            amount,
            currency: 'VND',
            paymentMethod: 'stripe',
            paymentStatus: 'processing',
            userId,
            tableOrderId: tableOrderId || null,
            orderId: orderId || null,
            processingDetails: {
                processor: 'stripe'
            }
        });

        // Create Stripe session
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'vnd',
                product_data: {
                    name: item.name,
                    description: item.description || ''
                },
                unit_amount: Math.round(item.price * 100) // Convert to cents
            },
            quantity: item.quantity
        }));

        const session = await stripe.checkout.sessions.create({
            client_reference_id: payment.id.toString(),
            customer_email: user.email,
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
            metadata: {
                tableOrderId: tableOrderId || '',
                orderId: orderId || '',
                userId: userId.toString()
            }
        });

        // Update payment with Stripe session ID
        await payment.update({
            stripeSessionId: session.id,
            stripeCustomerId: session.customer
        });

        return response.status(200).json({
            message: 'Tạo phiên thanh toán Stripe thành công',
            error: false,
            success: true,
            data: {
                sessionId: session.id,
                url: session.url,
                paymentId: payment.id
            }
        });

    } catch (error) {
        console.error('Error creating Stripe session:', error);
        return response.status(500).json({
            message: 'Lỗi khi tạo phiên thanh toán',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Handle Stripe webhook
// ═══════════════════════════════════════════════════════════════════
export async function handleStripeWebhook(request, response) {
    try {
        const sig = request.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;
        try {
            event = stripe.webhooks.constructEvent(
                request.body,
                sig,
                webhookSecret
            );
        } catch (error) {
            console.error('Webhook signature verification failed:', error);
            return response.status(400).send(`Webhook Error: ${error.message}`);
        }

        // Handle different event types
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            case 'charge.refunded':
                await handleRefund(event.data.object);
                break;
        }

        response.json({ received: true });

    } catch (error) {
        console.error('Error handling Stripe webhook:', error);
        response.status(500).json({ error: 'Webhook handler error' });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Handle checkout.session.completed event
// ═══════════════════════════════════════════════════════════════════
async function handleCheckoutSessionCompleted(session) {
    try {
        const payment = await Payment.findByPk(session.client_reference_id);
        if (!payment) {
            console.warn('Payment not found for session:', session.id);
            return;
        }

        const transaction = await sequelize.transaction();
        try {
            await payment.update({
                paymentStatus: 'completed',
                stripePaymentIntentId: session.payment_intent,
                processingDetails: {
                    ...payment.processingDetails,
                    processedAt: new Date()
                }
            }, { transaction });

            // Update table order
            if (payment.tableOrderId) {
                await TableOrder.update(
                    {
                        paymentStatus: 'paid',
                        paidAt: new Date(),
                        paymentId: payment.id
                    },
                    {
                        where: { id: payment.tableOrderId },
                        transaction
                    }
                );
            }

            await transaction.commit();
            console.log('✅ Payment completed for session:', session.id);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error handling checkout completion:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════
// Handle payment_intent.payment_failed event
// ═══════════════════════════════════════════════════════════════════
async function handlePaymentFailed(intent) {
    try {
        const payment = await Payment.findOne({
            where: {
                stripePaymentIntentId: intent.id
            }
        });

        if (payment) {
            await payment.update({
                paymentStatus: 'failed',
                failureReason: intent.last_payment_error?.message || 'Payment failed',
                failureCode: intent.last_payment_error?.code || 'unknown',
                retryCount: payment.retryCount + 1,
                lastRetryAt: new Date()
            });

            console.warn('Payment failed for intent:', intent.id);
        }
    } catch (error) {
        console.error('Error handling payment failure:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════
// Handle charge.refunded event
// ═══════════════════════════════════════════════════════════════════
async function handleRefund(charge) {
    try {
        const payment = await Payment.findOne({
            where: {
                stripePaymentIntentId: charge.payment_intent
            }
        });

        if (payment) {
            const refundId = charge.refunds.data[0]?.id;
            const refundAmount = charge.refunds.data[0]?.amount / 100; // Convert from cents

            await payment.update({
                refundStatus: 'completed',
                refundAmount: refundAmount,
                refundDetails: {
                    ...payment.refundDetails,
                    stripeRefundId: refundId,
                    refundCompletedAt: new Date()
                }
            });

            console.log('✅ Refund processed for payment:', payment.id);
        }
    } catch (error) {
        console.error('Error handling refund:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════
// Get payment details
// ═══════════════════════════════════════════════════════════════════
export async function getPaymentDetails(request, response) {
    try {
        const { paymentId } = request.params;
        const userId = request.userId;

        const payment = await Payment.findByPk(paymentId, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email', 'role']
                },
                {
                    model: TableOrder,
                    as: 'tableOrder'
                }
            ]
        });

        if (!payment) {
            return response.status(404).json({
                message: 'Không tìm thấy thông tin thanh toán',
                error: true,
                success: false
            });
        }

        // Authorization check (user's own payment or admin)
        const user = await User.findByPk(userId);
        if (payment.userId !== userId && user.role !== 'ADMIN') {
            return response.status(403).json({
                message: 'Bạn không có quyền xem thông tin này',
                error: true,
                success: false
            });
        }

        return response.status(200).json({
            message: 'Lấy thông tin thanh toán thành công',
            error: false,
            success: true,
            data: payment
        });

    } catch (error) {
        console.error('Error getting payment details:', error);
        return response.status(500).json({
            message: 'Lỗi khi lấy thông tin thanh toán',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Process refund
// ═══════════════════════════════════════════════════════════════════
export async function processRefund(request, response) {
    try {
        const { paymentId, amount, reason } = request.body;
        const userId = request.userId;

        // Check authorization
        const user = await checkAuthorization(userId, ['ADMIN', 'CASHIER']);
        if (!user) {
            return response.status(403).json({
                message: 'Bạn không có quyền thực hiện hành động này',
                error: true,
                success: false
            });
        }

        const payment = await Payment.findByPk(paymentId);
        if (!payment) {
            return response.status(404).json({
                message: 'Không tìm thấy thanh toán',
                error: true,
                success: false
            });
        }

        // Process refund based on payment method
        if (payment.paymentMethod === 'stripe') {
            const refund = await stripe.refunds.create({
                payment_intent: payment.stripePaymentIntentId,
                amount: Math.round(amount * 100)
            });

            await payment.update({
                refundStatus: 'processing',
                refundAmount: amount,
                refundReason: reason,
                refundDetails: {
                    ...payment.refundDetails,
                    stripeRefundId: refund.id,
                    refundRequestedBy: userId,
                    refundRequestedAt: new Date()
                }
            });
        } else {
            // Manual refund for cash
            await payment.update({
                refundStatus: 'completed',
                refundAmount: amount,
                refundReason: reason,
                refundDetails: {
                    ...payment.refundDetails,
                    refundApprovedBy: userId,
                    refundApprovedAt: new Date(),
                    refundCompletedAt: new Date()
                }
            });
        }

        return response.status(200).json({
            message: 'Hoàn tiền thành công',
            error: false,
            success: true,
            data: {
                paymentId: payment.id,
                refundAmount: payment.refundAmount,
                refundStatus: payment.refundStatus
            }
        });

    } catch (error) {
        console.error('Error processing refund:', error);
        return response.status(500).json({
            message: 'Lỗi khi xử lý hoàn tiền',
            error: true,
            success: false
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// Generate receipt
// ═══════════════════════════════════════════════════════════════════
export async function generateReceipt(request, response) {
    try {
        const { paymentId } = request.body;
        const userId = request.userId;

        const payment = await Payment.findByPk(paymentId, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email', 'phone']
                },
                {
                    model: TableOrder,
                    as: 'tableOrder'
                }
            ]
        });

        if (!payment) {
            return response.status(404).json({
                message: 'Không tìm thấy thanh toán',
                error: true,
                success: false
            });
        }

        // Generate receipt number if not exists
        if (!payment.receiptNumber) {
            const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            await payment.update({ receiptNumber });
        }

        const receipt = {
            receiptNumber: payment.receiptNumber,
            date: payment.createdAt,
            customer: {
                name: payment.user.name,
                email: payment.user.email,
                phone: payment.user.phone
            },
            items: payment.receiptDetails?.items || [],
            subtotal: payment.receiptDetails?.subtotal || 0,
            tax: payment.receiptDetails?.tax || 0,
            discount: payment.receiptDetails?.discount || 0,
            tip: payment.receiptDetails?.tip || 0,
            total: payment.amount,
            paymentMethod: payment.paymentMethod,
            paymentStatus: payment.paymentStatus,
            notes: payment.notes
        };

        return response.status(200).json({
            message: 'Tạo hóa đơn thành công',
            error: false,
            success: true,
            data: receipt
        });

    } catch (error) {
        console.error('Error generating receipt:', error);
        return response.status(500).json({
            message: 'Lỗi khi tạo hóa đơn',
            error: true,
            success: false
        });
    }
}

export default {
    markAsPaid,
    createStripeSession,
    handleStripeWebhook,
    getPaymentDetails,
    processRefund,
    generateReceipt
};
