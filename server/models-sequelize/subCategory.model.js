import { DataTypes } from 'sequelize';

export function initSubCategoryModel(sequelize) {
    const SubCategory = sequelize.define('SubCategory', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        defaultValue: ''
    },
    image: {
        type: DataTypes.TEXT,
        defaultValue: ''
    }
}, {
    tableName: 'sub_categories',
    timestamps: true,
    underscored: false
});

    return SubCategory;
}
