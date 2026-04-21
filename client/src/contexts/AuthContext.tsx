import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cognitoService from '@/services/cognitoService';
import { setUserDetails, logout as logoutAction } from '@/store/userSlice';

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    mobile?: string;
    verity_email?: boolean;
    last_login_date?: string;
    status?: string;
    shopping_cart?: any[];
    orderHistory?: any[];
    rewardsPoint?: number;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => void;
    logout: () => Promise<void>;
    refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const dispatch = useDispatch();

    // Initialize auth state on mount
    useEffect(() => {
        initializeAuth();
    }, []);

    /**
     * Initialize authentication state from localStorage
     */
    const initializeAuth = async () => {
        try {
            const idToken = localStorage.getItem('idToken');
            
            if (idToken) {
                // Decode token and check expiration
                const decodedToken = cognitoService.decodeToken(idToken);
                const currentTime = Math.floor(Date.now() / 1000);
                
                if (decodedToken.exp > currentTime) {
                    // Token is valid
                    const userData = cognitoService.mapTokenToUser(decodedToken);
                    setUser(userData);
                    dispatch(setUserDetails(userData));
                } else {
                    // Token expired, try to refresh
                    const refreshToken = localStorage.getItem('refreshToken');
                    if (refreshToken) {
                        try {
                            await refreshSession();
                        } catch (error) {
                            // Refresh failed, clear storage
                            localStorage.clear();
                        }
                    } else {
                        // No refresh token, clear storage
                        localStorage.clear();
                    }
                }
            }
        } catch (error) {
            console.error('Error initializing auth:', error);
            // Token invalid, clear storage
            localStorage.clear();
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Login with email and password
     */
    const login = async (email: string, password: string) => {
        try {
            const result = await cognitoService.signIn(email, password);
            setUser(result.user);
            dispatch(setUserDetails(result.user));
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    /**
     * Login with Google OAuth
     */
    const loginWithGoogle = () => {
        cognitoService.initiateGoogleLogin();
    };

    /**
     * Logout user
     */
    const logout = async () => {
        try {
            await cognitoService.signOut();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Always clear local state
            setUser(null);
            dispatch(logoutAction());
            localStorage.clear();
        }
    };

    /**
     * Refresh session using refresh token
     */
    const refreshSession = async () => {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const tokens = await cognitoService.refreshSession(refreshToken);
            const decodedToken = cognitoService.decodeToken(tokens.idToken);
            const userData = cognitoService.mapTokenToUser(decodedToken);
            
            setUser(userData);
            dispatch(setUserDetails(userData));
        } catch (error) {
            console.error('Refresh session error:', error);
            throw error;
        }
    };

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginWithGoogle,
        logout,
        refreshSession,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
