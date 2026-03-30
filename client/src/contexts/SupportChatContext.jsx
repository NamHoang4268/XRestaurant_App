import React, {
    createContext,
    useContext,
    useState,
    useRef,
    useEffect,
    useCallback,
} from 'react';
import { useSelector } from 'react-redux';
import { getSocket, destroySocket } from '../utils/socket';

// Dùng prefix để phân biệt guest session và user session
const GUEST_STORAGE_KEY = 'tc_support_conv_guest';
const USER_STORAGE_KEY_PREFIX = 'tc_support_conv_user_';

function getStorageKey(userId) {
    return userId ? `${USER_STORAGE_KEY_PREFIX}${userId}` : GUEST_STORAGE_KEY;
}

// Create Support Chat Context
const SupportChatContext = createContext();

export const useSupportChat = () => {
    const context = useContext(SupportChatContext);
    if (!context) {
        throw new Error(
            'useSupportChat must be used within a SupportChatProvider'
        );
    }
    return context;
};

export const SupportChatProvider = ({ children }) => {
    const user = useSelector((state) => state.user);

    // Shared state
    const [messages, setMessages] = useState([]);
    const [connected, setConnected] = useState(false);
    const [isClosed, setIsClosed] = useState(false);
    const [adminTyping, setAdminTyping] = useState(false);
    const [requestStatus, setRequestStatus] = useState('waiting');
    const [assignedWaiterName, setAssignedWaiterName] = useState(null);
    const [nameEntered, setNameEntered] = useState(false);
    const [guestName, setGuestName] = useState('');

    // Refs
    const conversationIdRef = useRef(null);
    const socketRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const prevUserIdRef = useRef(null);

    // Register socket events
    const registerSocketEvents = useCallback(
        (socket, resolvedName, resolvedUserId) => {
            // Clean old listeners
            socket.off('connect');
            socket.off('conversation:created');
            socket.off('conversation:joined');
            socket.off('waiter:joined');
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

                if (!conversationIdRef.current) {
                    console.log('[SupportChat] Creating waiter request:', {
                        customerName: resolvedName,
                        customerId: resolvedUserId || null,
                        tableNumber: null,
                    });
                    socket.emit('customer:requestWaiter', {
                        customerName: resolvedName,
                        customerId: resolvedUserId || null,
                        tableNumber: null,
                    });
                } else {
                    console.log(
                        '[SupportChat] Rejoining existing conversation:',
                        conversationIdRef.current
                    );
                    doJoin();
                }
            });

            socket.on(
                'conversation:created',
                ({ conversationId, requestStatus: status, message }) => {
                    console.log('[SupportChat] Conversation created:', {
                        conversationId,
                        status,
                        message,
                    });
                    conversationIdRef.current = conversationId;
                    localStorage.setItem(storageKey, conversationId);
                    setRequestStatus(status);
                    setMessages([]);
                }
            );

            socket.on(
                'conversation:joined',
                ({
                    conversationId,
                    messages: history,
                    status,
                    requestStatus: reqStatus,
                    assignedWaiterName: waiterName,
                }) => {
                    conversationIdRef.current = conversationId;
                    localStorage.setItem(storageKey, conversationId);
                    setMessages(history || []);
                    setIsClosed(status === 'closed');
                    setRequestStatus(reqStatus || 'waiting');
                    setAssignedWaiterName(waiterName || null);
                }
            );

            socket.on('waiter:joined', ({ waiterName, message }) => {
                setRequestStatus('active');
                setAssignedWaiterName(waiterName);
                setMessages((prev) => [
                    ...prev,
                    {
                        sender: 'system',
                        senderRole: 'system',
                        text:
                            message ||
                            `${waiterName} đã tham gia cuộc trò chuyện`,
                        createdAt: new Date(),
                    },
                ]);
            });

            socket.on('message:new', (msg) => {
                setMessages((prev) => {
                    const isDuplicate = prev.some(
                        (existingMsg) =>
                            existingMsg.text === msg.text &&
                            existingMsg.senderRole === msg.senderRole &&
                            Math.abs(
                                new Date(existingMsg.createdAt) -
                                    new Date(msg.createdAt)
                            ) < 5000
                    );

                    if (isDuplicate) {
                        return prev.map((existingMsg) =>
                            existingMsg._isOptimistic &&
                            existingMsg.text === msg.text &&
                            existingMsg.senderRole === msg.senderRole
                                ? { ...msg, _isOptimistic: false }
                                : existingMsg
                        );
                    }

                    return [...prev, msg];
                });

                if (msg.senderRole === 'admin' || msg.senderRole === 'waiter')
                    setAdminTyping(false);
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
            socket.on('reconnect', () => doJoin());
        },
        []
    );

    // Connect and join function
    const connectAndJoin = useCallback(
        (name, userId) => {
            console.log('[SupportChat] connectAndJoin called with:', {
                name,
                userId,
            });
            const socket = getSocket();
            socketRef.current = socket;

            registerSocketEvents(socket, name, userId);

            if (!socket.connected) {
                console.log(
                    '[SupportChat] Socket not connected, connecting...'
                );
                socket.connect();
            } else {
                console.log('[SupportChat] Socket already connected');
                setConnected(true);

                const storageKey = getStorageKey(userId);
                const savedConvId = localStorage.getItem(storageKey);
                console.log(
                    '[SupportChat] Saved conversationId from storage:',
                    savedConvId
                );

                if (savedConvId) {
                    conversationIdRef.current = savedConvId;
                }

                if (!conversationIdRef.current) {
                    console.log(
                        '[SupportChat] No existing conversation, creating new request'
                    );
                    socket.emit('customer:requestWaiter', {
                        customerName: name,
                        customerId: userId || null,
                        tableNumber: null,
                    });
                } else {
                    console.log(
                        '[SupportChat] Rejoining existing conversation:',
                        conversationIdRef.current
                    );
                    socket.emit('customer:join', {
                        conversationId: conversationIdRef.current,
                        customerName: name,
                        customerId: userId || null,
                    });
                }
            }
        },
        [registerSocketEvents]
    );

    // Handle auth state changes
    useEffect(() => {
        const currentUserId = user?._id || null;
        const prevUserId = prevUserIdRef.current;

        if (prevUserId === currentUserId) return;
        prevUserIdRef.current = currentUserId;

        if (currentUserId) {
            // User logged in
            conversationIdRef.current = null;
            setMessages([]);
            setIsClosed(false);
            setAdminTyping(false);
            setNameEntered(true);
            setGuestName('');
            setRequestStatus('waiting');
            setAssignedWaiterName(null);

            destroySocket();
            socketRef.current = null;
            setConnected(false);
        } else {
            // User logged out
            conversationIdRef.current = null;
            setMessages([]);
            setIsClosed(false);
            setNameEntered(false);
            setGuestName('');
            setRequestStatus('waiting');
            setAssignedWaiterName(null);

            localStorage.removeItem(GUEST_STORAGE_KEY);
            destroySocket();
            socketRef.current = null;
            setConnected(false);
        }
    }, [user?._id]);

    // Cleanup
    useEffect(() => {
        return () => {
            clearTimeout(typingTimeoutRef.current);
            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('conversation:created');
                socketRef.current.off('conversation:joined');
                socketRef.current.off('waiter:joined');
                socketRef.current.off('message:new');
                socketRef.current.off('admin:typing');
                socketRef.current.off('conversation:closed');
                socketRef.current.off('disconnect');
                socketRef.current.off('reconnect');
            }
        };
    }, []);

    // Initialize connection for logged-in users
    const initializeConnection = useCallback(() => {
        const isLoggedIn = !!user?._id;
        const shouldConnect = isLoggedIn || nameEntered;

        console.log(
            '[SupportChat] initializeConnection - isLoggedIn:',
            isLoggedIn,
            'shouldConnect:',
            shouldConnect
        );

        if (shouldConnect) {
            const name = isLoggedIn ? user.name || 'Khách' : guestName;
            const userId = isLoggedIn ? user._id : null;

            // For logged-in users, ensure fresh request if no conversation exists
            if (isLoggedIn && !conversationIdRef.current) {
                console.log(
                    '[SupportChat] Logged-in user, clearing state for fresh request'
                );
                const storageKey = getStorageKey(userId);
                localStorage.removeItem(storageKey);

                destroySocket();
                socketRef.current = null;
                setConnected(false);

                setMessages([]);
                setIsClosed(false);
                setAdminTyping(false);
                setRequestStatus('waiting');
                setAssignedWaiterName(null);
            }

            if (!conversationIdRef.current) {
                conversationIdRef.current =
                    localStorage.getItem(getStorageKey(userId)) || null;
            }

            console.log('[SupportChat] Calling connectAndJoin with:', {
                name,
                userId,
            });
            connectAndJoin(name, userId);
        }
    }, [user, nameEntered, guestName, connectAndJoin]);

    // Submit guest name
    const submitGuestName = useCallback(
        (name) => {
            if (!name.trim()) return;

            console.log(
                '[SupportChat] submitGuestName called with name:',
                name
            );
            setGuestName(name.trim());
            setNameEntered(true);

            // Clear existing conversation to force new request
            conversationIdRef.current = null;
            localStorage.removeItem(GUEST_STORAGE_KEY);

            destroySocket();
            socketRef.current = null;
            setConnected(false);

            setMessages([]);
            setIsClosed(false);
            setAdminTyping(false);
            setRequestStatus('waiting');
            setAssignedWaiterName(null);

            console.log('[SupportChat] Cleared all state, starting fresh chat');
            connectAndJoin(name.trim(), null);
        },
        [connectAndJoin]
    );

    // Send message
    const sendMessage = useCallback(
        (text) => {
            if (!text.trim() || isClosed || !socketRef.current?.connected)
                return;

            const optimisticMsg = {
                sender: socketRef.current.id,
                senderName: user?.name || guestName || 'Khách',
                senderRole: 'customer',
                text: text.trim(),
                createdAt: new Date(),
                _isOptimistic: true,
            };

            setMessages((prev) => [...prev, optimisticMsg]);

            socketRef.current.emit('customer:message', {
                conversationId: conversationIdRef.current,
                text: text.trim(),
                senderName: user?.name || guestName || 'Khách',
            });
        },
        [user, guestName, isClosed]
    );

    // Start new chat
    const startNewChat = useCallback(() => {
        const storageKey = getStorageKey(user?._id || null);
        localStorage.removeItem(storageKey);
        conversationIdRef.current = null;

        destroySocket();
        socketRef.current = null;
        setConnected(false);

        setMessages([]);
        setIsClosed(false);
        setAdminTyping(false);
        setRequestStatus('waiting');
        setAssignedWaiterName(null);

        if (!user?._id) {
            setNameEntered(false);
            setGuestName('');
        } else {
            connectAndJoin(user.name || 'Khách', user._id);
        }
    }, [user, connectAndJoin]);

    const value = {
        // State
        messages,
        connected,
        isClosed,
        adminTyping,
        requestStatus,
        assignedWaiterName,
        nameEntered,
        guestName,
        conversationId: conversationIdRef.current,

        // Actions
        initializeConnection,
        submitGuestName,
        sendMessage,
        startNewChat,

        // Computed
        customerName: user?.name || guestName || 'Khách',
        showNameForm: !nameEntered && !user?._id,
    };

    return (
        <SupportChatContext.Provider value={value}>
            {children}
        </SupportChatContext.Provider>
    );
};
