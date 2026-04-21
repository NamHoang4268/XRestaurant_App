// ============================================================================
// Simple Authentication Middleware for Demo
// ============================================================================

// Danh sách users demo (mapping với IAM users)
// TODO: Thay đổi username và password theo IAM users thật của bạn
const DEMO_USERS = {
    // User 1: Không có quyền (Viewer)
    'user1': {  // Thay 'user1' bằng username IAM thật
        password: 'YourPassword1',  // Thay bằng password thật
        role: 'viewer',
        permissions: ['READ'],
        description: 'Chỉ xem - Không có quyền chỉnh sửa'
    },
    // User 2: Toàn quyền (Admin)
    'user2': {  // Thay 'user2' bằng username IAM thật
        password: 'YourPassword2',  // Thay bằng password thật
        role: 'admin',
        permissions: ['READ', 'WRITE', 'DELETE', 'ADMIN'],
        description: 'Toàn quyền - Có thể thực hiện mọi thao tác'
    }
};

/**
 * Middleware xác thực user đơn giản
 * Kiểm tra username/password từ headers
 */
export const simpleAuth = (req, res, next) => {
    const username = req.headers['x-username'];
    const password = req.headers['x-password'];

    // Bỏ qua auth cho health check và root
    if (req.path === '/health' || req.path === '/' || req.path === '/api/migrate' || req.path === '/api/import-data') {
        return next();
    }

    if (!username || !password) {
        return res.status(401).json({
            error: 'Missing credentials',
            message: 'Vui lòng cung cấp username và password trong headers',
            required_headers: {
                'x-username': 'user1 hoặc user2',
                'x-password': 'password của user'
            }
        });
    }

    const user = DEMO_USERS[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({
            error: 'Invalid credentials',
            message: 'Username hoặc password không đúng',
            hint: 'Sử dụng user1 hoặc user2'
        });
    }

    // Kiểm tra quyền theo HTTP method
    const method = req.method;
    
    // GET requests cần quyền READ
    if (method === 'GET' && !user.permissions.includes('READ')) {
        return res.status(403).json({
            error: 'Permission denied',
            message: `User ${username} không có quyền đọc dữ liệu`,
            user: username,
            role: user.role,
            permissions: user.permissions
        });
    }

    // POST, PUT, DELETE, PATCH cần quyền WRITE
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && !user.permissions.includes('WRITE')) {
        return res.status(403).json({
            error: 'Permission denied',
            message: `User ${username} (${user.role}) không có quyền chỉnh sửa dữ liệu`,
            user: username,
            role: user.role,
            method: method,
            permissions: user.permissions,
            description: user.description
        });
    }

    // Thêm user info vào request
    req.user = {
        username: username,
        role: user.role,
        permissions: user.permissions,
        description: user.description
    };

    console.log(`✅ User authenticated: ${username} (${user.role}) - ${method} ${req.path}`);

    next();
};

/**
 * Middleware kiểm tra quyền cụ thể
 */
export const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Vui lòng đăng nhập trước'
            });
        }

        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({
                error: 'Permission denied',
                message: `Cần quyền ${permission}`,
                user: req.user.username,
                role: req.user.role,
                permissions: req.user.permissions
            });
        }

        next();
    };
};

/**
 * Middleware chỉ cho phép admin
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Vui lòng đăng nhập trước'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Admin only',
            message: 'Chỉ admin mới có quyền thực hiện thao tác này',
            user: req.user.username,
            role: req.user.role
        });
    }

    next();
};

/**
 * Route để xem thông tin user hiện tại
 */
export const getUserInfo = (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            error: 'Not authenticated'
        });
    }

    res.json({
        user: req.user.username,
        role: req.user.role,
        permissions: req.user.permissions,
        description: req.user.description
    });
};
