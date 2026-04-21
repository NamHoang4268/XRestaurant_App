import Product from '../models-sequelize/product.model.js'; // Sequelize model
import Category from '../models-sequelize/category.model.js'; // Sequelize model
import { Op } from 'sequelize'; // For Sequelize operators

export const addCategoryController = async (req, res) => {
    try {
        const { name, description, image } = req.body

        if (!name || !image) {
            return res.status(400).json({
                message: "Vui lòng điền đầy đủ các trường bắt buộc.",
                error: true,
                success: false
            })
        }

        // Sequelize: Check if category with the same name already exists (case insensitive)
        const existingCategory = await Category.findOne({
            where: {
                name: {
                    [Op.iLike]: name // Case-insensitive LIKE (PostgreSQL)
                }
            }
        });

        if (existingCategory) {
            return res.status(400).json({
                message: `Danh mục "${name}" đã tồn tại. Vui lòng chọn tên khác.`,
                error: true,
                success: false
            });
        }

        // Sequelize: create
        const saveCategory = await Category.create({
            name,
            image,
            description: description || '',
        })

        if (!saveCategory) {
            return res.status(500).json({
                message: "Không tạo được danh mục",
                error: true,
                success: false
            })
        }

        return res.json({
            message: "Thêm danh mục thành công",
            data: saveCategory,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

export const getCategoryController = async (req, res) => {
    try {
        // Sequelize: Only get categories that are not deleted
        const data = await Category.findAll({
            where: { isDeleted: false },
            order: [['createdAt', 'DESC']]
        })

        return res.json({
            message: 'Danh mục Data',
            data: data,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

export const updateCategoryController = async (req, res) => {
    try {
        const { _id, name, description, image } = req.body

        // Sequelize: findByPk
        const check = await Category.findByPk(_id)

        if (!check) {
            return res.status(400).json({
                message: 'Không tìm thấy _id',
                error: true,
                success: false
            })
        }

        // Sequelize: update
        await check.update({
            name,
            description,
            image
        })

        return res.json({
            message: 'Cập nhật danh mục thành công',
            error: false,
            success: true,
            data: check
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Soft delete category
export const deleteCategoryController = async (req, res) => {
    try {
        const { _id } = req.body

        // Sequelize: findByPk
        const category = await Category.findByPk(_id)

        if (!category) {
            return res.status(404).json({
                message: "Không tìm thấy danh mục",
                error: true,
                success: false
            })
        }

        // Sequelize: Soft delete - set isDeleted to true
        await category.update({
            isDeleted: true,
            deletedAt: new Date()
        })

        return res.json({
            message: 'Xóa danh mục thành công',
            data: category,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Get deleted categories
export const getDeletedCategoriesController = async (req, res) => {
    try {
        // Sequelize: findAll with where clause
        const data = await Category.findAll({
            where: { isDeleted: true },
            order: [['deletedAt', 'DESC']]
        })

        return res.json({
            message: 'Danh mục đã xóa',
            data: data,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Restore deleted category
export const restoreCategoryController = async (req, res) => {
    try {
        const { _id } = req.body

        // Sequelize: findByPk
        const category = await Category.findByPk(_id)

        if (!category) {
            return res.status(404).json({
                message: "Không tìm thấy danh mục",
                error: true,
                success: false
            })
        }

        if (!category.isDeleted) {
            return res.status(400).json({
                message: "Danh mục chưa bị xóa",
                error: true,
                success: false
            })
        }

        // Sequelize: Restore - set isDeleted to false
        await category.update({
            isDeleted: false,
            deletedAt: null
        })

        return res.json({
            message: 'Khôi phục danh mục thành công',
            data: category,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Hard delete category (permanently delete)
export const hardDeleteCategoryController = async (req, res) => {
    try {
        const { _id } = req.body

        // Sequelize: Check if category is used in products
        // Need to check ProductCategory junction table
        const checkProduct = await Product.count({
            include: [{
                model: Category,
                as: 'categories', // Assuming association alias
                where: { id: _id },
                required: true
            }]
        })

        if (checkProduct > 0) {
            return res.status(400).json({
                message: "Danh mục đã được sử dụng, không thể xóa vĩnh viễn",
                error: true,
                success: false
            })
        }

        // Sequelize: destroy (hard delete)
        const deleteCategory = await Category.findByPk(_id)

        if (!deleteCategory) {
            return res.status(404).json({
                message: "Không tìm thấy danh mục",
                error: true,
                success: false
            })
        }

        await deleteCategory.destroy()

        return res.json({
            message: 'Xóa vĩnh viễn danh mục thành công',
            data: deleteCategory,
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}
