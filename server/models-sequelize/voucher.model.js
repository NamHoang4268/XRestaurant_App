import { DataTypes } from 'sequelize';

export function initVoucherModel(sequelize) {
    const Voucher = sequelize.define('Voucher', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: {
                msg: 'Voucher code is required'
            }
        }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Voucher name is required'
            }
        }
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    discountType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            isIn: {
                args: [['percentage', 'fixed']],
                msg: 'Discount type must be percentage or fixed'
            }
        }
    },
    discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: {
                args: [0],
                msg: 'Discount value cannot be negative'
            }
        }
    },
    minOrderValue: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    maxDiscount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
            isAfterStartDate(value) {
                if (this.startDate && value <= this.startDate) {
                    throw new Error('End date must be after start date');
                }
            }
        }
    },
    usageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    usageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isFirstTimeCustomer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    applyForAllProducts: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'vouchers',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['code', 'isActive', 'startDate', 'endDate'] },
        { fields: ['startDate', 'endDate'] }
    ]
    });

    return Voucher;
}
