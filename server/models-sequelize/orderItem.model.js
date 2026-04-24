import { DataTypes } from 'sequelize';

export function initOrderItemModel(sequelize) {
    const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    tableOrderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'table_orders',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    productId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'products',
            key: 'id'
        },
        onDelete: 'RESTRICT'
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: {
                args: [1],
                msg: 'Quantity must be at least 1'
            }
        }
    },
    note: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    kitchenStatus: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'cooking', 'ready', 'served']],
                msg: 'Invalid kitchen status'
            }
        }
    },
    sentAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    cookingStartAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    readyAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    servedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    addedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'order_items',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['tableOrderId'] },
        { fields: ['productId'] },
        { fields: ['kitchenStatus'] }
    ]
});

    return OrderItem;
}
