import { DataTypes } from 'sequelize';

export function initBookingModel(sequelize) {
    const Booking = sequelize.define('Booking', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    customerName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập tên khách hàng'
            }
        }
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập số điện thoại'
            }
        }
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    tableId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'tables',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        validate: {
            notEmpty: {
                msg: 'Vui lòng chọn bàn'
            }
        }
    },
    numberOfGuests: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập số người'
            },
            min: {
                args: [1],
                msg: 'Số người phải lớn hơn 0'
            }
        }
    },
    bookingDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng chọn ngày đặt bàn'
            }
        }
    },
    bookingTime: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng chọn giờ đặt bàn'
            }
        }
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'confirmed', 'cancelled', 'completed']],
                msg: 'Invalid status'
            }
        }
    },
    specialRequests: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    cancelledBy: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
            isIn: {
                args: [['customer', 'admin', 'system']],
                msg: 'Invalid cancelled by value'
            }
        }
    },
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    createdBy: {
        type: DataTypes.STRING(20),
        defaultValue: 'customer',
        validate: {
            isIn: {
                args: [['customer', 'admin']],
                msg: 'Created by must be customer or admin'
            }
        }
    },
    preOrderId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'table_orders',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    hasPreOrder: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    preOrderTotal: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    }
}, {
    tableName: 'bookings',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['bookingDate', 'bookingTime'] },
        { fields: ['tableId'] },
        { fields: ['status'] },
        { fields: ['userId'] },
        { fields: ['phone'] },
        { fields: ['email'] }
    ]
    });

    return Booking;
}
