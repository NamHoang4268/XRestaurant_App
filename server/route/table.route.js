import { Router } from "express";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";
import {
    createTableController,
    getAllTablesController,
    getTableByIdController,
    updateTableController,
    deleteTableController,
    updateTableStatusController,
    getAvailableTablesController,
    regenerateQRController
} from "../controllers/table.controller.js";
import {
    generateQRCodeController,
    getQRCodeController
} from "../controllers/tableQR.controller.js";

const tableRouter = Router();

tableRouter.post('/create', verifyCognitoToken, createTableController);
tableRouter.get('/get-all', getAllTablesController);
tableRouter.get('/get/:id', getTableByIdController);
tableRouter.put('/update', verifyCognitoToken, updateTableController);
tableRouter.delete('/delete', verifyCognitoToken, deleteTableController);
tableRouter.patch('/update-status', verifyCognitoToken, updateTableStatusController);
tableRouter.get('/available', getAvailableTablesController);

// QR Code routes
tableRouter.post('/generate-qr', verifyCognitoToken, generateQRCodeController);
tableRouter.get('/qr/:id', getQRCodeController);
tableRouter.post('/regenerate-qr', verifyCognitoToken, regenerateQRController);  // Fix bàn thiếu QR

export default tableRouter;
