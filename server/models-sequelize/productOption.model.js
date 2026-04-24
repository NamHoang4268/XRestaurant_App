import { DataTypes } from 'sequelize';

export function initProductOptionModel(sequelize) {
    const ProductOption = sequelize.define('ProductOption', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    productId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'products',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    type: {
        type: DataTypes.STRING(20),
        defaultValue: 'radio',
        validate: {
            isIn: {
                args: [['radio', 'checkbox']],
                msg: 'Type must be radio or checkbox'
            }
        }
    },
    choices: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
    }
}, {
    tableName: 'product_options',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['productId'] }
    ]
});

    return ProductOption;
}
