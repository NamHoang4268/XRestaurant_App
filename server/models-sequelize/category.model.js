import { DataTypes } from 'sequelize';

export function initCategoryModel(sequelize) {
    const Category = sequelize.define('Category', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: {
                msg: 'Vui lòng nhập tên danh mục'
            },
            len: {
                args: [2, 100],
                msg: 'Tên danh mục phải từ 2 đến 100 ký tự'
            }
        }
    },
    description: {
        type: DataTypes.STRING(500),
        defaultValue: '',
        validate: {
            len: {
                args: [0, 500],
                msg: 'Mô tả không vượt quá 500 ký tự'
            }
        }
    },
    image: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    deletedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'categories',
    timestamps: true,
    underscored: false,
    indexes: [
        { fields: ['name'] },
        { fields: ['isDeleted'] }
    ]
});

    return Category;
}
