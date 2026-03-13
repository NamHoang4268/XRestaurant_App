import { useState, useRef, useEffect } from 'react';
import Axios from '../utils/Axios';
import SummaryApi from '../common/SummaryApi';
import AxiosToastError from '../utils/AxiosToastError';
import { Bot, X, Send, Minimize2, Sparkles, ChevronDown } from 'lucide-react';

// Quick suggestion buttons
const QUICK_SUGGESTIONS = [
    'Cửa hàng bán sản phẩm gì?',
    'Chính sách đổi trả?',
    'Cách đặt hàng?',
    'Có mã giảm giá không?',
];

function ChatBubble({ role, text }) {
    const isUser = role === 'user';
    return (
        <div
            className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end mb-3`}
        >
            {!isUser && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow">
                    <Bot size={14} className="text-white" />
                </div>
            )}
            <div
                className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isUser
                        ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-br-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm border border-gray-100 dark:border-gray-700'
                }`}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
                {text}
            </div>
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex gap-2 items-end mb-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow">
                <Bot size={14} className="text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex gap-1 items-center">
                    <span
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                    />
                    <span
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                    />
                    <span
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                    />
                </div>
            </div>
        </div>
    );
}

export default function AiChatBox() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0); // giây còn lại
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const [messages, setMessages] = useState([
        {
            role: 'bot',
            text: 'Xin chào! 👋 Tôi là trợ lý AI của EatEase. Tôi có thể giúp bạn tìm sản phẩm, giải đáp thắc mắc về đơn hàng, chính sách và nhiều hơn nữa. Bạn cần hỗ trợ gì?',
        },
    ]);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const cooldownRef = useRef(null);

    // Bắt đầu đếm ngược cooldown
    const startCooldown = (seconds = 5) => {
        setCooldown(seconds);
        clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(cooldownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => {
        if (isOpen && !isMinimized) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isMinimized]);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            inputRef.current?.focus();
            setHasNewMessage(false);
        }
    }, [isOpen, isMinimized]);

    const handleSend = async (messageText) => {
        const text = (messageText || input).trim();
        if (!text || loading || cooldown > 0) return;

        const userMsg = { role: 'user', text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            // Build history for context (exclude the initial bot greeting)
            const history = newMessages.slice(1, -1).map((msg) => ({
                role: msg.role,
                text: msg.text,
            }));

            const response = await Axios({
                ...SummaryApi.chat_message,
                data: { message: text, history },
            });

            if (response.data?.success) {
                const botMsg = { role: 'bot', text: response.data.data.reply };
                setMessages((prev) => [...prev, botMsg]);
                // Notify if window is minimized or closed
                if (!isOpen || isMinimized) setHasNewMessage(true);
            }
        } catch (error) {
            const serverMsg = error?.response?.data?.message;
            setMessages((prev) => [
                ...prev,
                {
                    role: 'bot',
                    text:
                        serverMsg ||
                        'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau ít phút! 🙏',
                },
            ]);
        } finally {
            setLoading(false);
            startCooldown(5); // 5s cooldown sau mỗi lần gửi
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        setIsMinimized(false);
        setHasNewMessage(false);
    };

    const handleClose = () => {
        setIsOpen(false);
        setIsMinimized(false);
    };

    const handleMinimize = () => {
        setIsMinimized(true);
    };

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={handleOpen}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 
                               text-white shadow-2xl shadow-violet-500/40 hover:shadow-violet-500/60
                               flex items-center justify-center cursor-pointer
                               hover:scale-110 active:scale-95 transition-all duration-200"
                    title="Chat với AI"
                >
                    <Bot size={26} />
                    {hasNewMessage && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div
                    className={`fixed bottom-6 right-6 z-50 w-[360px] rounded-2xl shadow-2xl shadow-black/20 
                                border border-white/10 overflow-hidden
                                transition-all duration-300 ease-out
                                ${isMinimized ? 'h-14' : 'h-[520px]'}
                                flex flex-col bg-gray-50 dark:bg-gray-900`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <Bot size={16} className="text-white" />
                            </div>
                            <div>
                                <p className="text-white font-semibold text-sm leading-tight">
                                    Trợ lý AI
                                </p>
                                <div className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                                    <p className="text-violet-200 text-[11px]">
                                        EatEase
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleMinimize}
                                className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                                title="Thu nhỏ"
                            >
                                <ChevronDown size={16} />
                            </button>
                            <button
                                onClick={handleClose}
                                className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer"
                                title="Đóng"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Minimized expand bar */}
                    {isMinimized && (
                        <button
                            onClick={() => setIsMinimized(false)}
                            className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 
                                       hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer text-sm gap-1"
                        >
                            <Sparkles size={13} />
                            Tiếp tục hội thoại
                        </button>
                    )}

                    {/* Messages */}
                    {!isMinimized && (
                        <>
                            <div className="flex-1 overflow-y-auto px-3 pt-4 pb-2 space-y-0.5 scroll-smooth">
                                {messages.map((msg, i) => (
                                    <ChatBubble
                                        key={i}
                                        role={msg.role}
                                        text={msg.text}
                                    />
                                ))}
                                {loading && <TypingIndicator />}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Quick suggestions — only show initially */}
                            {messages.length === 1 && !loading && (
                                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                                    {QUICK_SUGGESTIONS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => handleSend(s)}
                                            className="text-[11px] px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30
                                                       text-violet-700 dark:text-violet-300
                                                       border border-violet-200 dark:border-violet-700
                                                       hover:bg-violet-100 dark:hover:bg-violet-800/40
                                                       transition cursor-pointer"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Input */}
                            <div className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                                <div className="flex items-end gap-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-sm">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) =>
                                            setInput(e.target.value)
                                        }
                                        onKeyDown={handleKeyDown}
                                        placeholder="Nhập câu hỏi của bạn..."
                                        rows={1}
                                        disabled={loading}
                                        className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-100 
                                                   placeholder-gray-400 outline-none leading-relaxed max-h-24 overflow-y-auto"
                                        style={{ field: 'sizing-content' }}
                                    />
                                    <button
                                        onClick={() => handleSend()}
                                        disabled={
                                            loading ||
                                            !input.trim() ||
                                            cooldown > 0
                                        }
                                        className="flex-shrink-0 w-8 h-8 rounded-lg 
                                                   bg-gradient-to-br from-violet-500 to-indigo-600
                                                   text-white flex items-center justify-center
                                                   hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                                                   transition active:scale-95 cursor-pointer shadow text-[11px] font-bold"
                                    >
                                        {cooldown > 0 ? (
                                            cooldown
                                        ) : (
                                            <Send size={14} />
                                        )}
                                    </button>
                                </div>
                                <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">
                                    Powered by Google Gemini AI
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
}
