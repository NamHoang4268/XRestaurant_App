import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import Axios from '../utils/Axios';
import SummaryApi from '../common/SummaryApi';
import toast from 'react-hot-toast';
import {
    FiRefreshCw, FiWifi, FiWifiOff, FiMaximize, FiMinimize,
    FiPrinter, FiCheckCircle, FiClock, FiDollarSign
} from 'react-icons/fi';
import { MdOutlinePayment, MdTableRestaurant } from 'react-icons/md';
import { BsBellFill } from 'react-icons/bs';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

// ──────────────────────────────────────────────────────
// VietQR config – BIDV account
// ──────────────────────────────────────────────────────
const VIETQR_BANK   = 'BIDV';
const VIETQR_ACCT   = '6331102124';
const VIETQR_NAME   = 'NGO KIM HOANG NAM';

function buildVietQRUrl(amount, description) {
    const desc = encodeURIComponent(description);
    const name = encodeURIComponent(VIETQR_NAME);
    return `https://img.vietqr.io/image/${VIETQR_BANK}-${VIETQR_ACCT}-compact2.png?amount=${amount}&addInfo=${desc}&accountName=${name}`;
}

// ──────────────────────────────────────────────────────
// Print bill helper
// ──────────────────────────────────────────────────────
function printBill(order) {
    const items = order.items || [];
    const total = order.total || 0;
    const now = format(new Date(), 'HH:mm dd/MM/yyyy', { locale: vi });
    const desc = `Thanh toan ban ${order.tableNumber} EatEase`;
    const qrUrl = buildVietQRUrl(total, desc);

    const rows = items.map(item =>
        `<tr>
            <td style="padding:4px 8px">${item.name}</td>
            <td style="padding:4px 8px;text-align:center">x${item.quantity}</td>
            <td style="padding:4px 8px;text-align:right">${(item.price * item.quantity).toLocaleString('vi-VN')}đ</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <title>Hóa đơn – Bàn ${order.tableNumber}</title>
        <style>
            body{font-family:'Arial',sans-serif;max-width:320px;margin:0 auto;padding:16px;font-size:13px}
            h2{text-align:center;margin:0 0 4px}
            p.sub{text-align:center;color:#555;margin:0 0 12px;font-size:11px}
            table{width:100%;border-collapse:collapse}
            thead tr{border-bottom:2px solid #333}
            tfoot tr{border-top:2px solid #333}
            .total{font-weight:bold;font-size:15px}
            .qr-section{text-align:center;margin-top:16px;padding-top:12px;border-top:1px dashed #ccc}
            .qr-section img{width:180px;height:180px;object-fit:contain}
            .qr-section p{font-size:11px;color:#555;margin:4px 0 0}
            .footer{text-align:center;margin-top:12px;font-size:11px;color:#777}
        </style></head><body onload="window.print()">
        <h2>🍽️ EatEase Restaurant</h2>
        <p class="sub">Bàn: ${order.tableNumber} &nbsp;|&nbsp; ${now}</p>
        <table>
            <thead><tr>
                <th style="text-align:left;padding:4px 8px">Món</th>
                <th>SL</th>
                <th style="text-align:right">Tiền</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <td colspan="2" class="total" style="padding:8px 8px 4px">Tổng cộng:</td>
                <td class="total" style="text-align:right;padding:8px 8px 4px">${total.toLocaleString('vi-VN')}đ</td>
            </tr></tfoot>
        </table>

        <!-- VietQR Payment -->
        <div class="qr-section">
            <p style="font-weight:bold;font-size:12px;margin-bottom:6px">📱 Quét mã để thanh toán</p>
            <img src="${qrUrl}" alt="VietQR" />
            <p>${VIETQR_BANK} – ${VIETQR_ACCT}</p>
            <p>${VIETQR_NAME}</p>
            <p style="font-weight:bold;color:#e65c00">${total.toLocaleString('vi-VN')}đ</p>
        </div>

        <p class="footer">Cảm ơn quý khách! Hẹn gặp lại 🙏</p>
        </body></html>`;

    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) { toast.error('Vui lòng cho phép popup để in hóa đơn.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
}

// ──────────────────────────────────────────────────────
// Bill Detail Modal
// ──────────────────────────────────────────────────────
function BillDetailModal({ order, onClose, onConfirm, confirming }) {
    if (!order) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
                {/* Header */}
                <div className="bg-amber-600 rounded-t-2xl px-5 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">🧾 Hóa đơn – Bàn {order.tableNumber}</h2>
                        <p className="text-amber-100 text-sm mt-0.5">
                            {order.items?.length || 0} món
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white text-2xl leading-none hover:text-amber-200">&times;</button>
                </div>

                {/* Items */}
                <div className="p-5 space-y-2 max-h-72 overflow-y-auto">
                    {(order.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-2">
                            <div>
                                <p className="font-semibold text-white">{item.name}</p>
                                {item.note && <p className="text-yellow-400 text-xs">📝 {item.note}</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-gray-400 text-sm">x{item.quantity}</p>
                                <p className="text-amber-400 font-bold">{(item.price * item.quantity).toLocaleString('vi-VN')}đ</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Total */}
                <div className="px-5 pb-2">
                    <div className="flex justify-between items-center bg-amber-900/30 border border-amber-700/40 rounded-xl px-4 py-3">
                        <span className="text-lg font-bold text-white">Tổng cộng:</span>
                        <span className="text-2xl font-bold text-amber-400">{(order.total || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 mt-3 flex gap-3">
                    <button
                        onClick={() => printBill(order)}
                        className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold transition"
                    >
                        <FiPrinter size={18} /> In hóa đơn
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={confirming}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition"
                    >
                        <FiCheckCircle size={18} />
                        {confirming ? 'Đang xử lý...' : 'Xác nhận đã thu tiền'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────
// Main CashierDashboard
// ──────────────────────────────────────────────────────
const CashierDashboard = () => {
    const user = useSelector((s) => s.user);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [clock, setClock] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        const id = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        document.body.style.overflow = isExpanded ? 'hidden' : 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [isExpanded]);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await Axios({ ...SummaryApi.get_cashier_pending_orders });
            if (res.data?.success) setOrders(res.data.data || []);
        } catch {
            toast.error('Không thể tải danh sách thanh toán.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrders();
        const s = io(SOCKET_URL);
        socketRef.current = s;
        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));
        s.on('cashier:new_payment_request', (data) => {
            toast(`💳 Bàn ${data.tableNumber} yêu cầu thanh toán!`, {
                icon: <BsBellFill className="text-amber-500" />,
                duration: 8000,
                style: { border: '2px solid #f59e0b' },
            });
            fetchOrders();
        });
        return () => s.disconnect();
    }, [fetchOrders]);

    const handleConfirmPayment = async () => {
        if (!selectedOrder) return;
        setConfirming(true);
        try {
            const res = await Axios({
                ...SummaryApi.cashier_confirm_payment,
                data: { tableOrderId: selectedOrder._id },
            });
            if (res.data?.success) {
                toast.success('Thanh toán thành công. Đơn hàng đã được hoàn tất.', { duration: 4000 });
                setSelectedOrder(null);
                fetchOrders();
            } else {
                toast.error(res.data?.message || 'Lỗi xác nhận thanh toán.');
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Lỗi xác nhận thanh toán.');
        } finally {
            setConfirming(false);
        }
    };

    const totalPending = orders.reduce((s, o) => s + (o.total || 0), 0);

    return (
        <div className={`min-h-screen bg-gray-950 text-white transition-all duration-300 ${
            isExpanded ? 'fixed inset-0 z-[9999] overflow-y-auto' : 'relative'
        }`}>
            {/* ── Header ── */}
            <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-10">
                <div className="w-full flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <MdOutlinePayment className="text-amber-400 text-3xl" />
                        <div>
                            <h1 className="text-xl font-bold leading-none">Cashier Dashboard</h1>
                            <p className="text-gray-400 text-xs mt-0.5">
                                {clock.toLocaleString('vi-VN', {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                                    weekday: 'short', day: '2-digit', month: '2-digit'
                                })}
                                {user?.name && ` — ${user.name}`}
                            </p>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-4">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-amber-400">{orders.length}</p>
                            <p className="text-xs text-gray-400">Chờ thu tiền</p>
                        </div>
                        <div className="h-8 w-px bg-gray-700" />
                        <div className="text-center">
                            <p className="text-lg font-bold text-green-400">{totalPending.toLocaleString('vi-VN')}đ</p>
                            <p className="text-xs text-gray-400">Tổng cần thu</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                            connected ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                        }`}>
                            {connected ? <FiWifi size={12} /> : <FiWifiOff size={12} />}
                            {connected ? 'Real-time' : 'Offline'}
                        </div>
                        <button
                            onClick={() => setIsExpanded(p => !p)}
                            className="flex items-center justify-center bg-gray-800 hover:bg-gray-700 w-10 h-10 rounded-xl transition"
                        >
                            {isExpanded ? <FiMinimize size={18} /> : <FiMaximize size={18} />}
                        </button>
                        <button
                            onClick={fetchOrders}
                            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-2 h-10 rounded-xl transition text-sm"
                        >
                            <FiRefreshCw size={14} /> Làm mới
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-gray-400">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400 mr-3" />
                        Đang tải...
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
                        <FiDollarSign className="text-6xl text-green-500" />
                        <p className="text-xl">Không có đơn nào chờ thanh toán 🎉</p>
                        <p className="text-sm">Tất cả đơn hàng đã được xử lý</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {orders.map((order) => {
                            const itemCount = order.items?.length || 0;
                            const waitMins = order.checkedOutAt
                                ? Math.floor((Date.now() - new Date(order.checkedOutAt)) / 60000)
                                : null;
                            return (
                                <div key={order._id} className="bg-gray-900 border border-amber-700/40 rounded-2xl overflow-hidden hover:border-amber-500/70 transition-colors">
                                    {/* Card header */}
                                    <div className="bg-amber-900/30 px-4 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <MdTableRestaurant className="text-amber-400 text-xl" />
                                            <h3 className="font-bold text-amber-400 text-lg">Bàn {order.tableNumber}</h3>
                                        </div>
                                        {waitMins !== null && (
                                            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                                                waitMins > 10 ? 'bg-red-900/50 text-red-400' : 'bg-gray-700 text-gray-400'
                                            }`}>
                                                <FiClock size={11} /> {waitMins} phút
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="px-4 py-3">
                                        <p className="text-gray-400 text-sm">{itemCount} món đã gọi</p>
                                        <p className="text-2xl font-bold text-white mt-1">
                                            {(order.total || 0).toLocaleString('vi-VN')}đ
                                        </p>
                                        <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                                            {(order.items || []).slice(0, 4).map((item, i) => (
                                                <p key={i} className="text-xs text-gray-500">• {item.name} x{item.quantity}</p>
                                            ))}
                                            {itemCount > 4 && (
                                                <p className="text-xs text-gray-600">+{itemCount - 4} món khác...</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="px-4 pb-4 flex gap-2">
                                        <button
                                            onClick={() => printBill(order)}
                                            className="flex-1 flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-xl text-sm font-semibold transition"
                                        >
                                            <FiPrinter size={15} /> In bill
                                        </button>
                                        <button
                                            onClick={() => setSelectedOrder(order)}
                                            className="flex-1 flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-xl text-sm font-bold transition"
                                        >
                                            <FiCheckCircle size={15} /> Thu tiền
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <BillDetailModal
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onConfirm={handleConfirmPayment}
                confirming={confirming}
            />
        </div>
    );
};

export default CashierDashboard;
