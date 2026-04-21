import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';

const sequelize = getSequelize();

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Provide name'
            }
        }
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: {
                msg: 'Provide email'
            },
            isEmail: {
                msg: 'Invalid email format'
            }
        }
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
    },
    googleId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true
    },
    avatar: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    mobile: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    verifyEmail: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    lastLoginDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING(20),
        defaultValue: 'Active',
        validate: {
            isIn: {
                args: [['Active', 'Inactive', 'Suspended']],
                msg: 'Status must be Active, Inactive, or Suspended'
            }
        }
    },
    forgotPasswordOtp: {
        type: DataTypes.STRING(10),
        allowNull: true
    },
    forgotPasswordExpiry: {
        type: DataTypes.DATE,
        allowNull: true
    },
    role: {
        type: DataTypes.STRING(20),
        defaultValue: 'CUSTOMER',
        validate: {
            isIn: {
                args: [['ADMIN', 'WAITER', 'CHEF', 'CASHIER', 'CUSTOMER', 'TABLE']],
                msg: 'Invalid role'
            }
        }
    },
    employeeId: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true
    },
    hireDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    position: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    employeeStatus: {
        type: DataTypes.STRING(20),
        defaultValue: 'active',
        validate: {
            isIn: {
                args: [['active', 'inactive', 'on_leave']],
                msg: 'Invalid employee status'
            }
        }
    },
    linkedTableId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'tables',
            key: 'id'
        },
        onDelete: 'SET NULL'
    },
    rewardsPoint: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
            min: {
                args: [0],
                msg: 'Rewards points cannot be negative'
            }
        }
    },
    tierLevel: {
        type: DataTypes.STRING(20),
        defaultValue: 'bronze',
        validate: {
            isIn: {
                args: [['bronze', 'silver', 'gold', 'platinum']],
                msg: 'Invalid tier level'
            }
        }
    },
    pointsMultiplier: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 1.0,
        validate: {
            min: {
                args: [1.0],
                msg: 'Points multiplier must be at least 1.0'
            }
        }
    }
}, {
    tableName: 'users',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['email'] },
        { fields: ['tierLevel'] },
        { fields: ['rewardsPoint'] },
        { fields: ['role'] },
        { fields: ['employeeId'] }
    ]
});

// Instance methods
User.prototype.addRewardsPoints = async function(points) {
    this.rewardsPoint += points;
    await this.updateTierLevel();
    return this.save();
};

User.prototype.updateTierLevel = function() {
    const points = this.rewardsPoint;
    let newTier = 'bronze';
    let multiplier = 1.0;

    if (points >= 10000) {
        newTier = 'platinum';
        multiplier = 2.0;
    } else if (points >= 5000) {
        newTier = 'gold';
        multiplier = 1.5;
    } else if (points >= 2000) {
        newTier = 'silver';
        multiplier = 1.2;
    }

    this.tierLevel = newTier;
    this.pointsMultiplier = multiplier;
};

export default User;
