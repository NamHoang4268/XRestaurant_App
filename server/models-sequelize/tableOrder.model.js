import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const TableOrder = sequelize.define('TableOrder', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    tableId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'tables',
            key: 'id'
        },
        onDelete: 'RESTRICT'
    },
    tableNumber: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    customerId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'customers',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    subTotal: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    voucherId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'vouchers',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    total: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    status: {
        type: DataTypes.STRING(30),
        defaultValue: 'active',
        validate: {
            isIn: {
                args: [['active', 'pending_payment', 'paid', 'cancelled', 'Chờ xử lý', 'Đang chuẩn bị', 'Đã phục vụ', 'Đang chờ thanh toán', 'Chờ thanh toán', 'Đã hủy']],
                msg: 'Invalid status'
            }
        }
    },
    sentToKitchenAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    paymentRequest: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            isIn: {
                args: [['at_counter', 'online']],
                msg: 'Payment request must be at_counter or online'
            }
        }
    },
    checkedOutAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    paidAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    paymentMethod: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            isIn: {
                args: [['cash', 'online']],
                msg: 'Payment method must be cash or online'
            }
        }
    },
    paymentStatus: {
        type: DataTypes.STRING(30),
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'paid', 'refunded', 'Chờ xử lý', 'Đang chuẩn bị', 'Đã phục vụ', 'Đang chờ thanh toán', 'Chờ thanh toán', 'Đã hủy']],
                msg: 'Invalid payment status'
            }
        }
    },
    paymentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'payments',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    stripeSessionId: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    expectedTotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    billChangedAfterPayment: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'table_orders',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['tableId', 'status'] },
        { fields: ['tableNumber', 'status'] },
        { fields: ['customerId'] },
        { fields: ['paymentStatus'] },
        { fields: ['createdAt'] },
        { fields: ['stripeSessionId'] }
    ]
});

export default TableOrder;
