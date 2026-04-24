import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import { simpleAuth, requireAdmin, getUserInfo } from './middleware/simple-auth.js';
import { listImages, listDocuments, getDocumentSignedUrl, getImageUrl } from './routes/s3-media.js';
import userRouter from './route/user.route.js';

// Database imports
import { initializeDatabase, getSequelize, closeDatabase, setupDatabaseHealthCheck } from './config/database.js';
import { initializeModels } from './models-sequelize/index.js';
import { defineAssociations } from './models-sequelize/associations.js';

// Models will be initialized after database connection
let Category, Product, Table, TableOrder, OrderItem;

const app = express();

// CORS
const getAllowedOrigins = () => {
    const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
    return raw.split(',').map((u) => u.trim()).filter(Boolean);
};

const corsOptions = {
    origin: (origin, callback) => {
        const allowed = getAllowedOrigins();
        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('[CORS] Blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-username', 'x-password', 'Cookie'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(helmet({ crossOriginResourcePolicy: false }));

const PORT = process.env.PORT || 8080;

// ============================================
// DATABASE INITIALIZATION
// ============================================

let dbInitialized = false;

async function initializeApp() {
    try {
        console.log('🚀 Initializing XRestaurant Server with PostgreSQL...');
        
        // Initialize database connection
        const sequelize = await initializeDatabase();
        
        // Initialize all models with the sequelize instance
        console.log('📦 Initializing models...');
        const models = initializeModels(sequelize);
        
        // Define associations between models
        console.log('🔗 Defining model associations...');
        defineAssociations(models);
        
        // Assign models to module-level variables for route handlers
        Category = models.Category;
        Product = models.Product;
        Table = models.Table;
        TableOrder = models.TableOrder;
        OrderItem = models.OrderItem;
        
        // Setup health monitoring
        setupDatabaseHealthCheck(sequelize);
        
        dbInitialized = true;
        console.log('✅ Database and models initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        console.error('🔄 Server will continue with limited functionality');
        // Don't exit - allow server to start for health checks
    }
}

// Initialize database on startup
initializeApp();

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

// Root
app.get("/", (req, res) => {
    res.json({ 
        message: "XRestaurant Server - PostgreSQL Production",
        version: "2.0.0-postgresql",
        mode: "postgresql + s3",
        database: dbInitialized ? "PostgreSQL (Connected)" : "PostgreSQL (Connection Failed)",
        storage: "S3 (media + documents)",
        authentication: "Simple Auth (user1/user2)"
    });
});

// Health check
app.get("/health", async (req, res) => {
    let dbStatus = "disconnected";
    let dbDetails = {};
    
    if (dbInitialized) {
        try {
            const sequelize = getSequelize();
            await sequelize.query('SELECT 1');
            dbStatus = "connected";
            
            // Get basic database info
            const [results] = await sequelize.query(`
                SELECT 
                    schemaname,
                    tablename,
                    tableowner
                FROM pg_tables 
                WHERE schemaname = 'public' 
                ORDER BY tablename
                LIMIT 5
            `);
            
            dbDetails = {
                status: "healthy",
                tablesFound: results.length,
                sampleTables: results.map(r => r.tablename)
            };
        } catch (error) {
            dbStatus = "error";
            dbDetails = { error: error.message };
        }
    }
    
    res.json({ 
        status: "healthy", 
        service: "xrestaurant-backend",
        database: dbStatus,
        databaseDetails: dbDetails,
        uptime: process.uptime(),
        authentication: "enabled",
        s3: "enabled"
    });
});

// ============================================
// USER AUTH ROUTES (Public — no auth required)
// Register/Login must be mounted BEFORE the auth middleware
// ============================================
app.use('/api/user', userRouter);

// ============================================
// APPLY AUTHENTICATION MIDDLEWARE
// ============================================
// Skip auth for specific GET endpoints (for demo)
app.use((req, res, next) => {
    const publicEndpoints = [
        '/health',
        '/',
        '/api/category/get-category',
        '/api/sub-category/get-sub-category',
        '/api/product/get-product'
    ];
    
    if (publicEndpoints.includes(req.path)) {
        // Set default user for public endpoints
        req.user = {
            username: 'guest',
            role: 'viewer',
            permissions: ['READ']
        };
        return next();
    }
    
    // Apply auth for other endpoints
    simpleAuth(req, res, next);
});

// ============================================
// S3 MEDIA ROUTES
// ============================================

// List all images (READ permission)
app.get("/api/s3/images", listImages);

// Get image URL by key (READ permission)
app.get("/api/s3/images/:key", getImageUrl);

// List all documents (READ permission)
app.get("/api/s3/documents", listDocuments);

// Get signed URL for document download (READ permission)
app.get("/api/s3/documents/:key/download", getDocumentSignedUrl);

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================

// Database error handler
function handleDatabaseError(error, res, operation = 'database operation') {
    console.error(`❌ Database error during ${operation}:`, error.message);
    
    if (!dbInitialized) {
        return res.status(503).json({
            success: false,
            error: 'Database not available',
            message: 'Database connection not initialized',
            operation
        });
    }
    
    // Handle specific Sequelize errors
    if (error.name === 'SequelizeConnectionError') {
        return res.status(503).json({
            success: false,
            error: 'Database connection failed',
            message: 'Unable to connect to database',
            operation
        });
    }
    
    if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            message: error.message,
            operation
        });
    }
    
    // Generic database error
    return res.status(500).json({
        success: false,
        error: 'Database error',
        message: 'An error occurred while processing your request',
        operation
    });
}

// Get current user info
app.get("/api/me", getUserInfo);
// ============================================
// CATEGORY ROUTES (PostgreSQL)
// ============================================

// Get all categories
app.get("/api/categories", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get categories');
        }
        
        const categories = await Category.findAll({
            where: { isDeleted: false },
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'description', 'image', 'createdAt', 'updatedAt']
        });
        
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: categories,
            count: categories.length,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get categories');
    }
});

// Category routes (for compatibility with frontend)
app.get("/api/category/get-category", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get categories');
        }
        
        const categories = await Category.findAll({
            where: { isDeleted: false },
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'description', 'image', 'createdAt', 'updatedAt']
        });
        
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: categories,
            count: categories.length,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get categories');
    }
});

// Add new category
app.post("/api/category/add-category", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'add category');
        }
        
        const { name, description, image } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Category name is required'
            });
        }
        
        const newCategory = await Category.create({
            name: name.trim(),
            description: description?.trim() || '',
            image: image?.trim() || '',
            isDeleted: false
        });
        
        res.json({
            success: true,
            message: "Category created successfully",
            user: req.user.username,
            role: req.user.role,
            data: newCategory,
            note: "Saved to PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'add category');
    }
});

// Update category
app.put("/api/category/update-category", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'update category');
        }
        
        const { id, name, description, image } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Category ID is required'
            });
        }
        
        const category = await Category.findByPk(id);
        
        if (!category || category.isDeleted) {
            return res.status(404).json({
                success: false,
                error: 'Not found',
                message: 'Category not found'
            });
        }
        
        await category.update({
            name: name?.trim() || category.name,
            description: description?.trim() || category.description,
            image: image?.trim() || category.image
        });
        
        res.json({
            success: true,
            message: "Category updated successfully",
            user: req.user.username,
            role: req.user.role,
            data: category,
            note: "Updated in PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'update category');
    }
});

// Delete category (soft delete)
app.delete("/api/category/delete-category", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'delete category');
        }
        
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Category ID is required'
            });
        }
        
        const category = await Category.findByPk(id);
        
        if (!category || category.isDeleted) {
            return res.status(404).json({
                success: false,
                error: 'Not found',
                message: 'Category not found'
            });
        }
        
        await category.update({
            isDeleted: true,
            deletedAt: new Date()
        });
        
        res.json({
            success: true,
            message: "Category deleted successfully",
            user: req.user.username,
            role: req.user.role,
            deletedId: id,
            note: "Soft deleted in PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'delete category');
    }
});
// ============================================
// PRODUCT ROUTES (PostgreSQL)
// ============================================

// Get all products with category information
app.get("/api/products", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get products');
        }
        
        const products = await Product.findAll({
            where: { publish: true },
            include: [{
                model: Category,
                as: 'categories',
                where: { isDeleted: false },
                required: false,
                attributes: ['id', 'name', 'description'],
                through: { attributes: [] }
            }],
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'description', 'price', 'discount', 'images', 'status', 'preparationTime', 'isFeatured', 'createdAt', 'updatedAt']
        });
        
        // Transform data to match frontend expectations
        const transformedProducts = products.map(product => {
            const productData = product.toJSON();
            const category = productData.categories?.[0];
            
            return {
                id: productData.id,
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                category_id: category?.id || null,
                category_name: category?.name || 'Uncategorized',
                image_url: productData.images?.[0] || 'https://via.placeholder.com/300',
                status: productData.status,
                preparationTime: productData.preparationTime,
                isFeatured: productData.isFeatured,
                discount: parseFloat(productData.discount || 0),
                createdAt: productData.createdAt,
                updatedAt: productData.updatedAt
            };
        });
        
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: transformedProducts,
            count: transformedProducts.length,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get products');
    }
});

// Product routes (for compatibility with frontend)
app.get("/api/product/get-product", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get products');
        }
        
        const products = await Product.findAll({
            where: { publish: true },
            include: [{
                model: Category,
                as: 'categories',
                where: { isDeleted: false },
                required: false,
                attributes: ['id', 'name', 'description'],
                through: { attributes: [] }
            }],
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'description', 'price', 'discount', 'images', 'status', 'preparationTime', 'isFeatured', 'createdAt', 'updatedAt']
        });
        
        // Transform data to match frontend expectations
        const transformedProducts = products.map(product => {
            const productData = product.toJSON();
            const category = productData.categories?.[0];
            
            return {
                id: productData.id,
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                category_id: category?.id || null,
                category_name: category?.name || 'Uncategorized',
                image_url: productData.images?.[0] || 'https://via.placeholder.com/300',
                status: productData.status,
                preparationTime: productData.preparationTime,
                isFeatured: productData.isFeatured,
                discount: parseFloat(productData.discount || 0)
            };
        });
        
        res.json({
            success: true,
            user: req.user?.username || "guest",
            role: req.user?.role || "viewer",
            data: transformedProducts,
            count: transformedProducts.length,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get products');
    }
});

// POST version (frontend might use POST instead of GET)
app.post("/api/product/get-product", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get products');
        }
        
        const products = await Product.findAll({
            where: { publish: true },
            include: [{
                model: Category,
                as: 'categories',
                where: { isDeleted: false },
                required: false,
                attributes: ['id', 'name', 'description'],
                through: { attributes: [] }
            }],
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'description', 'price', 'discount', 'images', 'status', 'preparationTime', 'isFeatured']
        });
        
        // Transform data to match frontend expectations
        const transformedProducts = products.map(product => {
            const productData = product.toJSON();
            const category = productData.categories?.[0];
            
            return {
                id: productData.id,
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                category_id: category?.id || null,
                category_name: category?.name || 'Uncategorized',
                image_url: productData.images?.[0] || 'https://via.placeholder.com/300',
                status: productData.status,
                preparationTime: productData.preparationTime,
                isFeatured: productData.isFeatured,
                discount: parseFloat(productData.discount || 0)
            };
        });
        
        res.json({
            success: true,
            user: req.user?.username || "guest",
            role: req.user?.role || "viewer",
            data: transformedProducts,
            count: transformedProducts.length,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get products');
    }
});
// Get product by ID
app.get("/api/products/:id", async (req, res) => {
    try {
        if (!dbInitialized) {
            return handleDatabaseError(new Error('Database not initialized'), res, 'get product by id');
        }
        
        const { id } = req.params;
        
        const product = await Product.findByPk(id, {
            include: [{
                model: Category,
                as: 'categories',
                where: { isDeleted: false },
                required: false,
                attributes: ['id', 'name', 'description'],
                through: { attributes: [] }
            }],
            attributes: ['id', 'name', 'description', 'price', 'discount', 'images', 'status', 'preparationTime', 'isFeatured', 'moreDetails']
        });
        
        if (!product || !product.publish) {
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }
        
        const productData = product.toJSON();
        const category = productData.categories?.[0];
        
        const transformedProduct = {
            id: productData.id,
            name: productData.name,
            description: productData.description,
            price: parseFloat(productData.price),
            category_id: category?.id || null,
            category_name: category?.name || 'Uncategorized',
            image_url: productData.images?.[0] || 'https://via.placeholder.com/300',
            status: productData.status,
            preparationTime: productData.preparationTime,
            isFeatured: productData.isFeatured,
            discount: parseFloat(productData.discount || 0),
            moreDetails: productData.moreDetails
        };
        
        res.json({
            success: true,
            user: req.user.username,
            role: req.user.role,
            data: transformedProduct,
            note: "Data from PostgreSQL database"
        });
        
    } catch (error) {
        handleDatabaseError(error, res, 'get product by id');
    }
});

// ============================================
// SUB-CATEGORY ROUTES (Placeholder)
// ============================================

// Sub-categories (placeholder - will be implemented later)
app.get("/api/sub-categories", (req, res) => {
    res.json({
        success: true,
        user: req.user.username,
        role: req.user.role,
        data: [],
        note: "Sub-categories not implemented yet"
    });
});

app.get("/api/sub-category/get-sub-category", (req, res) => {
    res.json({
        success: true,
        user: req.user.username,
        role: req.user.role,
        data: [],
        note: "Sub-categories not implemented yet"
    });
});

// ============================================
// TABLES AND ORDERS (Placeholder)
// ============================================

// Tables (placeholder - will be implemented later)
app.get("/api/tables", (req, res) => {
    res.json({
        success: true,
        user: req.user.username,
        role: req.user.role,
        data: [],
        note: "Tables not implemented yet - will use Table model"
    });
});

// Orders (placeholder - will be implemented later)
app.get("/api/orders", (req, res) => {
    res.json({
        success: true,
        user: req.user.username,
        role: req.user.role,
        data: [],
        note: "Orders not implemented yet - will use TableOrder and OrderItem models"
    });
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
    res.status(404).json({ 
        error: "Not Found",
        path: req.path,
        method: req.method
    });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    await closeDatabase();
    process.exit(0);
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 Authentication: Enabled`);
    console.log(`📊 Database: PostgreSQL (${dbInitialized ? 'Connected' : 'Connection Pending'})`);
    console.log(`📦 S3: Media + Documents`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});