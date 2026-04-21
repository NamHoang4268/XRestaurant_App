import { CognitoJwtVerifier } from "aws-jwt-verify";

// Create verifier instance
const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: "id", // Verify idToken
    clientId: process.env.COGNITO_APP_CLIENT_ID,
});

/**
 * Middleware to verify Cognito JWT tokens
 * Extracts and verifies the token from Authorization header
 * Attaches user information to req.user
 */
const verifyCognitoToken = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: true,
                message: 'No token provided'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token with Cognito
        const payload = await verifier.verify(token);

        // Extract user information from token claims
        req.user = {
            userId: payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
            role: extractRole(payload['cognito:groups']),
            groups: payload['cognito:groups'] || [],
            emailVerified: payload.email_verified || false,
        };

        next();
    } catch (error) {
        console.error('Token verification failed:', error);

        // Handle specific JWT errors
        if (error.name === 'JwtExpiredError') {
            return res.status(401).json({
                error: true,
                message: 'Token expired'
            });
        }

        if (error.name === 'JwtInvalidClaimError') {
            return res.status(401).json({
                error: true,
                message: 'Invalid token claims'
            });
        }

        if (error.name === 'JwtInvalidSignatureError') {
            return res.status(401).json({
                error: true,
                message: 'Invalid token signature'
            });
        }

        // Generic error
        return res.status(401).json({
            error: true,
            message: 'Invalid token'
        });
    }
};

/**
 * Helper function to extract role from Cognito groups
 * @param {string[]} groups - Cognito user groups
 * @returns {string} - Application role
 */
function extractRole(groups) {
    if (!groups || groups.length === 0) {
        return 'CUSTOMER'; // Default role
    }

    // Priority: ADMIN > STAFF > CUSTOMER
    if (groups.includes('Admins')) return 'ADMIN';
    if (groups.includes('Staff')) return 'STAFF';
    if (groups.includes('Customers')) return 'CUSTOMER';

    // Check for specific staff roles
    if (groups.includes('WAITER')) return 'WAITER';
    if (groups.includes('CHEF')) return 'CHEF';
    if (groups.includes('CASHIER')) return 'CASHIER';

    return 'CUSTOMER'; // Default fallback
}

export default verifyCognitoToken;
