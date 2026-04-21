import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import cognitoService from '@/services/cognitoService';
import { setUserDetails } from '@/store/userSlice';
import { getRoleHomePath } from '@/utils/routePermissions';
import Loading from '@/components/Loading';

/**
 * OAuthCallback - Handle OAuth redirect from Cognito Hosted UI
 * This component processes the authorization code and exchanges it for tokens
 */
export default function OAuthCallback() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        handleCallback();
    }, []);

    const handleCallback = async () => {
        try {
            // Extract authorization code from URL
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const errorParam = urlParams.get('error');
            const errorDescription = urlParams.get('error_description');

            // Check for OAuth errors
            if (errorParam) {
                throw new Error(errorDescription || 'OAuth authentication failed');
            }

            if (!code) {
                throw new Error('No authorization code received');
            }

            // Exchange code for tokens
            const result = await cognitoService.handleOAuthCallback(code);

            // Update Redux store with user details
            dispatch(setUserDetails(result.user));

            // Navigate to role-based home page
            const homePath = getRoleHomePath(result.user.role);
            navigate(homePath, { replace: true });
        } catch (err) {
            console.error('OAuth callback error:', err);
            
            const errorMessage = err instanceof Error 
                ? err.message 
                : 'Authentication failed. Please try again.';
            
            setError(errorMessage);

            // Redirect to login after 3 seconds
            setTimeout(() => {
                navigate('/login', { replace: true });
            }, 3000);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <div className="max-w-md p-8 bg-card rounded-lg shadow-lg text-center">
                    <div className="mb-4">
                        <svg
                            className="w-16 h-16 mx-auto text-destructive"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                        Xác thực thất bại
                    </h2>
                    <p className="text-muted-foreground mb-4">{error}</p>
                    <p className="text-sm text-muted-foreground">
                        Đang chuyển hướng về trang đăng nhập...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background">
            <div className="max-w-md p-8 bg-card rounded-lg shadow-lg text-center">
                <Loading />
                <h2 className="text-2xl font-bold text-foreground mt-4 mb-2">
                    Đang hoàn tất xác thực...
                </h2>
                <p className="text-muted-foreground">
                    Vui lòng đợi trong giây lát
                </p>
            </div>
        </div>
    );
}
