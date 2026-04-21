/**
 * Role-based authorization middleware
 * Checks if the authenticated user has one of the allowed roles
 * Must be used after verifyCognitoToken middleware
 * 
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Single role
 * app.post('/api/admin/users', verifyCognitoToken, authorize('ADMIN'), handler);
 * 
 * // Multiple roles
 * app.get('/api/orders', verifyCognitoToken, authorize('ADMIN', 'STAFF'), handler);
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        // Check if user exists (should be set by verifyCognitoToken middleware)
        if (!req.user) {
            return res.status(401).json({
                error: true,
                message: 'Unauthorized: No user information found'
            });
        }

        // Check if user has a role
        if (!req.user.role) {
            return res.status(403).json({
                error: true,
                message: 'Forbidden: No role assigned to user'
            });
        }

        // Check if user's role is in the allowed roles
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: true,
                message: `Forbidden: Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`
            });
        }

        // User has required role, proceed
        next();
    };
};

export default authorize;
