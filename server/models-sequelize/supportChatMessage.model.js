import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const SupportChatMessage = sequelize.define('SupportChatMessage', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    supportChatId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'support_chats',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    sender: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    senderName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    senderRole: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            isIn: {
                args: [['customer', 'waiter', 'admin']],
                msg: 'Sender role must be customer, waiter, or admin'
            }
        }
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'support_chat_messages',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['supportChatId', 'createdAt'] }
    ]
});

export default SupportChatMessage;
