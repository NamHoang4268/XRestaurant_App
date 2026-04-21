import { Router } from "express";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";
import {
    createTableAccountController,
    loginViaQRController,
    getTableSessionController,
    logoutTableController
} from "../controllers/tableAuth.controller.js";

const tableAuthRouter = Router();

// Public routes
tableAuthRouter.post('/login-qr', loginViaQRController);

// Protected routes (require authentication)
tableAuthRouter.post('/create-account', verifyCognitoToken, createTableAccountController);
tableAuthRouter.get('/session', verifyCognitoToken, getTableSessionController);
tableAuthRouter.post('/logout', verifyCognitoToken, logoutTableController);

export default tableAuthRouter;
