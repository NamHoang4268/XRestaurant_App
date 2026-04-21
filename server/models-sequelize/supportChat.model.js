import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const SupportChat = sequelize.define('SupportChat', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    conversationId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    customerName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    customerId: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    tableNumber: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    assignedWaiterId: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    assignedWaiterName: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    assignedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    requestStatus: {
        type: DataTypes.STRING(20),
        defaultValue: 'waiting',
        validate: {
            isIn: {
                args: [['waiting', 'assigned', 'active', 'closed']],
                msg: 'Invalid request status'
            }
        }
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'open',
        validate: {
            isIn: {
                args: [['open', 'closed']],
                msg: 'Status must be open or closed'
            }
        }
    },
    unreadByWaiter: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    unreadByCustomer: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lastMessage: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    lastMessageAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    expiresAt: {
        type: DataTypes.DATE,
        defaultValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
}, {
    tableName: 'support_chats',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['customerId', 'status', 'lastMessageAt'] },
        { fields: ['expiresAt'] },
        { fields: ['conversationId'] }
    ]
});

export default SupportChat;
