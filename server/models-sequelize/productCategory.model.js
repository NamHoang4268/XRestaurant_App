import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

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

export default ProductCategory;
