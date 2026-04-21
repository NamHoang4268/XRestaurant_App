import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const ServiceRequest = sequelize.define('ServiceRequest', {
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
        onDelete: 'CASCADE'
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
    tableNumber: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    type: {
        type: DataTypes.STRING(20),
        defaultValue: 'cancel_item',
        validate: {
            isIn: {
                args: [['cancel_item', 'assistance', 'other']],
                msg: 'Invalid service request type'
            }
        }
    },
    note: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'accepted', 'done', 'rejected']],
                msg: 'Invalid status'
            }
        }
    },
    handledBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    handledAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'service_requests',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['tableId', 'status'] },
        { fields: ['createdAt'] }
    ]
});

export default ServiceRequest;
