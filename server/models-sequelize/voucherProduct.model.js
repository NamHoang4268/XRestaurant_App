import { DataTypes } from 'sequelize';

export function initVoucherProductModel(sequelize) {
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

    return VoucherProduct;
}
