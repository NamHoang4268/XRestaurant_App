import { DataTypes } from 'sequelize';

export function initProductModel(sequelize) {
    const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    images: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: []
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    moreDetails: {
        type: DataTypes.JSONB,
        defaultValue: {}
    },
    publish: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'available',
        validate: {
            isIn: {
                args: [['available', 'out_of_stock', 'seasonal']],
                msg: 'Invalid status'
            }
        }
    },
    preparationTime: {
        type: DataTypes.INTEGER,
        defaultValue: 15,
        validate: {
            min: {
                args: [0],
                msg: 'Preparation time cannot be negative'
            }
        }
    },
    isFeatured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'products',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['status'] },
        { fields: ['isFeatured'] },
        { fields: ['price'] }
    ]
});

    return Product;
}
