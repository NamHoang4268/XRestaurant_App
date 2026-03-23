import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Axios from '../utils/Axios';
import SummaryApi from '../common/SummaryApi';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { setUserDetails } from '../store/userSlice';

const TableLoginPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const loginWithQR = async () => {
            const token = searchParams.get('token');

            if (!token) {
                setError('Không tìm thấy mã QR. Vui lòng quét lại.');
                setLoading(false);
                return;
            }

            try {
                const response = await Axios({
                    ...SummaryApi.tableLogin,
                    data: { token },
                });

                if (response.data.success) {
                    // Save tokens
                    localStorage.setItem(
                        'accessToken',
                        response.data.data.accessToken
                    );
                    localStorage.setItem(
                        'refreshToken',
                        response.data.data.refreshToken
                    );

                    // Save user details to Redux
                    dispatch(setUserDetails(response.data.data.user));

                    // AC 5.1 / 5.2 – phân biệt phiên mới vs tham gia phiên hiện tại
                    const { hasActiveSession, activeOrderItemCount } =
                        response.data.data.sessionInfo || {};

                    if (hasActiveSession) {
                        toast(`🍽️ Bàn đang có ${activeOrderItemCount} món đã gọi. Bạn đang tham gia phiên hiện tại!`, {
                            duration: 4000,
                            icon: '🪑',
                        });
                    } else {
                        toast.success('Chào mừng! Phiên gọi món mới đã được khởi tạo 🍽️', {
                            duration: 3000,
                        });
                    }

                    // Redirect sang customer checkin (loyalty), truyền hasActiveSession để checkin page biết
                    const { tableId, tableNumber } = response.data.data.user;
                    navigate(
                        `/customer-checkin?tableId=${tableId}&tableNumber=${encodeURIComponent(tableNumber || '')}&hasActiveSession=${hasActiveSession ? '1' : '0'}`
                    );
                } else {
                    setError(response.data.message || 'Đăng nhập thất bại');
                }
            } catch (err) {
                console.error('QR Login Error:', err);
                setError(
                    err.response?.data?.message ||
                        'Đăng nhập thất bại. Vui lòng thử lại.'
                );
            } finally {
                setLoading(false);
            }
        };

        loginWithQR();
    }, [searchParams, navigate, dispatch]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700">Đang xác thực mã QR...</p>
                    <p className="text-sm text-gray-400 mt-1">Vui lòng chờ trong giây lát</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-10 h-10 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        Mã QR không hợp lệ
                    </h2>
                    <p className="text-gray-500 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                        Về trang chủ
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default TableLoginPage;
