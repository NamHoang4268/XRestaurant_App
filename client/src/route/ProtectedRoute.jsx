import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import cognitoService from '@/services/cognitoService';
import Loading from '@/components/Loading';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    // Show loading while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loading />
            </div>
        );
    }

    // Check if user is authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check token expiration
    const idToken = localStorage.getItem('idToken');
    if (idToken) {
        try {
            const decoded = cognitoService.decodeToken(idToken);
            const isExpired = decoded.exp * 1000 < Date.now();

            if (isExpired) {
                // Token expired, redirect to login
                localStorage.clear();
                return <Navigate to="/login" replace />;
            }
        } catch (error) {
            // Invalid token, redirect to login
            console.error('Token decode error:', error);
            localStorage.clear();
            return <Navigate to="/login" replace />;
        }
    } else {
        // No token, redirect to login
        return <Navigate to="/login" replace />;
    }

    // Check role-based access if allowedRoles is specified
    if (allowedRoles && allowedRoles.length > 0) {
        if (!user || !allowedRoles.includes(user.role)) {
            // User doesn't have required role
            return <Navigate to="/unauthorized" replace />;
        }
    }

    // All checks passed, render children
    return children;
};

export default ProtectedRoute;
