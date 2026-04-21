import { Router } from "express";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";
import {
    createBookingController,
    getAllBookingsController,
    getBookingByIdController,
    updateBookingController,
    cancelBookingController,
    confirmBookingController,
    getAvailableTablesForBookingController,
    getCustomerBookingsController,
    createBookingPaymentSession,
    getBookingReportData
} from "../controllers/booking.controller.js";

const bookingRouter = Router();

bookingRouter.post('/create', createBookingController);
bookingRouter.get('/get-all', verifyCognitoToken, getAllBookingsController);
bookingRouter.get('/get/:id', getBookingByIdController);
bookingRouter.put('/update', verifyCognitoToken, updateBookingController);
bookingRouter.delete('/cancel', cancelBookingController);
bookingRouter.patch('/confirm', verifyCognitoToken, confirmBookingController);
bookingRouter.post('/available-tables', getAvailableTablesForBookingController);
bookingRouter.post('/customer-bookings', getCustomerBookingsController);
bookingRouter.post('/create-payment-session', createBookingPaymentSession);


// Report route
bookingRouter.get('/report', verifyCognitoToken, getBookingReportData);

export default bookingRouter;
