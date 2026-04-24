import { DataTypes } from 'sequelize';

export function initVoucherUsageModel(sequelize) {
    const VoucherUsage = sequelize.define('VoucherUsage', {
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
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    usedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'voucher_usage',
    timestamps: false,
    underscored: false,
    indexes: [
        { fields: ['voucher_id'] },
        { fields: ['user_id'] },
        { fields: ['usedAt'] }
    ]
    });

    return VoucherUsage;
}
