import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import WaiterDashboard from './WaiterDashboard';
import CashierDashboard from './CashierDashboard';
import ChefDashboard from './ChefDashboard';

const DashboardRouter = () => {
    const user = useSelector((state) => state?.user);

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    switch (user.role) {
        case 'ADMIN':
            return <AdminDashboard />;
        case 'WAITER':
            return <WaiterDashboard />;
        case 'CASHIER':
            return <CashierDashboard />;
        case 'CHEF':
            return <ChefDashboard />;
        default:
            return (
                <div className="flex flex-col items-center justify-center p-8 mt-10">
                    <h2 className="text-2xl font-bold text-red-500 mb-2">Lỗi truy cập</h2>
                    <p className="text-muted-foreground">Tài khoản của bạn không có quyền truy cập ứng dụng hệ thống này.</p>
                </div>
            );
    }
};

export default DashboardRouter;
