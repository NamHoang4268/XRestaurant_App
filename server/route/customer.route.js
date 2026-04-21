import express from "express";
import { checkinCustomer, getCustomerById, getAllCustomers, updatePoints } from "../controllers/customer.controller.js";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";

const router = express.Router();

// Public – khách quét QR checkin
router.post("/checkin", checkinCustomer);
router.get("/:id", getCustomerById);

// Admin only
router.get("/", verifyCognitoToken, getAllCustomers);
router.patch("/:id/points", verifyCognitoToken, updatePoints);

export default router;
