import User from "../models-sequelize/user.model.js"; // Sequelize model

/**
 * Middleware to sync Cognito user with PostgreSQL database
 * Creates user record on first login if it doesn't exist
 * Updates user profile information from Cognito token
 * 
 * This middleware should be used AFTER verifyCognitoToken middleware
 * which sets req.user with Cognito token claims
 */
const syncCognitoUser = async (req, res, next) => {
    try {
        // req.user is set by verifyCognitoToken middleware
        const { userId, email, name, role, emailVerified } = req.user;

        if (!userId) {
            return res.status(401).json({
                error: true,
                message: 'User ID not found in token'
            });
        }

        // Try to find user by Cognito sub (UUID)
        let user = await User.findByPk(userId);

        if (!user) {
            // First-time login: Create user record in PostgreSQL
            console.log(`[syncCognitoUser] Creating new user record for Cognito sub: ${userId}`);
            
            user = await User.create({
                id: userId, // Use Cognito sub as primary key
                email: email,
                name: name || email.split('@')[0], // Use email prefix if name not provided
                role: role || 'CUSTOMER', // Default role
                verifyEmail: emailVerified || false,
                status: 'Active',
                // Initialize rewards system
                rewardsPoint: 0,
                tierLevel: 'Bronze',
                // Set login date
                lastLoginDate: new Date()
            });

            console.log(`[syncCognitoUser] User created successfully: ${user.id}`);
        } else {
            // Existing user: Update profile information from Cognito token
            const updateData = {};
            
            // Update email if changed in Cognito
            if (email && email !== user.email) {
                updateData.email = email;
            }
            
            // Update name if changed in Cognito
            if (name && name !== user.name) {
                updateData.name = name;
            }
            
            // Update email verification status
            if (emailVerified !== undefined && emailVerified !== user.verifyEmail) {
                updateData.verifyEmail = emailVerified;
            }
            
            // Update role if changed in Cognito groups
            if (role && role !== user.role) {
                updateData.role = role;
            }
            
            // Update last login date
            updateData.lastLoginDate = new Date();
            
            // Only update if there are changes
            if (Object.keys(updateData).length > 0) {
                await user.update(updateData);
                console.log(`[syncCognitoUser] User profile updated: ${user.id}`);
            }
        }

        // Attach full user object to request for use in controllers
        req.user.dbUser = user;

        next();
    } catch (error) {
        console.error('[syncCognitoUser] Error syncing user:', error);
        
        // Don't block the request if sync fails
        // Log the error and continue
        console.error('[syncCognitoUser] Continuing request despite sync error');
        next();
    }
};

export default syncCognitoUser;
