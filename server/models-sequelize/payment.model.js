import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const Payment = sequelize.define('Payment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: {
                args: [0],
                msg: 'Amount cannot be negative'
            },
            notEmpty: {
                msg: 'Provide payment amount'
            }
        }
    },
    currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'VND',
        validate: {
            isIn: {
                args: [['VND', 'USD']],
                msg: 'Currency must be VND or USD'
            }
        }
    },
    paymentMethod: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            isIn: {
                args: [['cash', 'stripe']],
                msg: 'Payment method must be cash or stripe'
            },
            notEmpty: {
                msg: 'Provide payment method'
            }
        }
    },
    paymentStatus: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'processing', 'completed', 'failed', 'refunded']],
                msg: 'Invalid payment status'
            }
        }
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    tableOrderId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'table_orders',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    stripePaymentIntentId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true
    },
    stripeSessionId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true
    },
    stripeCustomerId: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    processor: {
        type: DataTypes.STRING(20),
        defaultValue: 'local',
        validate: {
            isIn: {
                args: [['stripe', 'local']],
                msg: 'Processor must be stripe or local'
            }
        }
    },
    processedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    receiptNumber: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true
    },
    refundStatus: {
        type: DataTypes.STRING(20),
        defaultValue: 'none',
        validate: {
            isIn: {
                args: [['none', 'partial', 'full']],
                msg: 'Invalid refund status'
            }
        }
    },
    refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        validate: {
            min: {
                args: [0],
                msg: 'Refund amount cannot be negative'
            }
        }
    },
    refundReason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    refundDetails: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    failureReason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    failureCode: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    retryCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
            min: {
                args: [0],
                msg: 'Retry count cannot be negative'
            }
        }
    },
    lastRetryAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'payments',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['userId', 'createdAt'] },
        { fields: ['paymentStatus'] },
        { fields: ['stripePaymentIntentId'] },
        { fields: ['tableOrderId'] },
        { fields: ['createdAt'] }
    ]
});

export default Payment;
