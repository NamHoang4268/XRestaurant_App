import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { getSocket, destroySocket } from '../utils/socket';
import {
    MessageCircle,
    X,
    Send,
    ChevronDown,
    Headphones,
    Wifi,
    WifiOff,
    Maximize,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Dùng prefix để phân biệt guest session và user session
const GUEST_STORAGE_KEY = 'tc_support_conv_guest';
const USER_STORAGE_KEY_PREFIX = 'tc_support_conv_user_';

function getStorageKey(userId) {
    return userId ? `${USER_STORAGE_KEY_PREFIX}${userId}` : GUEST_STORAGE_KEY;
}

function ChatBubble({ msg }) {
    const isUser = msg.senderRole === 'customer';
    return (
        <div
            className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end mb-3`}
        >
            {!isUser && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow">
                    <Headphones size={13} className="text-white" />
                </div>
            )}
            <div
                className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isUser
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-br-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm border border-gray-100 dark:border-gray-700'
                }`}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
                {msg.text}
            </div>
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex gap-2 items-end mb-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow">
                <Headphones size={13} className="text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((d) => (
                        <span
                            key={d}
                            className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function SupportChatBox() {
    const user = useSelector((state) => state.user);

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [connected, setConnected] = useState(false);
    const [isClosed, setIsClosed] = useState(false);
    const [adminTyping, setAdminTyping] = useState(false);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const [guestName, setGuestName] = useState('');
    // nameEntered: true nếu user đã đăng nhập hoặc guest đã nhập tên
    const [nameEntered, setNameEntered] = useState(false);

    const conversationIdRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const socketRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    // Lưu userId trước đó để phát hiện thay đổi auth state
    const prevUserIdRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (isOpen && !isMinimized) scrollToBottom();
    }, [messages, isOpen, isMinimized, scrollToBottom]);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            setHasNewMessage(false);
            inputRef.current?.focus();
        }
    }, [isOpen, isMinimized]);

    // Hàm đăng ký các socket event listeners
    const registerSocketEvents = useCallback(
        (socket, resolvedName, resolvedUserId) => {
            // Dọn listener cũ trước khi đăng ký mới
            socket.off('connect');
            socket.off('conversation:joined');
            socket.off('message:new');
            socket.off('admin:typing');
            socket.off('conversation:closed');
            socket.off('disconnect');
            socket.off('reconnect');

            const storageKey = getStorageKey(resolvedUserId);
            const savedConvId = localStorage.getItem(storageKey);
            if (savedConvId) conversationIdRef.current = savedConvId;

            const doJoin = () => {
                socket.emit('customer:join', {
                    conversationId: conversationIdRef.current,
                    customerName: resolvedName,
                    customerId: resolvedUserId || null,
                });
            };

            socket.on('connect', () => {
                setConnected(true);
                doJoin();
            });

            socket.on(
                'conversation:joined',
                ({ conversationId, messages: history, status }) => {
                    conversationIdRef.current = conversationId;
                    localStorage.setItem(storageKey, conversationId);
                    setMessages(history || []);
                    setIsClosed(status === 'closed');
                }
            );

            socket.on('message:new', (msg) => {
                setMessages((prev) => [...prev, msg]);
                if (!isOpen || isMinimized) setHasNewMessage(true);
                if (msg.senderRole === 'admin') setAdminTyping(false);
            });

            socket.on('admin:typing', () => {
                setAdminTyping(true);
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(
                    () => setAdminTyping(false),
                    3000
                );
            });

            socket.on('conversation:closed', () => setIsClosed(true));

            socket.on('disconnect', () => setConnected(false));

            socket.on('reconnect', () => {
                doJoin();
            });
        },
        [isOpen, isMinimized]
    );

    // Hàm kết nối socket và join conversation
    const connectAndJoin = useCallback(
        (name, userId) => {
            const socket = getSocket();
            socketRef.current = socket;

            registerSocketEvents(socket, name, userId);

            if (!socket.connected) {
                socket.connect();
            } else {
                // Đã kết nối sẵn, emit join ngay
                setConnected(true);
                socket.emit('customer:join', {
                    conversationId: conversationIdRef.current,
                    customerName: name,
                    customerId: userId || null,
                });
            }
        },
        [registerSocketEvents]
    );

    // ============================================================
    // Xử lý thay đổi auth state (guest → logged-in hoặc logout)
    // ============================================================
    useEffect(() => {
        const currentUserId = user?._id || null;
        const prevUserId = prevUserIdRef.current;

        // Bỏ qua lần render đầu tiên chưa có sự thay đổi
        if (prevUserId === currentUserId) return;

        prevUserIdRef.current = currentUserId;

        // Phát hiện: user đã đăng nhập (guest → user hoặc user thay đổi)
        if (currentUserId) {
            // Reset session guest, chuyển sang session user
            conversationIdRef.current = null;
            setMessages([]);
            setIsClosed(false);
            setAdminTyping(false);
            setHasNewMessage(false);
            setNameEntered(true); // logged-in user không cần nhập tên
            setGuestName('');

            // Ngắt socket cũ và xoá singleton để có thể tạo fresh instance
            destroySocket();
            socketRef.current = null;
            setConnected(false);

            // Kết nối lại với thông tin user mới (chỉ khi chat đang mở)
            if (isOpen) {
                connectAndJoin(user.name || 'Khách', currentUserId);
            }
        } else {
            // User đã logout → reset về trạng thái guest
            conversationIdRef.current = null;
            setMessages([]);
            setIsClosed(false);
            setNameEntered(false);
            setGuestName('');
            setHasNewMessage(false);

            // Xoá conversation guest cũ khỏi localStorage
            // để phiên khách vãng lai mới không join vào cuộc chat cũ
            localStorage.removeItem(GUEST_STORAGE_KEY);

            // Ngắt socket cũ và xoá singleton
            destroySocket();
            socketRef.current = null;
            setConnected(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?._id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimeout(typingTimeoutRef.current);
            // Không destroy singleton khi unmount (context admin cũng dùng socket)
            // Chỉ remove các listeners của component này
            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('conversation:joined');
                socketRef.current.off('message:new');
                socketRef.current.off('admin:typing');
                socketRef.current.off('conversation:closed');
                socketRef.current.off('disconnect');
                socketRef.current.off('reconnect');
            }
        };
    }, []);

    const handleOpen = () => {
        setIsOpen(true);
        setIsMinimized(false);
        setHasNewMessage(false);

        const isLoggedIn = !!user?._id;
        const shouldConnect = isLoggedIn || nameEntered;

        if (shouldConnect && !socketRef.current?.connected) {
            const name = isLoggedIn ? user.name || 'Khách' : guestName;
            const userId = isLoggedIn ? user._id : null;
            // Đọc đúng key từ storage nếu chưa có trong ref
            if (!conversationIdRef.current) {
                conversationIdRef.current =
                    localStorage.getItem(getStorageKey(userId)) || null;
            }
            connectAndJoin(name, userId);
        }
    };

    const handleNameSubmit = (e) => {
        e.preventDefault();
        if (!guestName.trim()) return;
        const name = guestName.trim();
        setNameEntered(true);
        conversationIdRef.current =
            localStorage.getItem(GUEST_STORAGE_KEY) || null;
        connectAndJoin(name, null);
    };

    const handleSend = () => {
        const text = input.trim();
        if (!text || isClosed || !socketRef.current?.connected) return;

        socketRef.current.emit('customer:message', {
            conversationId: conversationIdRef.current,
            text,
            senderName: user?.name || guestName || 'Khách',
        });
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleNewChat = () => {
        // Xóa conversation cũ khỏi storage và state
        const storageKey = getStorageKey(user?._id || null);
        localStorage.removeItem(storageKey);
        conversationIdRef.current = null;

        // Ngắt socket cũ
        destroySocket();
        socketRef.current = null;
        setConnected(false);

        // Reset UI
        setMessages([]);
        setIsClosed(false);
        setAdminTyping(false);
        setInput('');

        // Nếu là guest, hiện lại form nhập tên
        if (!user?._id) {
            setNameEntered(false);
            setGuestName('');
        } else {
            // Nếu đã đăng nhập, tự động kết nối mới luon
            connectAndJoin(user.name || 'Khách', user._id);
        }
    };

    const customerName = user?.name || guestName || 'Khách';
    const showNameForm = !nameEntered && !user?._id;

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={handleOpen}
                    className="fixed bottom-6 right-24 z-50 w-14 h-14 rounded-full
                               bg-gradient-to-br from-emerald-400 to-teal-600
                               text-white shadow-2xl shadow-teal-500/40 hover:shadow-teal-500/60
                               flex items-center justify-center cursor-pointer
                               hover:scale-110 active:scale-95 transition-all duration-200"
                    title="Chat với Shop"
                >
                    <MessageCircle size={26} />
                    {hasNewMessage && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div
                    className={`fixed bottom-6 right-24 z-50 w-[360px] rounded-2xl shadow-2xl shadow-black/20
                                border border-white/10 overflow-hidden transition-all duration-300
                                ${isMinimized ? 'h-14' : 'h-[520px]'}
                                flex flex-col bg-gray-50 dark:bg-gray-900`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <Headphones size={16} className="text-white" />
                            </div>
                            <div>
                                <p className="text-white font-semibold text-sm leading-tight">
                                    Hỗ trợ trực tiếp
                                </p>
                                <div className="flex items-center gap-1">
                                    {connected ? (
                                        <>
                                            <Wifi
                                                size={9}
                                                className="text-green-300"
                                            />
                                            <p className="text-emerald-100 text-[11px]">
                                                Đang kết nối
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <WifiOff
                                                size={9}
                                                className="text-red-300"
                                            />
                                            <p className="text-red-200 text-[11px]">
                                                Mất kết nối
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Link
                                to={'/dashboard/chat-support-customer'}
                                className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                                title="Mở rộng"
                            >
                                <Maximize size={16} />
                            </Link>
                            <button
                                onClick={() => setIsMinimized(true)}
                                className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                            >
                                <ChevronDown size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsMinimized(false);
                                }}
                                className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Minimized bar */}
                    {isMinimized && (
                        <button
                            onClick={() => setIsMinimized(false)}
                            className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer text-sm gap-1"
                        >
                            <MessageCircle size={13} /> Tiếp tục hỗ trợ
                        </button>
                    )}

                    {!isMinimized && (
                        <>
                            {/* Name form for guests */}
                            {showNameForm ? (
                                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg">
                                        <Headphones
                                            size={30}
                                            className="text-white"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold text-gray-800 dark:text-gray-100">
                                            Chat với Shop
                                        </p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Vui lòng cho chúng tôi biết tên bạn
                                        </p>
                                    </div>
                                    <form
                                        onSubmit={handleNameSubmit}
                                        className="w-full flex flex-col gap-3"
                                    >
                                        <input
                                            value={guestName}
                                            onChange={(e) =>
                                                setGuestName(e.target.value)
                                            }
                                            placeholder="Nhập tên của bạn..."
                                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-teal-400 transition"
                                            autoFocus
                                        />
                                        <button
                                            type="submit"
                                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium cursor-pointer hover:opacity-90 transition"
                                        >
                                            Bắt đầu chat
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <>
                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto px-3 pt-4 pb-2 scroll-smooth">
                                        {messages.length === 0 && (
                                            <div className="text-center text-sm text-gray-400 mt-6">
                                                <p>
                                                    👋 Xin chào {customerName}!
                                                </p>
                                                <p className="mt-1">
                                                    Nhân viên sẽ phản hồi sớm
                                                    nhất có thể.
                                                </p>
                                            </div>
                                        )}
                                        {messages.map((msg, i) => (
                                            <ChatBubble key={i} msg={msg} />
                                        ))}
                                        {adminTyping && <TypingIndicator />}
                                        {isClosed && (
                                            <div className="text-center py-3 border-t border-gray-100 dark:border-gray-800 mt-2 flex flex-col items-center gap-2">
                                                <p className="text-xs text-gray-400">
                                                    Hội thoại đã được đóng. Cảm
                                                    ơn bạn đã liên hệ!
                                                </p>
                                                <button
                                                    onClick={handleNewChat}
                                                    className="px-4 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 active:scale-95 transition cursor-pointer shadow-md shadow-teal-500/30"
                                                >
                                                    ✨ Bắt đầu chat mới
                                                </button>
                                            </div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                                        {isClosed ? (
                                            <button
                                                onClick={handleNewChat}
                                                className="w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium cursor-pointer hover:opacity-90 active:scale-[0.98] transition shadow-md shadow-teal-500/30"
                                            >
                                                ✨ Bắt đầu chat mới
                                            </button>
                                        ) : (
                                            <div className="flex items-end gap-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-sm">
                                                <textarea
                                                    ref={inputRef}
                                                    value={input}
                                                    onChange={(e) =>
                                                        setInput(e.target.value)
                                                    }
                                                    onKeyDown={handleKeyDown}
                                                    placeholder="Nhập tin nhắn..."
                                                    rows={1}
                                                    disabled={!connected}
                                                    className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none leading-relaxed max-h-24 overflow-y-auto"
                                                />
                                                <button
                                                    onClick={handleSend}
                                                    disabled={
                                                        !input.trim() ||
                                                        !connected
                                                    }
                                                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95 cursor-pointer shadow"
                                                >
                                                    <Send size={14} />
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">
                                            Phản hồi trong vòng vài phút
                                        </p>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
