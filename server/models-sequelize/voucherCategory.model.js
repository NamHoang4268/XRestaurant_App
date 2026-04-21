import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const VoucherCategory = sequelize.define('VoucherCategory', {
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
    tableName: 'voucher_categories',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['voucher_id'] },
        { fields: ['category_id'] }
    ]
});

export default VoucherCategory;
