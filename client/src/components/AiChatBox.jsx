import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import Axios from '../utils/Axios';
import SummaryApi from '../common/SummaryApi';
import { Bot, X, Send, Sparkles, ChevronDown, Maximize } from 'lucide-react';

/* ── Design tokens — khớp home page ──────────────────────────────
 * Brand rose-orange : #C96048  (AI giữ violet/indigo để phân biệt)
 * Glassmorphism     : backdrop-blur + border/white semi-transparent
 * CSS vars          : bg-background, bg-card, border-border, text-foreground
 * ───────────────────────────────────────────────────────────────── */

const QUICK_SUGGESTIONS = [
    'Món đặc biệt của nhà hàng?',
    'Có món nào cay không?',
    'Món chay có gì?',
    'Món nào nhanh nhất?',
];

function ChatBubble({ role, text }) {
    const isUser = role === 'user';
    return (
        <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end mb-2.5`}>
            {!isUser && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                    <Bot size={13} className="text-white" />
                </div>
            )}
            <div
                className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isUser
                        ? 'text-white rounded-br-sm shadow-md shadow-violet-500/25'
                        : 'bg-card dark:bg-gray-800 text-foreground rounded-bl-sm border border-border shadow-sm'
                }`}
                style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: isUser ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' : undefined,
                }}
            >
                {text}
            </div>
        </div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex gap-2 items-end mb-2.5">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                <Bot size={13} className="text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm bg-card dark:bg-gray-800 border border-border">
                <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((d) => (
                        <span
                            key={d}
                            className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * AiChatBox — controlled mode
 *   isOpen  {boolean}  — do FloatingChatLauncher điều khiển
 *   onClose {function} — callback khi người dùng đóng
 */
export default function AiChatBox({ isOpen = false, onClose }) {
    const { theme } = useTheme();
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [messages, setMessages] = useState([
        {
            role: 'bot',
            text: 'Xin chào! 👋 Tôi là trợ lý AI của EatEase. Tôi có thể giúp bạn tìm món ăn, giải đáp thắc mắc về thực đơn, đặt bàn và nhiều hơn nữa. Bạn cần hỗ trợ gì?',
        },
    ]);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const cooldownRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setIsMinimized(false);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isMinimized]);

    const startCooldown = (seconds = 5) => {
        setCooldown(seconds);
        clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const handleSend = async (messageText) => {
        const text = (messageText || input).trim();
        if (!text || loading || cooldown > 0) return;

        const userMsg = { role: 'user', text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            const history = newMessages.slice(1, -1).map((msg) => ({
                role: msg.role,
                text: msg.text,
            }));
            const response = await Axios({
                ...SummaryApi.chat_message,
                data: { message: text, history },
            });
            if (response.data?.success) {
                setMessages((prev) => [...prev, { role: 'bot', text: response.data.data.reply }]);
            }
        } catch (error) {
            const serverMsg = error?.response?.data?.message;
            setMessages((prev) => [
                ...prev,
                { role: 'bot', text: serverMsg || 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau ít phút! 🙏' },
            ]);
        } finally {
            setLoading(false);
            startCooldown(5);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const handleClose = () => { setIsMinimized(false); onClose?.(); };

    if (!isOpen) return null;

    return (
        <div
            className={`fixed bottom-6 right-28 z-50 w-[360px] rounded-2xl overflow-hidden
                        flex flex-col transition-all duration-300 ease-out
                        bg-card dark:bg-gray-900 border border-border
                        ${isMinimized ? 'h-14' : 'h-[540px]'}`}
            style={{
                boxShadow: theme === 'dark'
                    ? '0 24px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(124,58,237,0.15)'
                    : '0 24px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(201,96,72,0.08)',
                backdropFilter: 'blur(16px)',
                animation: 'chat-open 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
        >
            <style>{`
                @keyframes chat-open {
                    from { opacity: 0; transform: scale(0.86) translateY(18px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                .ai-chat-scroll::-webkit-scrollbar { width: 4px; }
                .ai-chat-scroll::-webkit-scrollbar-track { background: transparent; }
                .ai-chat-scroll::-webkit-scrollbar-thumb {
                    background: rgba(139,92,246,0.25);
                    border-radius: 99px;
                }
            `}</style>

            {/* ── Header ── */}
            <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
            >
                <div className="flex items-center gap-2.5">
                    {/* Avatar với shimmer ring */}
                    <div className="relative w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center shadow-inner">
                        <Bot size={17} className="text-white" />
                        <span className="absolute inset-0 rounded-full ring-1 ring-white/25" />
                    </div>
                    <div>
                        <p className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: 'Bahnschrift, system-ui, sans-serif', letterSpacing: '0.01em' }}>
                            Trợ lý AI
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full shadow shadow-green-400/60" />
                            <p className="text-violet-200 text-[10.5px] tracking-wide">
                                EatEase · Powered by Gemini
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-0.5">
                    <Link
                        to="/dashboard/chat-support-customer"
                        className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition"
                        title="Mở rộng"
                    >
                        <Maximize size={14} />
                    </Link>
                    <button
                        onClick={() => setIsMinimized((v) => !v)}
                        className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                    >
                        <ChevronDown size={15} className={`transition-transform duration-200 ${isMinimized ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={handleClose}
                        className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* ── Minimized bar ── */}
            {isMinimized && (
                <button
                    onClick={() => setIsMinimized(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-sm cursor-pointer transition-colors text-muted-foreground hover:text-foreground"
                >
                    <Sparkles size={12} />
                    Tiếp tục hội thoại với AI
                </button>
            )}

            {/* ── Body ── */}
            {!isMinimized && (
                <>
                    {/* Messages area */}
                    <div
                        className="ai-chat-scroll flex-1 overflow-y-auto px-3 pt-4 pb-2 bg-background dark:bg-gray-950"
                    >
                        {messages.map((msg, i) => (
                            <ChatBubble key={i} role={msg.role} text={msg.text} />
                        ))}
                        {loading && <TypingIndicator />}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestions */}
                    {messages.length === 1 && !loading && (
                        <div
                            className="px-3 pb-2 pt-2 flex flex-wrap gap-1.5 bg-background dark:bg-gray-950"
                        >
                            {QUICK_SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => handleSend(s)}
                                    className="text-[11px] px-2.5 py-1 rounded-full transition cursor-pointer"
                                    style={{
                                        background: 'rgba(139,92,246,0.08)',
                                        color: '#7c3aed',
                                        border: '1px solid rgba(139,92,246,0.2)',
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input bar */}
                    <div
                        className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-border bg-card dark:bg-gray-900"
                    >
                        <div
                            className="flex items-end gap-2 rounded-xl px-3 py-2 bg-background dark:bg-gray-950 border border-border"
                        >
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Hỏi tôi bất cứ điều gì..."
                                rows={1}
                                disabled={loading}
                                className="flex-1 resize-none bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 outline-none leading-relaxed max-h-24 overflow-y-auto text-foreground"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={loading || !input.trim() || cooldown > 0}
                                className="flex-shrink-0 w-8 h-8 rounded-lg text-white flex items-center justify-center
                                           hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed
                                           transition active:scale-95 cursor-pointer text-[11px] font-bold shadow"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                            >
                                {cooldown > 0 ? cooldown : <Send size={13} />}
                            </button>
                        </div>
                        <p className="text-center text-[10px] mt-1.5 text-muted-foreground">
                            Powered by Google Gemini AI
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
