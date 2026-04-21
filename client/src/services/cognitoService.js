import {
    CognitoUserPool,
    CognitoUser,
    AuthenticationDetails,
    CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// Cognito Configuration from environment variables
const cognitoConfig = {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
    clientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID,
    clientSecret: import.meta.env.VITE_COGNITO_APP_CLIENT_SECRET, // Optional
    region: import.meta.env.VITE_COGNITO_REGION,
    domain: import.meta.env.VITE_COGNITO_DOMAIN,
};

// Validate configuration
if (!cognitoConfig.userPoolId || !cognitoConfig.clientId || !cognitoConfig.region) {
    throw new Error('Missing required Cognito configuration. Please check environment variables.');
}

// Initialize Cognito User Pool
const userPool = new CognitoUserPool({
    UserPoolId: cognitoConfig.userPoolId,
    ClientId: cognitoConfig.clientId,
});

/**
 * CognitoService - Centralized service for AWS Cognito authentication operations
 */
class CognitoService {
    constructor() {
        this.userPool = userPool;
        this.config = cognitoConfig;
        
        // Initialize AWS SDK client for operations requiring client secret
        this.cognitoClient = new CognitoIdentityProviderClient({
            region: this.config.region,
        });
    }

    /**
     * Calculate SECRET_HASH for Cognito authentication with client secret
     * @param {string} username - Username (email)
     * @returns {Promise<string>}
     */
    async calculateSecretHash(username) {
        if (!this.config.clientSecret) {
            return null;
        }

        const message = username + this.config.clientId;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(this.config.clientSecret);
        const messageData = encoder.encode(message);

        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', key, messageData);
        const hashArray = Array.from(new Uint8Array(signature));
        const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));

        return hashBase64;
    }

    /**
     * Get Cognito User object
     * @param {string} email - User email
     * @returns {CognitoUser}
     */
    getCognitoUser(email) {
        return new CognitoUser({
            Username: email,
            Pool: this.userPool,
        });
    }

    /**
     * Email/password authentication
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<AuthResult>}
     */
    async signIn(email, password) {
        // If client secret is configured, use AWS SDK
        if (this.config.clientSecret) {
            return this.signInWithSecret(email, password);
        }
        
        // Otherwise use amazon-cognito-identity-js (no secret)
        return new Promise((resolve, reject) => {
            const cognitoUser = this.getCognitoUser(email);
            const authenticationDetails = new AuthenticationDetails({
                Username: email,
                Password: password,
            });

            cognitoUser.authenticateUser(authenticationDetails, {
                onSuccess: (result) => {
                    try {
                        // Extract tokens
                        const idToken = result.getIdToken().getJwtToken();
                        const accessToken = result.getAccessToken().getJwtToken();
                        const refreshToken = result.getRefreshToken().getToken();

                        // Store tokens in localStorage
                        localStorage.setItem('idToken', idToken);
                        localStorage.setItem('accessToken', accessToken);
                        localStorage.setItem('refreshToken', refreshToken);

                        // Decode idToken to extract user data
                        const decodedToken = this.decodeToken(idToken);
                        const user = this.mapTokenToUser(decodedToken);

                        resolve({
                            idToken,
                            accessToken,
                            refreshToken,
                            user,
                        });
                    } catch (error) {
                        reject(error);
                    }
                },
                onFailure: (err) => {
                    reject(err);
                },
                newPasswordRequired: (userAttributes, requiredAttributes) => {
                    // Handle new password required scenario
                    reject({
                        code: 'NewPasswordRequired',
                        message: 'New password required',
                        userAttributes,
                        requiredAttributes,
                    });
                },
            });
        });
    }

    /**
     * Sign in with client secret using AWS SDK
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<AuthResult>}
     */
    async signInWithSecret(email, password) {
        try {
            const secretHash = await this.calculateSecretHash(email);
            
            const command = new InitiateAuthCommand({
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: this.config.clientId,
                AuthParameters: {
                    USERNAME: email,
                    PASSWORD: password,
                    SECRET_HASH: secretHash,
                },
            });

            const response = await this.cognitoClient.send(command);

            if (!response.AuthenticationResult) {
                throw new Error('Authentication failed');
            }

            const { IdToken, AccessToken, RefreshToken } = response.AuthenticationResult;

            // Store tokens in localStorage
            localStorage.setItem('idToken', IdToken);
            localStorage.setItem('accessToken', AccessToken);
            localStorage.setItem('refreshToken', RefreshToken);

            // Decode idToken to extract user data
            const decodedToken = this.decodeToken(IdToken);
            const user = this.mapTokenToUser(decodedToken);

            return {
                idToken: IdToken,
                accessToken: AccessToken,
                refreshToken: RefreshToken,
                user,
            };
        } catch (error) {
            console.error('Sign in with secret error:', error);
            throw error;
        }
    }

    /**
     * Initiate Google OAuth login (redirect to Cognito Hosted UI)
     */
    initiateGoogleLogin() {
        const redirectUri = `${window.location.origin}/oauth/callback`;
        const hostedUIUrl = `https://${this.config.domain}/oauth2/authorize?` +
            `client_id=${this.config.clientId}&` +
            `response_type=code&` +
            `scope=openid+email+profile&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `identity_provider=Google`;

        window.location.href = hostedUIUrl;
    }

    /**
     * Handle OAuth callback (exchange authorization code for tokens)
     * @param {string} code - Authorization code from OAuth callback
     * @returns {Promise<AuthResult>}
     */
    async handleOAuthCallback(code) {
        try {
            const redirectUri = `${window.location.origin}/oauth/callback`;
            const tokenEndpoint = `https://${this.config.domain}/oauth2/token`;

            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: this.config.clientId,
                code: code,
                redirect_uri: redirectUri,
            });

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                throw new Error('Failed to exchange authorization code for tokens');
            }

            const data = await response.json();

            // Store tokens
            localStorage.setItem('idToken', data.id_token);
            localStorage.setItem('accessToken', data.access_token);
            localStorage.setItem('refreshToken', data.refresh_token);

            // Decode and map user data
            const decodedToken = this.decodeToken(data.id_token);
            const user = this.mapTokenToUser(decodedToken);

            return {
                idToken: data.id_token,
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                user,
            };
        } catch (error) {
            console.error('OAuth callback error:', error);
            throw error;
        }
    }

    /**
     * Refresh session using refresh token
     * @param {string} refreshToken - Cognito refresh token
     * @returns {Promise<TokenResult>}
     */
    async refreshSession(refreshToken) {
        return new Promise((resolve, reject) => {
            const cognitoUser = this.userPool.getCurrentUser();

            if (!cognitoUser) {
                reject(new Error('No current user'));
                return;
            }

            const token = new CognitoRefreshToken({ RefreshToken: refreshToken });

            cognitoUser.refreshSession(token, (err, session) => {
                if (err) {
                    reject(err);
                    return;
                }

                const idToken = session.getIdToken().getJwtToken();
                const accessToken = session.getAccessToken().getJwtToken();

                // Update localStorage
                localStorage.setItem('idToken', idToken);
                localStorage.setItem('accessToken', accessToken);

                resolve({
                    idToken,
                    accessToken,
                });
            });
        });
    }

    /**
     * Sign out user (global sign out)
     * @returns {Promise<void>}
     */
    async signOut() {
        return new Promise((resolve, reject) => {
            const cognitoUser = this.userPool.getCurrentUser();

            if (cognitoUser) {
                cognitoUser.globalSignOut({
                    onSuccess: () => {
                        // Clear localStorage
                        localStorage.removeItem('idToken');
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('refreshToken');
                        resolve();
                    },
                    onFailure: (err) => {
                        // Even if global sign out fails, clear local tokens
                        localStorage.removeItem('idToken');
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('refreshToken');
                        reject(err);
                    },
                });
            } else {
                // No user session, just clear tokens
                localStorage.removeItem('idToken');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                resolve();
            }
        });
    }

    /**
     * Get current authenticated user
     * @returns {Promise<UserData|null>}
     */
    async getCurrentUser() {
        const idToken = localStorage.getItem('idToken');

        if (!idToken) {
            return null;
        }

        try {
            const decodedToken = this.decodeToken(idToken);
            
            // Check if token is expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (decodedToken.exp < currentTime) {
                return null;
            }

            return this.mapTokenToUser(decodedToken);
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    /**
     * Decode JWT token
     * @param {string} token - JWT token
     * @returns {DecodedToken}
     */
    decodeToken(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('Error decoding token:', error);
            throw new Error('Invalid token');
        }
    }

    /**
     * Map decoded token to user data
     * @param {DecodedToken} decodedToken
     * @returns {UserData}
     */
    mapTokenToUser(decodedToken) {
        const groups = decodedToken['cognito:groups'] || [];
        const role = this.extractRole(groups);

        return {
            _id: decodedToken.sub,
            name: decodedToken.name || decodedToken.email,
            email: decodedToken.email,
            role: role,
            avatar: decodedToken.picture || '',
            mobile: decodedToken.phone_number || '',
            verity_email: decodedToken.email_verified || false,
            last_login_date: new Date(decodedToken.auth_time * 1000).toISOString(),
            status: 'active',
            shopping_cart: [],
            orderHistory: [],
            rewardsPoint: 0,
        };
    }

    /**
     * Extract role from Cognito groups
     * @param {string[]} groups - Cognito user groups
     * @returns {string}
     */
    extractRole(groups) {
        if (!groups || groups.length === 0) {
            return 'CUSTOMER';
        }

        // Priority: ADMIN > STAFF > CUSTOMER
        if (groups.includes('Admins')) return 'ADMIN';
        if (groups.includes('Staff')) return 'STAFF';
        if (groups.includes('Customers')) return 'CUSTOMER';

        return 'CUSTOMER';
    }

    /**
     * Map Cognito error to user-friendly Vietnamese message
     * @param {Error} error - Cognito error
     * @returns {string}
     */
    mapCognitoError(error) {
        const errorCode = error.code || error.name;

        const errorMap = {
            UserNotFoundException: 'Email không tồn tại trong hệ thống',
            NotAuthorizedException: 'Mật khẩu không chính xác',
            UserNotConfirmedException: 'Tài khoản chưa được xác thực. Vui lòng kiểm tra email',
            TooManyRequestsException: 'Quá nhiều lần thử. Vui lòng thử lại sau',
            InvalidParameterException: 'Thông tin đăng nhập không hợp lệ',
            CodeMismatchException: 'Mã xác thực không đúng',
            ExpiredCodeException: 'Mã xác thực đã hết hạn',
            LimitExceededException: 'Vượt quá giới hạn. Vui lòng thử lại sau',
            NetworkError: 'Lỗi kết nối. Vui lòng kiểm tra internet và thử lại',
        };

        return errorMap[errorCode] || 'Đã xảy ra lỗi. Vui lòng thử lại sau';
    }
}

// Export singleton instance
const cognitoService = new CognitoService();
export default cognitoService;
