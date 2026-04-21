import { Router } from "express";
import {
    getMyConversation,
    getConversations,
    getConversationById,
    closeConversation,
    markAsRead,
} from "../controllers/supportChat.controller.js";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";

const supportChatRouter = Router();

// Customer: lấy conversation hiện tại của mình (có lịch sử + TTL info)
supportChatRouter.get("/my-conversation", verifyCognitoToken, getMyConversation);

// Admin/Waiter: quản lý conversations
supportChatRouter.get("/conversations", verifyCognitoToken, getConversations);
supportChatRouter.get("/conversations/:id", verifyCognitoToken, getConversationById);
supportChatRouter.patch("/conversations/:id/close", verifyCognitoToken, closeConversation);
supportChatRouter.patch("/conversations/:id/read", verifyCognitoToken, markAsRead);

export default supportChatRouter;