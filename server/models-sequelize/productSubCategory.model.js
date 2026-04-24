import { DataTypes } from 'sequelize';

export function initProductSubCategoryModel(sequelize) {
    const ProductSubCategory = sequelize.define('ProductSubCategory', {
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
    sub_category_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'sub_categories',
            key: 'id'
        },
        onDelete: 'CASCADE'
    }
}, {
    tableName: 'product_sub_categories',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['product_id'] },
        { fields: ['sub_category_id'] }
    ]
    });

    return ProductSubCategory;
}
