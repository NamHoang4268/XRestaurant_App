import Product from "../models-sequelize/product.model.js"; // Sequelize model
import Category from "../models-sequelize/category.model.js"; // Sequelize model
import SubCategory from "../models-sequelize/subCategory.model.js"; // Sequelize model
import ProductOption from "../models-sequelize/productOption.model.js"; // Sequelize model
import { Op } from 'sequelize'; // For Sequelize operators
import sequelize from '../config/database.js'; // For transactions

export const addProductController = async (req, res) => {
    try {
        const { name, image, category, subCategory, unit, stock,
            price, discount, description, more_details, options } = req.body

        if (!name || !image[0] || !category[0] || !unit || !stock || !price) {
            return res.status(400).json({
                message: "Vui lòng nhập đầy đủ thông tin bắt buộc",
                error: true,
                success: false
            })
        }

        // Sequelize: Use transaction for product creation with associations
        const transaction = await sequelize.transaction();

        try {
            // Create product
            const saveProduct = await Product.create({
                name,
                image, // TEXT[] array
                unit,
                stock,
                price,
                discount: discount || 0,
                description: description || '',
                moreDetails: more_details || {} // JSONB field
            }, { transaction });

            // Create product-category associations (many-to-many)
            if (category && category.length > 0) {
                const categories = await Category.findAll({
                    where: { id: category },
                    transaction
                });
                await saveProduct.addCategories(categories, { transaction });
            }

            // Create product-subcategory associations (many-to-many)
            if (subCategory && subCategory.length > 0) {
                const subCategories = await SubCategory.findAll({
                    where: { id: subCategory },
                    transaction
                });
                await saveProduct.addSubCategories(subCategories, { transaction });
            }

            // Create product options (normalized from embedded array)
            if (options && options.length > 0) {
                const productOptions = options.map(option => ({
                    productId: saveProduct.id,
                    name: option.name,
                    choices: option.choices // JSONB field
                }));
                await ProductOption.bulkCreate(productOptions, { transaction });
            }

            await transaction.commit();

            // Fetch complete product with associations
            const completeProduct = await Product.findByPk(saveProduct.id, {
                include: [
                    { model: Category, as: 'categories' },
                    { model: SubCategory, as: 'subCategories' },
                    { model: ProductOption, as: 'productOptions' }
                ]
            });

            return res.json({
                message: "Thêm sản phẩm thành công",
                data: completeProduct,
                error: false,
                success: true
            })

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

export const getProductController = async (req, res) => {
    try {
        let { page, limit, search, minPrice, maxPrice, sort, category } = req.body;

        if (!page) page = 1;
        if (!limit) limit = 10;

        // Build where clause
        const where = {};

        // Add search query if provided
        if (search && search.trim()) {
            const searchTerm = search.trim();
            // Sequelize: Use Op.iLike for case-insensitive search (PostgreSQL)
            where[Op.or] = [
                { name: { [Op.iLike]: `%${searchTerm}%` } },
                { description: { [Op.iLike]: `%${searchTerm}%` } }
            ];
        }

        // Add price range filter
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price[Op.gte] = Number(minPrice);
            if (maxPrice) where.price[Op.lte] = Number(maxPrice);
        }

        // Build order clause
        let order = [];
        switch (sort) {
            case 'price_asc':
                order = [['price', 'ASC']];
                break;
            case 'price_desc':
                order = [['price', 'DESC']];
                break;
            case 'name_asc':
                order = [['name', 'ASC']];
                break;
            default: // 'newest' or any other value
                order = [['createdAt', 'DESC']];
        }

        const offset = (page - 1) * limit;

        // Sequelize: findAndCountAll with include (populate)
        const { count: totalCount, rows: data } = await Product.findAndCountAll({
            where,
            include: [
                {
                    model: Category,
                    as: 'categories',
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] }, // Exclude junction table fields
                    ...(category && category !== 'all' ? { where: { id: category }, required: true } : {})
                },
                {
                    model: SubCategory,
                    as: 'subCategories',
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] }
                }
            ],
            order,
            offset,
            limit: parseInt(limit),
            distinct: true // Important for correct count with associations
        });

        return res.json({
            message: 'Dữ liệu sản phẩm',
            data: data,
            totalCount: totalCount,
            totalNoPage: Math.ceil(totalCount / limit),
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

export const getProductByCategory = async (request, response) => {
    try {
        let { id } = request.body;

        // Nếu id không tồn tại hoặc rỗng → trả về mảng trống
        if (!id || (Array.isArray(id) && id.length === 0)) {
            return response.json({
                message: "Danh sách sản phẩm theo danh mục",
                data: [],
                error: false,
                success: true
            });
        }

        // Đảm bảo id luôn là mảng
        if (!Array.isArray(id)) {
            id = [id];
        }

        // Sequelize: findAll with include and where on association
        const product = await Product.findAll({
            include: [
                {
                    model: Category,
                    as: 'categories',
                    where: { id: { [Op.in]: id } },
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] },
                    required: true // INNER JOIN
                },
                {
                    model: SubCategory,
                    as: 'subCategories',
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] }
                }
            ],
            limit: 15
        });

        return response.json({
            message: "Category Product List",
            data: product,
            error: false,
            success: true
        });
    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
};

export const getProductByCategoryAndSubCategory = async (request, response) => {
    try {
        let { categoryId, subCategoryId, page, limit, sort, minPrice, maxPrice } = request.body;

        if (!categoryId || !subCategoryId) {
            return response.status(400).json({
                message: "Vui lòng cung cấp categoryId và subCategoryId",
                error: true,
                success: false
            })
        }

        if (!page) page = 1;
        if (!limit) limit = 10;

        // Đảm bảo là mảng
        const categoryIds = Array.isArray(categoryId) ? categoryId : [categoryId];
        const subCategoryIds = Array.isArray(subCategoryId) ? subCategoryId : [subCategoryId];

        // Build where clause for price filter
        const where = {};
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {};
            if (minPrice !== undefined) where.price[Op.gte] = Number(minPrice);
            if (maxPrice !== undefined) where.price[Op.lte] = Number(maxPrice);
        }

        // Build sort options
        let order = [];
        switch (sort) {
            case 'price_asc':
                order = [['price', 'ASC']];
                break;
            case 'price_desc':
                order = [['price', 'DESC']];
                break;
            case 'name_asc':
                order = [['name', 'ASC']];
                break;
            default: // 'newest' or any other value
                order = [['createdAt', 'DESC']];
        }

        const offset = (page - 1) * limit;

        // Sequelize: findAndCountAll with multiple includes
        const { count: dataCount, rows: data } = await Product.findAndCountAll({
            where,
            include: [
                {
                    model: Category,
                    as: 'categories',
                    where: { id: { [Op.in]: categoryIds } },
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] },
                    required: true
                },
                {
                    model: SubCategory,
                    as: 'subCategories',
                    where: { id: { [Op.in]: subCategoryIds } },
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] },
                    required: true
                }
            ],
            order,
            offset,
            limit: parseInt(limit),
            distinct: true
        });

        return response.json({
            message: "Danh sách sản phẩm",
            data: data,
            totalCount: dataCount,
            page: page,
            limit: limit,
            success: true,
            error: false
        })

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

export const getProductDetails = async (request, response) => {
    try {
        const { productId } = request.body

        // Sequelize: findByPk with include
        const product = await Product.findByPk(productId, {
            include: [
                {
                    model: Category,
                    as: 'categories',
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] }
                },
                {
                    model: SubCategory,
                    as: 'subCategories',
                    attributes: ['id', 'name', 'image'],
                    through: { attributes: [] }
                },
                {
                    model: ProductOption,
                    as: 'productOptions',
                    attributes: ['id', 'name', 'choices']
                }
            ]
        });

        return response.json({
            message: "Chi tiết sản phẩm",
            data: product,
            error: false,
            success: true
        })

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Update Product
export const updateProductDetails = async (request, response) => {
    try {
        const { _id, category, subCategory, options, ...updateData } = request.body

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp mã sản phẩm (_id)",
                error: true,
                success: false
            })
        }

        // Sequelize: Use transaction for update with associations
        const transaction = await sequelize.transaction();

        try {
            // Find product
            const product = await Product.findByPk(_id, { transaction });

            if (!product) {
                await transaction.rollback();
                return response.status(404).json({
                    message: "Không tìm thấy sản phẩm",
                    error: true,
                    success: false
                });
            }

            // Update product fields
            await product.update(updateData, { transaction });

            // Update categories if provided
            if (category) {
                const categories = await Category.findAll({
                    where: { id: category },
                    transaction
                });
                await product.setCategories(categories, { transaction });
            }

            // Update subcategories if provided
            if (subCategory) {
                const subCategories = await SubCategory.findAll({
                    where: { id: subCategory },
                    transaction
                });
                await product.setSubCategories(subCategories, { transaction });
            }

            // Update options if provided
            if (options) {
                // Delete existing options
                await ProductOption.destroy({
                    where: { productId: _id },
                    transaction
                });

                // Create new options
                if (options.length > 0) {
                    const productOptions = options.map(option => ({
                        productId: _id,
                        name: option.name,
                        choices: option.choices
                    }));
                    await ProductOption.bulkCreate(productOptions, { transaction });
                }
            }

            await transaction.commit();

            return response.json({
                message: "Cập nhật sản phẩm thành công",
                data: product,
                error: false,
                success: true
            })

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Delete Product
export const deleteProductDetails = async (request, response) => {
    try {
        const { _id } = request.body

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp mã _id",
                error: true,
                success: false
            })
        }

        // Sequelize: destroy (hard delete)
        const product = await Product.findByPk(_id);

        if (!product) {
            return response.status(404).json({
                message: "Không tìm thấy sản phẩm",
                error: true,
                success: false
            });
        }

        await product.destroy();

        return response.json({
            message: "Xóa sản phẩm thành công",
            error: false,
            success: true,
            data: product
        })
    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Search Product
export const searchProduct = async (request, response) => {
    try {
        let { search, page = 1, limit = 12, minPrice, maxPrice, sort = 'newest', category } = request.body;

        const offset = (page - 1) * limit;

        // Trim chuỗi để loại bỏ khoảng trắng đầu/cuối
        search = search?.trim();

        // Không có nội dung tìm kiếm
        if (!search) {
            return response.status(400).json({
                message: 'Vui lòng nhập từ khóa tìm kiếm',
                error: true,
                success: false,
            });
        }

        // Build where clause
        const where = {
            [Op.or]: [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ]
        };

        // Add price range filter
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price[Op.gte] = Number(minPrice);
            if (maxPrice) where.price[Op.lte] = Number(maxPrice);
        }

        // Build sort options
        let order = [];
        switch (sort) {
            case 'price_asc':
                order = [['price', 'ASC']];
                break;
            case 'price_desc':
                order = [['price', 'DESC']];
                break;
            case 'name_asc':
                order = [['name', 'ASC']];
                break;
            default:
                order = [['createdAt', 'DESC']];
        }

        // Build include with optional category filter
        const include = [
            {
                model: Category,
                as: 'categories',
                attributes: ['id', 'name', 'image'],
                through: { attributes: [] },
                ...(category ? { where: { id: category }, required: true } : {})
            },
            {
                model: SubCategory,
                as: 'subCategories',
                attributes: ['id', 'name', 'image'],
                through: { attributes: [] }
            }
        ];

        // Execute search + count
        const { count: total, rows: products } = await Product.findAndCountAll({
            where,
            include,
            order,
            offset,
            limit: parseInt(limit),
            distinct: true
        });

        const totalPage = Math.ceil(total / limit);

        return response.json({
            message: 'Kết quả tìm kiếm',
            data: products,
            totalCount: total,
            totalNoPage: totalPage,
            currentPage: page,
            success: true,
            error: false,
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || 'Lỗi server',
            error: true,
            success: false,
        });
    }
};

// Get initial products for homepage
export const getInitialProducts = async (req, res) => {
    try {
        const { page = 1, limit = 12, minPrice, maxPrice, sort = 'newest', category } = req.body;
        const offset = (page - 1) * limit;

        // Build where clause
        const where = { publish: true }; // Only get published products

        // Add price range filter if provided
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price[Op.gte] = Number(minPrice);
            if (maxPrice) where.price[Op.lte] = Number(maxPrice);
        }

        // Build sort object based on sort parameter
        let order = [];
        switch (sort) {
            case 'price_asc':
                order = [['price', 'ASC']];
                break;
            case 'price_desc':
                order = [['price', 'DESC']];
                break;
            case 'name_asc':
                order = [['name', 'ASC']];
                break;
            case 'newest':
            default:
                order = [['createdAt', 'DESC']];
                break;
        }

        // Build include with optional category filter
        const include = [
            {
                model: Category,
                as: 'categories',
                attributes: ['id', 'name', 'image'],
                through: { attributes: [] },
                ...(category ? { where: { id: category }, required: true } : {})
            },
            {
                model: SubCategory,
                as: 'subCategories',
                attributes: ['id', 'name', 'image'],
                through: { attributes: [] }
            }
        ];

        const { count: total, rows: products } = await Product.findAndCountAll({
            where,
            include,
            order,
            offset,
            limit: parseInt(limit),
            distinct: true
        });

        const totalPage = Math.ceil(total / limit);

        return res.json({
            message: 'Lấy sản phẩm thành công',
            data: products,
            totalPage,
            totalCount: total,
            success: true,
            error: false,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || 'Lỗi server',
            error: true,
            success: false,
        });
    }
};
