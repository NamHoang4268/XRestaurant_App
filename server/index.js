import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/connectDB.js";
import userRouter from "./route/user.route.js";
import categoryRouter from "./route/category.route.js";
import subCategoryRouter from "./route/subCategory.route.js";
import uploadRouter from "./route/upload.route.js";
import productRouter from "./route/product.route.js";
import voucherRouter from './route/voucher.route.js';
import tableRouter from './route/table.route.js';
import bookingRouter from './route/booking.route.js';
import tableAuthRouter from './route/tableAuth.route.js';
import tableOrderRouter from './route/tableOrder.route.js';
import chatRouter from './route/chat.route.js';
import supportChatRouter from './route/supportChat.route.js';
import customerRouter from './route/customer.route.js';
import kitchenRouter from './route/kitchen.route.js';
import { registerSupportChatSocket } from "./socket/supportChat.socket.js";
import { registerKitchenSocket } from "./socket/kitchen.socket.js";

const app = express();
const httpServer = http.createServer(app);

// Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true,
    },
});
registerSupportChatSocket(io);
registerKitchenSocket(io);

// Gắn io vào app để dùng trong controllers
app.set('io', io);

app.use(
    cors({
        credentials: true,
        origin: process.env.FRONTEND_URL,
    }),
);

// Middleware để lưu raw body cho webhook Stripe
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            try {
                req.body = JSON.parse(data);
            } catch (error) {
                console.error('Error parsing webhook JSON:', error);
                req.body = {};
            }
            next();
        });
    } else {
        express.json()(req, res, next);
    }
});

app.use(cookieParser());
app.use(morgan('dev'));
app.use(
    helmet({
        crossOriginResourcePolicy: false,
    }),
);

const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
    res.json({ message: "EatEase Server running on port " + PORT });
});

// === API ROUTES ===
app.use('/api/user', userRouter);
app.use('/api/category', categoryRouter);
app.use('/api/sub-category', subCategoryRouter);
app.use('/api/file', uploadRouter);
app.use('/api/product', productRouter);
app.use('/api/voucher', voucherRouter);
app.use('/api/table', tableRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/table-auth', tableAuthRouter);
app.use('/api/table-order', tableOrderRouter);
app.use('/api/chat', chatRouter);
app.use('/api/support', supportChatRouter);
app.use('/api/customer', customerRouter);
app.use('/api/kitchen', kitchenRouter);
import orderRouter from './route/order.route.js';
app.use('/api/order', orderRouter);


connectDB().then(() => {
    httpServer.listen(PORT, () => {
        console.log("EatEase Server is running on port", PORT);
    });
});