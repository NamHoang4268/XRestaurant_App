import { Outlet, useLocation } from 'react-router-dom';
import './App.css';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import fetchUserDetails from './utils/fetchUserDetails';
import { useDispatch } from 'react-redux';
import { setUserDetails } from './store/userSlice';
import {
    setAllCategory,
    setLoadingCategory,
    setAllSubCategory,
} from './store/productSlice';
import Axios from './utils/Axios';
import SummaryApi from './common/SummaryApi';
import GlobalProvider from './provider/GlobalProvider';
import AxiosToastError from './utils/AxiosToastError';
import Header from './components/Header';
import { Footer } from './components/footer';
import LiquidEther from './components/LiquidEther';
import AiChatBox from './components/AiChatBox';
import SupportChatBox from './components/SupportChatBox';
import { SupportChatProvider } from './contexts/SupportChatContext';

function App() {
    const dispatch = useDispatch();
    const location = useLocation();

    // Layouts mà KHÔNG hiện Header/Footer (auth pages)
    const hideLayout = [
        '/login',
        '/register',
        '/registration-success',
        '/forgot-password',
        '/verification-otp',
        '/reset-password',
        '/verify-email',
    ].some((path) => location.pathname.startsWith(path));

    // Layouts riêng: admin dashboard, table flow, kitchen
    const dashBoardLayout = [
        '/admin',
        '/dashboard',
        '/table-menu',
        '/table-order-management',
        '/table-payment-success',
        '/kitchen',
        '/waiter-board',
        '/chef-board',
        '/cashier-board',
        '/customer-checkin',
    ].some((path) => location.pathname.startsWith(path));

    useEffect(() => {
        (async () => {
            // 1) User
            const res = await fetchUserDetails();
            dispatch(setUserDetails(res?.success ? res.data : null));

            // 2) Category + SubCategory (song song)
            try {
                dispatch(setLoadingCategory(true));
                const [catRes, subCatRes] = await Promise.all([
                    Axios({ ...SummaryApi.get_category }),
                    Axios({ ...SummaryApi.get_sub_category }),
                ]);

                if (catRes.data?.success) {
                    dispatch(
                        setAllCategory(
                            catRes.data.data.sort((a, b) =>
                                a.name.localeCompare(b.name)
                            )
                        )
                    );
                }
                if (subCatRes.data?.success) {
                    dispatch(
                        setAllSubCategory(
                            subCatRes.data.data.sort((a, b) =>
                                a.name.localeCompare(b.name)
                            )
                        )
                    );
                }
            } catch (e) {
                AxiosToastError(e);
            } finally {
                dispatch(setLoadingCategory(false));
            }
        })();
    }, [dispatch]);

    const liquidEther = (
        <div className="fixed inset-0 z-0 pointer-events-none">
            <LiquidEther
                colors={['#f5e6d3', '#e8d5c4', '#d4a574']}
                isViscous={false}
                iterationsViscous={8}
                iterationsPoisson={8}
                resolution={0.3}
                autoDemo={true}
                autoSpeed={0.2}
                autoRampDuration={0.8}
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );

    return (
        <GlobalProvider>
            <SupportChatProvider>
                {/* === Trang khách hàng (có Header + Footer) === */}
                {!hideLayout && !dashBoardLayout && (
                    <>
                        <Header />
                        <main className="min-h-[80vh]">
                            {liquidEther}
                            <div className="relative">
                                <Outlet />
                            </div>
                        </main>
                        <Footer />
                    </>
                )}

                {/* === Auth pages (không Header/Footer) === */}
                {hideLayout && (
                    <main className="min-h-screen">
                        {liquidEther}
                        <div className="relative">
                            <Outlet />
                        </div>
                    </main>
                )}

                {/* === Dashboard / Table / Kitchen / Waiter layouts === */}
                {dashBoardLayout && (
                    <main className="min-h-screen">
                        {liquidEther}
                        <div className="relative">
                            <Outlet />
                        </div>
                    </main>
                )}

                <Toaster />

                {/* AI Chatbox & Support Chat — chỉ hiện trên trang khách hàng */}
                {!hideLayout && !dashBoardLayout && <AiChatBox />}
                {!hideLayout && !dashBoardLayout && <SupportChatBox />}
            </SupportChatProvider>
        </GlobalProvider>
    );
}

export default App;
