import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const Customer = sequelize.define('Customer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        defaultValue: ''
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true
    },
    totalPoints: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    visitCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    lastVisit: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'customers',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['phone'] },
        { fields: ['lastVisit'] }
    ]
});

export default Customer;
