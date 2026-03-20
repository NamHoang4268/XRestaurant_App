import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
    FaSearch,
    FaFileInvoice,
    FaFileExcel,
    FaFilter,
    FaEye,
    FaEdit,
    FaTimesCircle
} from 'react-icons/fa';
import { LuCheck, LuPrinter } from 'react-icons/lu';
import { DisplayPriceInVND } from '../utils/DisplayPriceInVND';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { fetchAllOrders, updateOrderStatus } from '../store/orderSlice';
import ConfirmBox from '../components/ConfirmBox';
import Loading from '../components/Loading';
import { Input } from '@/components/ui/input';
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Label } from '@radix-ui/react-label';

const BillPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { allOrders: orders = [], loading } = useSelector(
        (state) => state.orders
    );
    const user = useSelector((state) => state.user);
    const canAccessBills = ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'].includes(
        user?.role
    );
    
    // Roles for specific actions
    const canUpdateStatus = ['ADMIN', 'MANAGER', 'WAITER'].includes(user?.role);
    const canPay = ['ADMIN', 'MANAGER', 'CASHIER'].includes(user?.role);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm.trim().toLowerCase());
            setCurrentPage(1); // Reset page on new search
        }, 300); // 300ms debounce
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [filterParams, setFilterParams] = useState({
        status: '',
        startDate: '',
        endDate: '',
    });
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [dateError, setDateError] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modals state
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [openDetailView, setOpenDetailView] = useState(false);
    const [openUpdateStatus, setOpenUpdateStatus] = useState(false);
    const [openPaymentConfirm, setOpenPaymentConfirm] = useState(false);
    const [openCancelConfirm, setOpenCancelConfirm] = useState(false);
    const [newStatusProcess, setNewStatusProcess] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const [isUpdatingSubStatus, setIsUpdatingSubStatus] = useState(false);

    useEffect(() => {
        const loadOrders = async () => {
            const accessToken = localStorage.getItem('accesstoken');
            if (!accessToken || !canAccessBills) {
                navigate('/dashboard/profile');
                return;
            }

            try {
                await dispatch(fetchAllOrders(filterParams)).unwrap();
            } catch (error) {
                if (error?.response?.status !== 401) {
                    toast.error(error || 'Có lỗi xảy ra khi tải đơn hàng');
                }
            }
        };

        loadOrders();
    }, [dispatch, canAccessBills, navigate, filterParams]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        const newParams = { ...filterParams, [name]: value };

        if (newParams.startDate && newParams.endDate) {
            const startDate = new Date(newParams.startDate);
            const endDate = new Date(newParams.endDate);

            if (startDate > endDate) {
                setDateError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
                return;
            }
        }
        setDateError('');
        setFilterParams(newParams);
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setFilterParams({ status: '', startDate: '', endDate: '' });
        setSearchTerm('');
        setDateError('');
        setCurrentPage(1);
    };

    useEffect(() => {
        try {
            let result = [...orders];

            if (filterParams.status) {
                result = result.filter(
                    (order) => order.payment_status === filterParams.status
                );
            }

            if (filterParams.startDate) {
                const startDate = new Date(filterParams.startDate);
                result = result.filter((order) => new Date(order.createdAt) >= startDate);
            }

            if (filterParams.endDate) {
                const endDate = new Date(filterParams.endDate);
                endDate.setHours(23, 59, 59, 999);
                result = result.filter((order) => new Date(order.createdAt) <= endDate);
            }

            setFilteredOrders(result);
        } catch (error) {
            console.error('Error filtering orders:', error);
            setFilteredOrders(orders);
        }
    }, [orders, searchTerm, filterParams]);

    // Grouping orders by Table Number + Time Window (e.g. 2 phút)
    // vì order ảo trên cùng bàn chênh lệnh 1 2 phút chung quy vẫn thuộc 1 hóa đơn chung
    const groupedOrders = useMemo(() => {
        const TIME_WINDOW_MS = 2 * 60 * 1000;
        const groups = [];

        // Sort ascending by time so chronological grouping is consecutive
        const sortedOrders = [...filteredOrders].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        sortedOrders.forEach((ob) => {
            const tableNum = ob.tableNumber && ob.tableNumber !== '-' && ob.tableNumber !== 'null' ? ob.tableNumber : 'Mang đi/Khác';
            const itemTime = new Date(ob.createdAt).getTime();
            
            let group = groups.find(g => {
                // Nếu cùng orderId nguyên bản thì chắc chắn gom lại
                if (ob.orderId && g.originalOrderIds.includes(ob.orderId)) {
                    return true;
                }
                // Nếu là bàn giống nhau và không phải "Mang đi" thì check khoảng thời gian (2 phút)
                if (tableNum !== 'Mang đi/Khác' && g.tableNumber === tableNum) {
                    return Math.abs(g.baseTime - itemTime) <= TIME_WINDOW_MS;
                }
                // Nếu không (Takeaway hoặc cách nhau quá lịch) thì tạo đơn mới
                return false;
            });

            if (!group) {
                // Tạo ID hóa đơn ảo: Vd: TB2-1430 hoặc lấy hash nhẹ
                const displayId = tableNum !== 'Mang đi/Khác' 
                    ? `TB${tableNum}-${format(new Date(ob.createdAt), 'HHmm')}` 
                    : `MD-${format(new Date(ob.createdAt), 'HHmm')}-${Math.floor(100 + Math.random() * 900)}`;
                
                group = {
                    virtualId: displayId,
                    orderId: displayId, // Hiển thị dưới dạng "Mã đơn hàng" trên giao diện
                    originalOrderIds: ob.orderId ? [ob.orderId] : [], 
                    tableNumber: tableNum,
                    payment_status: ob.payment_status || 'Chờ xử lý',
                    createdAt: ob.createdAt, // Lấy thời gian sớm nhất
                    baseTime: itemTime,      // Mốc tính time window
                    customerName: ob.userId?.name || 'Khách vãng lai',
                    customerPhone: ob.userId?.mobile || '',
                    totalAmt: 0,
                    items: [],
                    documentIds: []
                };
                groups.push(group);
            } else {
                if (ob.orderId && !group.originalOrderIds.includes(ob.orderId)) {
                    group.originalOrderIds.push(ob.orderId);
                }
                // Chỉnh logic status: Nếu một trong số các items chưa thanh toán, thì state cả nhóm không thể là Đã thanh toán
                if (group.payment_status === 'Đã thanh toán' && ob.payment_status !== 'Đã thanh toán') {
                    group.payment_status = ob.payment_status; 
                }
            }
            
            if (!group.documentIds.includes(ob._id)) {
                group.documentIds.push(ob._id);
            }
            
            // Add quantity/price calculation
            if (ob.products && ob.products.length > 0) {
                 ob.products.forEach(p => {
                      group.items.push({
                          name: p.name || 'N/A',
                          quantity: p.quantity || 1,
                          price: p.price || 0,
                      });
                 });
                 group.totalAmt += ob.totalAmt || 0;
            } else {
                 const qty = ob.quantity || 1;
                 const lineTotal = ob.totalAmt || 0;
                 const unitPrice = qty > 0 ? (lineTotal / qty) : 0;
                 group.items.push({
                     name: ob.product_details?.name || 'N/A',
                     quantity: qty,
                     price: unitPrice,
                 });
                 group.totalAmt += lineTotal;
            }
        });

        // Trả về danh sách được sắp xếp mới nhất lên đầu để đưa ra UI
        return groups.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [filteredOrders]);

    // Apply search on grouped orders
    const searchedOrders = useMemo(() => {
        if (!debouncedSearch) return groupedOrders;
        
        return groupedOrders.filter(group => {
            const searchFields = [
                group.orderId,        // Virtual ID
                group.tableNumber,    // Số bàn
                ...(group.originalOrderIds || []), // Các ID thật từ db (Mã đơn hàng gốc)
                ...(group.documentIds || [])       // ObjectID database
            ].filter(Boolean);
            
            return searchFields.some(field => 
                String(field).toLowerCase().includes(debouncedSearch)
            );
        });
    }, [groupedOrders, debouncedSearch]);

    const { totalRevenue, orderCount } = useMemo(() => {
        return searchedOrders.reduce(
            (acc, order) => ({
                totalRevenue: acc.totalRevenue + (order.totalAmt || 0),
                orderCount: acc.orderCount + 1,
            }),
            { totalRevenue: 0, orderCount: 0 }
        );
    }, [searchedOrders]);

    const getStatusBadge = (status) => {
        const statusConfig = {
            'Chờ xử lý': { text: 'Chờ xử lý', className: 'bg-zinc-100 text-zinc-800' },
            'Đang chuẩn bị': { text: 'Đang chuẩn bị', className: 'bg-blue-100 text-blue-800' },
            'Đã phục vụ': { text: 'Đã phục vụ', className: 'bg-indigo-100 text-indigo-800' },
            'Đang chờ thanh toán': { text: 'Chờ thanh toán', className: 'bg-yellow-100 text-yellow-800' },
            'Chờ thanh toán': { text: 'Chờ thanh toán', className: 'bg-yellow-100 text-yellow-800' },
            'Đã thanh toán': { text: 'Đã thanh toán', className: 'bg-green-100 text-green-800' },
            'Đã hủy': { text: 'Đã hủy', className: 'bg-red-100 text-red-800' },
        };
        const config = statusConfig[status] || { text: status || 'Chưa xác định', className: 'bg-gray-100 text-gray-800' };
        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
                {config.text}
            </span>
        );
    };

    const handleUpdateStatusGroup = async (group, status, reason = '') => {
        try {
            setIsUpdatingSubStatus(true);
            const promises = group.documentIds.map(docId => {
                const updateData = { orderId: docId, status };
                if (status === 'Đã hủy' && reason) {
                    updateData.cancelReason = reason;
                }
                return dispatch(updateOrderStatus(updateData)).unwrap();
            });
            
            await Promise.all(promises);
            await dispatch(fetchAllOrders(filterParams)).unwrap();

            toast.success(`Cập nhật trạng thái thành "${status}" thành công!`);
            
            setOpenUpdateStatus(false);
            setOpenPaymentConfirm(false);
            setOpenCancelConfirm(false);
            setOpenDetailView(false);
            setSelectedOrder(null);
            setCancelReason('');
        } catch (error) {
            toast.error(error?.message || 'Cập nhật thất bại');
        } finally {
            setIsUpdatingSubStatus(false);
        }
    };

    const exportToExcel = () => {
        const data = groupedOrders.map((order) => ({
            'Mã hóa đơn': order.orderId,
            'Số bàn': order.tableNumber,
            'Ngày tạo': format(new Date(order.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi }),
            'Khách hàng': order.customerName,
            'Sản phẩm (SL)': order.items.map(i => `${i.name} (x${i.quantity})`).join(', '),
            'Tổng tiền': order.totalAmt,
            'Trạng thái': order.payment_status,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Danh sách đơn hàng');
        XLSX.writeFile(wb, `danh-sach-don-hang-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const printBill = (orderGroup) => {
        const printWindow = window.open('', '_blank');
        const itemsHtml = orderGroup.items.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td class="text-right">${DisplayPriceInVND(item.price)}</td>
                <td class="text-center">${item.quantity}</td>
                <td class="text-right">${DisplayPriceInVND(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html><head><title>Hóa đơn ${orderGroup.orderId}</title>
            <style>
                body { font-family: Arial; font-size: 12px; padding: 20px; }
                .header, .info, .table, .signature { margin-bottom: 20px; }
                .title { font-size: 18px; font-weight: bold; text-align: center; }
                .info-row { display: flex; margin-bottom: 5px; }
                .info-label { font-weight: bold; width: 120px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px bottom solid #ddd; padding: 8px; text-align: left; }
                th { background: #f2f2f2; border-bottom: 2px solid #333; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .total-row td { border-top: 2px solid #333; font-weight: bold; }
            </style>
            </head><body onload="window.print()">
                <div class="title">HÓA ĐƠN THANH TOÁN</div>
                <div style="text-align:center; margin-bottom: 20px;">
                    Ngày: ${format(new Date(orderGroup.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                </div>
                <div class="info">
                    <div class="info-row"><div class="info-label">Mã HD:</div><div>${orderGroup.orderId}</div></div>
                    <div class="info-row"><div class="info-label">Số bàn:</div><div>${orderGroup.tableNumber}</div></div>
                    <div class="info-row"><div class="info-label">Khách:</div><div>${orderGroup.customerName}<br>${orderGroup.customerPhone}</div></div>
                </div>
                <table>
                    <thead><tr><th>STT</th><th>Sản phẩm</th><th class="text-right">Đơn giá</th><th class="text-center">SL</th><th class="text-right">Thành tiền</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="4" class="text-right">Tổng thanh toán:</td>
                            <td class="text-right">${DisplayPriceInVND(orderGroup.totalAmt)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div class="signature" style="display:flex; justify-content: space-between; margin-top: 50px;">
                    <div class="text-center">Người lập<br><br><br>(Ký, ghi rõ họ tên)</div>
                    <div class="text-center">Khách hàng<br><br><br>(Ký, ghi rõ họ tên)</div>
                </div>
            </body></html>
        `);
        printWindow.document.close();
    };

    const statusOptions = [
        { value: '', label: 'Tất cả' },
        { value: 'Chờ xử lý', label: 'Chờ xử lý' },
        { value: 'Đang chuẩn bị', label: 'Đang chuẩn bị' },
        { value: 'Đã phục vụ', label: 'Đã phục vụ' },
        { value: 'Đang chờ thanh toán', label: 'Đang chờ thanh toán' },
        { value: 'Đã thanh toán', label: 'Đã thanh toán' },
        { value: 'Đã hủy', label: 'Đã hủy' }
    ];

    // Helper to evaluate if order can be cancelled
    const canCancelOrder = (status) => {
        return ['Chờ xử lý', 'Đang chờ thanh toán', 'Chờ thanh toán'].includes(status);
    };

    // Calculate Pagination
    const totalItems = searchedOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    // Synchronize currentPage if validCurrentPage differs due to filtering
    useEffect(() => {
        if (currentPage !== validCurrentPage && validCurrentPage >= 1) {
            setCurrentPage(validCurrentPage);
        }
    }, [currentPage, validCurrentPage]);

    const startIndex = (validCurrentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    
    const paginatedOrders = searchedOrders.slice(startIndex, endIndex);

    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return (
        <section className="container mx-auto grid gap-2 z-10">
            <Card className="py-6 flex-row justify-between gap-6 border-card-foreground">
                <CardHeader>
                    <CardTitle className="text-lg text-highlight font-bold uppercase">
                        Quản lý đơn hàng
                    </CardTitle>
                    <CardDescription>Danh sách đơn hàng và thanh toán</CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 py-2">
                <div className="liquid-glass rounded-lg shadow-md p-3 flex items-center gap-4">
                    <div className="p-3 rounded-full border-[3px] liquid-glass text-highlight">
                        <FaFileInvoice className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold">Tổng số hóa đơn</p>
                        <p className="text-xl font-bold">{orderCount}</p>
                    </div>
                </div>
                <div className="liquid-glass rounded-lg shadow-md p-3 flex items-center gap-4">
                    <div className="p-3 rounded-full border-[3px] liquid-glass text-highlight">
                        <FaFileInvoice className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold">Tổng doanh thu</p>
                        <p className="text-xl font-bold">{DisplayPriceInVND(totalRevenue)}</p>
                    </div>
                </div>
                <div className="liquid-glass rounded-lg shadow-md p-3 flex items-center gap-4">
                    <div className="p-3 rounded-full border-[3px] liquid-glass text-highlight">
                        <FaFilter className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold">Đang hiển thị</p>
                        <p className="text-xl font-bold">{paginatedOrders.length} / {searchedOrders.length}</p>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className="rounded-lg border-2 liquid-glass px-4 py-6 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                    <div className="space-y-2">
                        <Label className="block font-medium">Tìm kiếm</Label>
                        <div className="relative">
                            <Input
                                type="text"
                                placeholder="Mã đơn, Số bàn..."
                                className="w-full pl-10 h-10 text-sm placeholder:text-foreground border-foreground bg-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-50" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="block font-medium">Trạng thái</Label>
                        <select
                            name="status"
                            className="text-sm h-10 w-full border-foreground border bg-background px-3 rounded-md cursor-pointer"
                            value={filterParams.status}
                            onChange={handleFilterChange}
                        >
                            {statusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label className="block font-medium mb-1">Từ ngày</Label>
                        <input
                            type="date"
                            name="startDate"
                            className="text-sm h-10 w-full border-foreground border bg-background px-3 rounded-md"
                            value={filterParams.startDate}
                            onChange={handleFilterChange}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="block font-medium mb-1">Đến ngày</Label>
                        <input
                            type="date"
                            name="endDate"
                            className={`w-full h-10 border ${dateError ? 'border-red-500' : 'border-foreground'} bg-background px-3 rounded-md text-sm`}
                            value={filterParams.endDate}
                            onChange={handleFilterChange}
                            min={filterParams.startDate}
                        />
                        {dateError && <p className="mt-1 text-xs text-red-500">{dateError}</p>}
                    </div>
                </div>

                <div className="flex justify-end mt-4 gap-2">
                    <button onClick={resetFilters} className="px-4 h-9 font-medium border border-border rounded-lg text-sm bg-background hover:bg-muted">
                        Đặt lại
                    </button>
                    <button onClick={exportToExcel} className="flex items-center px-4 h-9 text-white bg-green-600 rounded-lg hover:bg-green-700 text-sm">
                        <FaFileExcel className="mr-2" /> Xuất Excel
                    </button>
                </div>
            </div>

            {/* Custom Simple Table */}
            <div className="overflow-x-auto w-full bg-background border border-border rounded-lg shadow-sm">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-xs uppercase bg-muted text-muted-foreground border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-bold">Mã đơn hàng</th>
                            <th className="px-6 py-4 font-bold text-center">Số bàn</th>
                            <th className="px-6 py-4 font-bold text-right">Tổng tiền</th>
                            <th className="px-6 py-4 font-bold text-center">Trạng thái</th>
                            <th className="px-6 py-4 font-bold text-center">Thời gian tạo</th>
                            <th className="px-6 py-4 font-bold text-center">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedOrders.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-muted-foreground">
                                    Không có đơn hàng
                                </td>
                            </tr>
                        ) : (
                            paginatedOrders.map((order, idx) => (
                                <tr key={order.orderId} className={`border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                                    <td className="px-6 py-4 font-medium text-rose-500">{order.orderId}</td>
                                    <td className="px-6 py-4 text-center font-bold">{order.tableNumber}</td>
                                    <td className="px-6 py-4 text-right font-medium text-green-600">
                                        {DisplayPriceInVND(order.totalAmt)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {getStatusBadge(order.payment_status)}
                                    </td>
                                    <td className="px-6 py-4 text-center text-muted-foreground">
                                        {format(new Date(order.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button 
                                                onClick={() => { setSelectedOrder(order); setOpenDetailView(true); }}
                                                className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                                                title="Xem chi tiết"
                                            >
                                                <FaEye size={16} />
                                            </button>

                                            {/* Action for Waiter to change status (not complete payment) */}
                                            {canUpdateStatus && !['Đã thanh toán', 'Đã hủy'].includes(order.payment_status) && (
                                                <button
                                                    onClick={() => { setSelectedOrder(order); setNewStatusProcess(order.payment_status); setOpenUpdateStatus(true); }}
                                                    className="p-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200 transition-colors"
                                                    title="Cập nhật trạng thái"
                                                >
                                                    <FaEdit size={16} />
                                                </button>
                                            )}

                                            {/* Action for Cashier to complete payment */}
                                            {canPay && ['Chờ xử lý', 'Đang chuẩn bị', 'Đã phục vụ', 'Đang chờ thanh toán', 'Chờ thanh toán'].includes(order.payment_status) && (
                                                <button
                                                    onClick={() => { setSelectedOrder(order); setOpenPaymentConfirm(true); }}
                                                    className="p-2 bg-green-100 text-green-600 rounded hover:bg-green-200 transition-colors"
                                                    title="Xác nhận thanh toán"
                                                >
                                                    <LuCheck size={16} />
                                                </button>
                                            )}

                                            {/* Action to Cancel if not handled entirely */}
                                            {canCancelOrder(order.payment_status) && (
                                                <button
                                                    onClick={() => { setSelectedOrder(order); setOpenCancelConfirm(true); }}
                                                    className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                                                    title="Hủy đơn"
                                                >
                                                    <FaTimesCircle size={16} />
                                                </button>
                                            )}
                                            
                                            <button
                                                onClick={() => printBill(order)}
                                                className="p-2 bg-zinc-100 text-zinc-600 rounded hover:bg-zinc-200 transition-colors"
                                                title="In hóa đơn"
                                            >
                                                <LuPrinter size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-2 text-sm text-foreground">
                    <div className="flex items-center gap-2">
                        <span>Hiển thị</span>
                        <select
                            className="border border-border rounded-md px-2 py-1 bg-background text-foreground cursor-pointer focus:outline-none"
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                        <span>mỗi trang</span>
                    </div>

                    <div className="text-muted-foreground">
                        Hiển thị {startIndex + 1} đến {endIndex} trong {totalItems} kết quả
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handlePageChange(1)}
                            disabled={validCurrentPage === 1}
                            className={`p-1 px-2 border border-border rounded-md transition-colors ${validCurrentPage === 1 ? 'bg-muted/30 opacity-50 cursor-not-allowed text-muted-foreground' : 'bg-background hover:bg-muted text-foreground'}`}
                            title="Trang đầu"
                        >
                            {'<<'}
                        </button>
                        <button
                            onClick={() => handlePageChange(validCurrentPage - 1)}
                            disabled={validCurrentPage === 1}
                            className={`p-1 px-2 border border-border rounded-md transition-colors ${validCurrentPage === 1 ? 'bg-muted/30 opacity-50 cursor-not-allowed text-muted-foreground' : 'bg-background hover:bg-muted text-foreground'}`}
                            title="Trang trước"
                        >
                            {'<'}
                        </button>

                        <div className="flex items-center mx-1">
                            <span className="hidden sm:inline-block mr-2">Trang</span>
                            <select
                                className="border border-border rounded-md px-2 py-1 bg-background text-foreground cursor-pointer focus:outline-none"
                                value={validCurrentPage}
                                onChange={(e) => handlePageChange(Number(e.target.value))}
                            >
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <option key={page} value={page}>{page}</option>
                                ))}
                            </select>
                            <span className="ml-2">/ {totalPages}</span>
                        </div>

                        <button
                            onClick={() => handlePageChange(validCurrentPage + 1)}
                            disabled={validCurrentPage === totalPages}
                            className={`p-1 px-2 border border-border rounded-md transition-colors ${validCurrentPage === totalPages ? 'bg-muted/30 opacity-50 cursor-not-allowed text-muted-foreground' : 'bg-background hover:bg-muted text-foreground'}`}
                            title="Trang sau"
                        >
                            {'>'}
                        </button>
                        <button
                            onClick={() => handlePageChange(totalPages)}
                            disabled={validCurrentPage === totalPages}
                            className={`p-1 px-2 border border-border rounded-md transition-colors ${validCurrentPage === totalPages ? 'bg-muted/30 opacity-50 cursor-not-allowed text-muted-foreground' : 'bg-background hover:bg-muted text-foreground'}`}
                            title="Trang cuối"
                        >
                            {'>>'}
                        </button>
                    </div>
                </div>
            )}

            {loading && <Loading />}

            {/* View Details Modal */}
            {openDetailView && selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-lg font-bold">Chi tiết đơn hàng {selectedOrder.orderId}</h3>
                            <button onClick={() => setOpenDetailView(false)} className="text-gray-500 hover:text-red-500 p-1">
                                <FaTimesCircle size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Số bàn</p>
                                    <p className="font-bold text-lg">{selectedOrder.tableNumber}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Trạng thái</p>
                                    <div>{getStatusBadge(selectedOrder.payment_status)}</div>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Khách hàng</p>
                                    <p className="font-medium">{selectedOrder.customerName}</p>
                                    <p className="text-xs">{selectedOrder.customerPhone}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Thời gian tạo</p>
                                    <p className="font-medium">{format(new Date(selectedOrder.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}</p>
                                </div>
                            </div>

                            <h4 className="font-bold border-b pb-2 mb-3">Danh sách món</h4>
                            <div className="space-y-3 mb-6">
                                {selectedOrder.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center bg-muted/30 p-3 rounded-lg">
                                        <div className="flex-1">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-sm text-red-500">{DisplayPriceInVND(item.price)}</p>
                                        </div>
                                        <div className="px-4 font-bold text-gray-600">x{item.quantity}</div>
                                        <div className="font-bold min-w-[100px] text-right">
                                            {DisplayPriceInVND(item.price * item.quantity)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg border">
                                <span className="font-bold text-lg">Tổng tiền thanh toán</span>
                                <span className="font-bold text-2xl text-green-600">{DisplayPriceInVND(selectedOrder.totalAmt)}</span>
                            </div>
                        </div>
                        <div className="p-4 border-t flex justify-end gap-3 bg-muted/20">
                            {canPay && !['Đã thanh toán', 'Đã hủy'].includes(selectedOrder.payment_status) && (
                                <button
                                    onClick={() => handleUpdateStatusGroup(selectedOrder, 'Đã thanh toán')}
                                    disabled={isUpdatingSubStatus}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                                >
                                    {isUpdatingSubStatus ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                                </button>
                            )}
                            <button onClick={() => setOpenDetailView(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-medium">
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Update Status Modal (Waiter) */}
            {openUpdateStatus && selectedOrder && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-background rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b">
                            <h3 className="text-lg font-bold">Cập nhật trạng thái</h3>
                            <p className="text-sm text-gray-500">Đơn hàng {selectedOrder.orderId}</p>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <Label className="block mb-2 font-medium">Trạng thái hiện tại</Label>
                                    <div className="mb-4">{getStatusBadge(selectedOrder.payment_status)}</div>
                                </div>
                                <Label className="block mb-2 font-medium">Chọn trạng thái mới</Label>
                                <select 
                                    className="w-full border rounded-md p-2"
                                    value={newStatusProcess}
                                    onChange={(e) => setNewStatusProcess(e.target.value)}
                                >
                                    <option value="Chờ xử lý">Chờ xử lý</option>
                                    <option value="Đang chuẩn bị">Đang chuẩn bị</option>
                                    <option value="Đã phục vụ">Đã phục vụ</option>
                                    <option value="Đang chờ thanh toán">Đang chờ thanh toán</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-4 border-t flex justify-end gap-3 bg-muted/20">
                            <button onClick={() => setOpenUpdateStatus(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded font-medium">
                                Hủy
                            </button>
                            <button
                                onClick={() => handleUpdateStatusGroup(selectedOrder, newStatusProcess)}
                                disabled={isUpdatingSubStatus}
                                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium disabled:opacity-50"
                            >
                                {isUpdatingSubStatus ? 'Đang xử lý...' : 'Cập nhật'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Confirm Box */}
            {openPaymentConfirm && selectedOrder && (
                <ConfirmBox
                    open={openPaymentConfirm}
                    close={() => { setOpenPaymentConfirm(false); setSelectedOrder(null); }}
                    confirm={() => handleUpdateStatusGroup(selectedOrder, 'Đã thanh toán')}
                    title="Xác nhận thanh toán"
                    message={`Đánh dấu đơn hàng ${selectedOrder.orderId} là Đã thanh toán?`}
                    confirmText="Xác nhận"
                    cancelText="Hủy"
                />
            )}

            {/* Cancel Confirm Box */}
            {openCancelConfirm && selectedOrder && (
                 <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                 <div className="bg-background rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                     <div className="p-4 border-b">
                         <h3 className="text-lg font-bold text-red-600">Hủy đơn hàng</h3>
                     </div>
                     <div className="p-6">
                         <p className="mb-4">Bạn có chắc chắn muốn hủy đơn hàng <strong>{selectedOrder.orderId}</strong>?</p>
                         <Label className="block mb-2 text-sm font-medium">Lý do hủy:</Label>
                         <Input
                             type="text"
                             value={cancelReason}
                             onChange={(e) => setCancelReason(e.target.value)}
                             placeholder="Nhập lý do hủy..."
                             className="w-full"
                         />
                     </div>
                     <div className="p-4 border-t flex justify-end gap-3 bg-muted/20">
                         <button onClick={() => { setOpenCancelConfirm(false); setCancelReason(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded font-medium">
                             Đóng
                         </button>
                         <button
                             onClick={() => handleUpdateStatusGroup(selectedOrder, 'Đã hủy', cancelReason || 'Khách hủy')}
                             disabled={isUpdatingSubStatus}
                             className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium disabled:opacity-50"
                         >
                             {isUpdatingSubStatus ? 'Đang xử lý...' : 'Xác nhận Hủy'}
                         </button>
                     </div>
                 </div>
             </div>
            )}

        </section>
    );
};

export default BillPage;
