/**
 * FloatingChatLauncher
 * ──────────────────────────────────────────────────────────────────
 * Một cột icon dọc ở góc dưới-phải, chứa 2 nút:
 *   - Bot (AI Chatbox)
 *   - Headphones (Support Chat)
 *
 * Logic:
 *   - Click icon → nếu chưa mở thì mở chatbox đó, đóng chatbox kia
 *   - Click icon đang active → đóng chatbox đó
 *   - Chỉ có TỐI ĐA 1 chatbox mở tại một thời điểm
 * ──────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { Bot, Headphones } from 'lucide-react';
import AiChatBox from './AiChatBox';
import SupportChatBox from './SupportChatBox';

// Các key định danh từng loại chat
const CHAT_AI = 'ai';
const CHAT_SUPPORT = 'support';

export default function FloatingChatLauncher() {
    // null = cả 2 đều đóng; 'ai' | 'support' = đang mở loại đó
    const [activeChat, setActiveChat] = useState(null);

    const toggle = (type) => {
        setActiveChat((prev) => (prev === type ? null : type));
    };

    const handleClose = () => setActiveChat(null);

    return (
        <>
            {/* ── Chat Windows (render ẩn / hiện dựa theo activeChat) ── */}
            <AiChatBox isOpen={activeChat === CHAT_AI} onClose={handleClose} />
            <SupportChatBox
                isOpen={activeChat === CHAT_SUPPORT}
                onClose={handleClose}
            />

            {/* ── Floating Pill — cột dọc 2 icon ── */}
            <div
                className="fixed bottom-6 right-5 z-50 flex flex-col items-center gap-3"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))' }}
            >
                {/* Icon Support Chat (trên - rose-orange brand) */}
                <div className="relative">
                    <button
                        onClick={() => toggle(CHAT_SUPPORT)}
                        title="Chat với nhân viên"
                        className="relative w-13 h-13 rounded-full flex items-center justify-center
                                   transition-all duration-250 cursor-pointer shadow-lg active:scale-95"
                        style={{
                            width: 52,
                            height: 52,
                            background: 'linear-gradient(135deg, #C96048 0%, #d97a66 100%)',
                            boxShadow: activeChat === CHAT_SUPPORT
                                ? '0 8px 24px rgba(201,96,72,0.5), 0 0 0 2px rgba(201,96,72,0.3)'
                                : '0 8px 20px rgba(201,96,72,0.4)',
                            transform: activeChat === CHAT_SUPPORT ? 'scale(1.05)' : 'scale(1)',
                            opacity: activeChat === CHAT_SUPPORT ? 1 : 0.9,
                        }}
                        onMouseEnter={(e) => {
                            if (activeChat !== CHAT_SUPPORT) {
                                e.currentTarget.style.transform = 'scale(1.1)';
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(201,96,72,0.6)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeChat !== CHAT_SUPPORT) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.opacity = '0.9';
                                e.currentTarget.style.boxShadow = '0 8px 20px rgba(201,96,72,0.4)';
                            }
                        }}
                        aria-label="Mở chat hỗ trợ nhân viên"
                        aria-pressed={activeChat === CHAT_SUPPORT}
                    >
                        <Headphones size={22} className="text-white" />

                        {/* Active indicator ring */}
                        {activeChat === CHAT_SUPPORT && (
                            <span className="absolute inset-0 rounded-full ring-2 ring-white/30 animate-ping" />
                        )}
                    </button>

                    {/* Tooltip label */}
                    <span
                        className="
                        absolute right-full mr-3 top-1/2 -translate-y-1/2
                        whitespace-nowrap text-[11px] font-medium
                        bg-gray-900/90 text-white px-2.5 py-1 rounded-lg
                        opacity-0 pointer-events-none
                        group-hover:opacity-100
                        transition-opacity duration-200
                        select-none
                    "
                    >
                        Hỗ trợ nhân viên
                    </span>
                </div>

                {/* Connector line between two icons */}
                <div
                    className="w-px h-3 rounded-full"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(201,96,72,0.4) 0%, rgba(124,58,237,0.4) 100%)',
                    }}
                />

                {/* Icon AI Chat (dưới - violet/indigo) */}
                <div className="relative">
                    <button
                        onClick={() => toggle(CHAT_AI)}
                        title="Chat với AI"
                        className={`
                            relative w-13 h-13 rounded-full flex items-center justify-center
                            transition-all duration-250 cursor-pointer
                            shadow-lg active:scale-95
                            ${
                                activeChat === CHAT_AI
                                    ? 'bg-gradient-to-br from-violet-500 to-indigo-600 scale-105 ring-2 ring-violet-300/60 shadow-violet-500/50'
                                    : 'bg-gradient-to-br from-violet-500 to-indigo-600 hover:scale-110 shadow-violet-500/40 hover:shadow-violet-500/60 opacity-90 hover:opacity-100'
                            }`}
                        style={{ width: 52, height: 52 }}
                        aria-label="Mở chat AI"
                        aria-pressed={activeChat === CHAT_AI}
                    >
                        <Bot size={22} className="text-white" />

                        {/* Active indicator ring */}
                        {activeChat === CHAT_AI && (
                            <span className="absolute inset-0 rounded-full ring-2 ring-white/30 animate-ping" />
                        )}
                    </button>
                </div>
            </div>
        </>
    );
}
