import { DataTypes } from 'sequelize';

export function initProductCategoryModel(sequelize) {
    const ProductCategory = sequelize.define('ProductCategory', {
    product_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'products',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    category_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'categories',
            key: 'id'
        },
        onDelete: 'CASCADE'
    }
}, {
    tableName: 'product_categories',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['product_id'] },
        { fields: ['category_id'] }
    ]
    });

    return ProductCategory;
}
