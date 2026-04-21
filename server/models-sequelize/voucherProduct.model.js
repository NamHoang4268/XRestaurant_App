import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const VoucherProduct = sequelize.define('VoucherProduct', {
    voucher_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'vouchers',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    product_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'products',
            key: 'id'
        },
        onDelete: 'CASCADE'
    }
}, {
    tableName: 'voucher_products',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['voucher_id'] },
        { fields: ['product_id'] }
    ]
});

export default VoucherProduct;
