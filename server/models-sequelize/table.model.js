import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const Table = sequelize.define('Table', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    tableNumber: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập số bàn'
            }
        }
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập sức chứa'
            },
            min: {
                args: [1],
                msg: 'Sức chứa phải lớn hơn 0'
            }
        }
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'available',
        validate: {
            isIn: {
                args: [['available', 'occupied', 'reserved', 'maintenance']],
                msg: 'Invalid status'
            }
        }
    },
    location: {
        type: DataTypes.STRING(100),
        defaultValue: ''
    },
    qrCode: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    qrCodeToken: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    tableAccountId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    description: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'tables',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['tableNumber'] },
        { fields: ['status'] },
        { fields: ['isActive'] },
        { fields: ['location'] }
    ]
});

export default Table;
