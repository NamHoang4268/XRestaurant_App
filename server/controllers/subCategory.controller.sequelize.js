import SubCategory from "../models-sequelize/subCategory.model.js"; // Sequelize model
import Category from "../models-sequelize/category.model.js"; // Sequelize model

export const addSubCategoryController = async (req, res) => {
    try {
        const { name, image, category } = req.body

        if (!name || !image || !category[0]) {
            return res.status(400).json({
                message: "Vui lòng điền đầy đủ các trường bắt buộc.",
                error: true,
                success: false
            })
        }

        // Sequelize: create
        // Note: In Sequelize, the category relationship is handled differently
        // We'll store the first category ID in the categoryId field
        const saveCategory = await SubCategory.create({
            name,
            image,
            categoryId: category[0] // Store first category ID
        })

        if (!saveCategory) {
            return res.status(500).json({
                message: "Không tạo được",
                error: true,
                success: false
            })
        }

        return res.json({
            message: "Thêm loại sản phẩm thành công",
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

export const getSubCategoryController = async (req, res) => {
    try {
        // Sequelize: findAll with include (populate equivalent)
        const data = await SubCategory.findAll({
            order: [['createdAt', 'DESC']],
            include: [{
                model: Category,
                as: 'category', // Assuming association alias
                attributes: ['id', 'name', 'image'] // Select specific fields
            }]
        })

        return res.json({
            message: 'Loại sản phẩm Data',
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

export const updateSubCategoryController = async (req, res) => {
    try {
        const { _id, name, image, category } = req.body

        // Sequelize: findByPk
        const check = await SubCategory.findByPk(_id)

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
            image,
            categoryId: category[0] // Update category ID
        })

        return res.json({
            message: 'Cập nhật loại sản phẩm thành công',
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

export const deleteSubCategoryController = async (req, res) => {
    try {
        const { _id } = req.body

        // Sequelize: findByPk and destroy
        const deleteSubCategory = await SubCategory.findByPk(_id)

        if (!deleteSubCategory) {
            return res.status(404).json({
                message: 'Không tìm thấy loại sản phẩm',
                error: true,
                success: false
            })
        }

        await deleteSubCategory.destroy()

        return res.json({
            message: 'Xóa loại sản phẩm thành công',
            data: deleteSubCategory,
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
