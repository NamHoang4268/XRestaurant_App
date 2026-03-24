import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Axios from '../utils/Axios';
import SummaryApi from '../common/SummaryApi';
import toast from 'react-hot-toast';
import {
    FiCreditCard,
    FiDollarSign,
    FiShoppingBag,
    FiLogOut,
    FiX,
    FiClock,
} from 'react-icons/fi';

// Map kitchenStatus → label + màu hiển thị cho khách
const KITCHEN_STATUS_CONFIG = {
    pending:  { label: 'Chờ bếp',       className: 'bg-yellow-100 text-yellow-700' },
    cooking:  { label: 'Đang nấu',      className: 'bg-blue-100 text-blue-700' },
    ready:    { label: 'Sắp phục vụ',   className: 'bg-purple-100 text-purple-700' },
    served:   { label: 'Đã phục vụ',   className: 'bg-green-100 text-green-700' },
};

const TableOrderManagementPage = () => {
    const navigate = useNavigate();
    const user = useSelector((state) => state.user);
    const [tableOrder, setTableOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!user || user.role !== 'TABLE') {
            toast.error('Vui lòng quét mã QR tại bàn');
            navigate('/');
            return;
        }
        fetchTableOrder();
    }, [user, navigate]);

    const fetchTableOrder = async () => {
        try {
            setLoading(true);
            const response = await Axios({
                ...SummaryApi.get_current_table_order,
            });

            if (response.data.success) {
                setTableOrder(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching table order:', error);
            toast.error('Không thể tải đơn hàng');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckout = async (paymentMethod) => {
        if (!tableOrder || tableOrder.items.length === 0) {
            toast.error('Không có món nào để thanh toán');
            return;
        }

        // AC: Chỉ cho phép thanh toán khi tất cả món đã được phục vụ
        if (!allServed) {
            toast.error('Vui lòng chờ tất cả các món được phục vụ trước khi thanh toán.');
            return;
        }

        try {
            setProcessing(true);
            const response = await Axios({
                ...SummaryApi.checkout_table_order,
                data: {
                    paymentMethod: paymentMethod,
                },
            });

            if (response.data.success) {
                if (paymentMethod === 'at_counter') {
                    toast.success(
                        '📋 Yêu cầu thanh toán tại quầy đã được gửi. Nhân viên sẽ đến hỗ trợ!',
                        { duration: 5000 }
                    );
                    navigate('/table-menu');
                } else {
                    // Redirect to Stripe
                    window.location.href = response.data.data.checkoutUrl;
                }
            }
        } catch (error) {
            console.error('Error checkout:', error);
            toast.error(
                error.response?.data?.message || 'Không thể thanh toán'
            );
        } finally {
            setProcessing(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!window.confirm('Bạn có chắc muốn hủy đơn hàng?')) {
            return;
        }

        try {
            const response = await Axios({
                ...SummaryApi.cancel_table_order,
            });

            if (response.data.success) {
                toast.success('Đã hủy đơn hàng');
                navigate('/table-menu');
            }
        } catch (error) {
            console.error('Error cancelling order:', error);
            toast.error('Không thể hủy đơn');
        }
    };

    const handleLogout = async () => {
        try {
            await Axios({
                ...SummaryApi.logoutTable,
            });
            toast.success('Đã đăng xuất');
            navigate('/');
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
        );
    }

    if (!tableOrder || tableOrder.items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4">
                    <div className="max-w-7xl mx-auto flex justify-between items-center">
                        <h1 className="text-2xl font-bold">Đơn hàng</h1>
                        <button
                            onClick={handleLogout}
                            className="bg-white text-orange-500 p-2 rounded-full"
                        >
                            <FiLogOut size={20} />
                        </button>
                    </div>
                </div>
                <div className="max-w-2xl mx-auto p-8 text-center">
                    <p className="text-gray-500 mb-4">
                        Chưa có món nào được gọi
                    </p>
                    <button
                        onClick={() => navigate('/table-menu')}
                        className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold"
                    >
                        Bắt đầu gọi món
                    </button>
                </div>
            </div>
        );
    }

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const allServed =
        tableOrder.items.length > 0 &&
        tableOrder.items.every((item) => item.kitchenStatus === 'served');

    const pendingCount = tableOrder.items.filter(
        (item) => item.kitchenStatus !== 'served'
    ).length;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 sticky top-0 z-40 shadow-lg">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">
                            Bàn {tableOrder.tableNumber}
                        </h1>
                        <p className="text-sm opacity-90">Quản lý đơn hàng</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="bg-white text-orange-500 p-3 rounded-full hover:bg-orange-50 transition-colors"
                    >
                        <FiLogOut size={24} />
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto p-4 space-y-4">
                {/* Order Items */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        Món đã gọi
                    </h2>
                    <div className="space-y-3">
                        {tableOrder.items.map((item, index) => {
                            const statusCfg =
                                KITCHEN_STATUS_CONFIG[item.kitchenStatus] ??
                                KITCHEN_STATUS_CONFIG.pending;
                            return (
                                <div
                                    key={index}
                                    className="flex justify-between items-start border-b pb-3 last:border-b-0"
                                >
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-800">
                                            {item.name}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            Gọi lúc: {formatTime(item.addedAt)}
                                        </p>
                                        <p className="text-orange-500 font-bold mt-1">
                                            {item.price.toLocaleString('vi-VN')}đ x{' '}
                                            {item.quantity}
                                        </p>
                                        {/* Kitchen status badge */}
                                        <span
                                            className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.className}`}
                                        >
                                            {item.kitchenStatus !== 'served' && (
                                                <FiClock size={10} />
                                            )}
                                            {statusCfg.label}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-gray-800">
                                            {(
                                                item.price * item.quantity
                                            ).toLocaleString('vi-VN')}
                                            đ
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Total */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex justify-between items-center text-xl font-bold">
                        <span className="text-orange-700">Tổng cộng:</span>
                        <span className="text-orange-500">
                            {tableOrder.total.toLocaleString('vi-VN')}đ
                        </span>
                    </div>
                </div>

                {/* Payment Buttons */}
                {/* Banner: chỉ hiện khi chưa đủ điều kiện thanh toán */}
                {!allServed && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-start gap-3">
                        <FiClock className="text-yellow-500 mt-0.5 shrink-0" size={20} />
                        <div>
                            <p className="font-semibold text-yellow-800">Chưa thể thanh toán</p>
                            <p className="text-sm text-yellow-700 mt-0.5">
                                Còn <strong>{pendingCount}</strong> món chưa được phục vụ. Vui lòng chờ nhân viên mang món ra bàn trước khi thanh toán.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    <button
                        onClick={() => handleCheckout('online')}
                        disabled={processing || !allServed}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                    >
                        <FiCreditCard size={24} />
                        {processing ? 'Đang xử lý...' : 'Thanh toán online'}
                    </button>

                    <button
                        onClick={() => handleCheckout('at_counter')}
                        disabled={processing || !allServed}
                        className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                    >
                        <FiDollarSign size={24} />
                        {processing ? 'Đang xử lý...' : 'Thanh toán tại quầy'}
                    </button>

                    <button
                        onClick={() => navigate('/table-menu')}
                        className="w-full bg-orange-500 text-white py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition-all"
                    >
                        <FiShoppingBag size={24} />
                        Tiếp tục gọi món
                    </button>

                    <button
                        onClick={handleCancelOrder}
                        className="w-full bg-gray-400 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-gray-300 transition-all"
                    >
                        <FiX size={20} />
                        Hủy đơn
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TableOrderManagementPage;
