import Booking from "../models-sequelize/booking.model.js"; // Sequelize model
import Table from "../models-sequelize/table.model.js"; // Sequelize model
import User from "../models-sequelize/user.model.js"; // Sequelize model
import sendEmail from "../config/sendEmail.js";
import bookingEmailTemplate from "../utils/bookingEmailTemplate.js";
import Stripe from "../config/stripe.js";
import { Op } from 'sequelize';

// Create new booking
export async function createBookingController(request, response) {
    try {
        const {
            customerName,
            phone,
            email,
            tableId,
            numberOfGuests,
            bookingDate,
            bookingTime,
            specialRequests,
            userId,
            createdBy
        } = request.body;

        // Validation
        if (!customerName || !phone || !tableId || !numberOfGuests || !bookingDate || !bookingTime) {
            return response.status(400).json({
                message: "Vui lòng điền đầy đủ thông tin bắt buộc",
                error: true,
                success: false
            });
        }

        // Sequelize: Check if table exists
        const table = await Table.findByPk(tableId);
        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        // Check capacity
        if (numberOfGuests > table.capacity) {
            return response.status(400).json({
                message: `Bàn chỉ chứa tối đa ${table.capacity} người`,
                error: true,
                success: false
            });
        }

        // Validate booking date (not in the past)
        const selectedDate = new Date(bookingDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
            return response.status(400).json({
                message: "Không thể đặt bàn cho ngày trong quá khứ",
                error: true,
                success: false
            });
        }

        // Sequelize: Check if table is already booked for this date/time
        const existingBooking = await Booking.findOne({
            where: {
                tableId,
                bookingDate: selectedDate,
                bookingTime,
                status: { [Op.in]: ['pending', 'confirmed'] }
            }
        });

        if (existingBooking) {
            return response.status(400).json({
                message: "Bàn này đã được đặt cho thời gian này",
                error: true,
                success: false
            });
        }

        // Sequelize: Create booking
        const savedBooking = await Booking.create({
            customerName,
            phone,
            email: email || "",
            tableId,
            numberOfGuests,
            bookingDate: selectedDate,
            bookingTime,
            specialRequests: specialRequests || "",
            userId: userId || null,
            createdBy: createdBy || 'customer',
            status: 'pending',
            depositAmount: numberOfGuests > 4 ? numberOfGuests * 50000 : 0,
            depositPaid: false
        });

        // Sequelize: Load table info (populate equivalent)
        const bookingWithTable = await Booking.findByPk(savedBooking.id, {
            include: [{
                model: Table,
                as: 'table',
                attributes: ['tableNumber', 'capacity', 'location']
            }]
        });

        // Send email
        if (email) {
            await sendEmail({
                sendTo: email,
                subject: "Xác nhận yêu cầu đặt bàn - EatEase Restaurant",
                html: bookingEmailTemplate(bookingWithTable)
            });
        }

        return response.status(201).json({
            message: "Đặt bàn thành công",
            data: bookingWithTable,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get all bookings (admin)
export async function getAllBookingsController(request, response) {
    try {
        // Sequelize: findAll with include (populate)
        const bookings = await Booking.findAll({
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['tableNumber', 'capacity', 'location']
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email']
                }
                // Note: preOrderId would need TableOrder model included if needed
            ],
            order: [['createdAt', 'DESC']]
        });

        return response.status(200).json({
            message: "Lấy danh sách đặt bàn thành công",
            data: bookings,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get booking by ID
export async function getBookingByIdController(request, response) {
    try {
        const { id } = request.params;

        // Sequelize: findByPk with include
        const booking = await Booking.findByPk(id, {
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['tableNumber', 'capacity', 'location']
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email']
                }
            ]
        });

        if (!booking) {
            return response.status(404).json({
                message: "Không tìm thấy đặt bàn",
                error: true,
                success: false
            });
        }

        return response.status(200).json({
            message: "Lấy thông tin đặt bàn thành công",
            data: booking,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Update booking (admin)
export async function updateBookingController(request, response) {
    try {
        const { _id, customerName, phone, email, numberOfGuests, specialRequests } = request.body;

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID đặt bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const booking = await Booking.findByPk(_id);
        if (!booking) {
            return response.status(404).json({
                message: "Không tìm thấy đặt bàn",
                error: true,
                success: false
            });
        }

        // Update fields
        const updateData = {};
        if (customerName) updateData.customerName = customerName;
        if (phone) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (numberOfGuests) updateData.numberOfGuests = numberOfGuests;
        if (specialRequests !== undefined) updateData.specialRequests = specialRequests;

        // Sequelize: update
        await booking.update(updateData);

        // Load with table info
        const updatedBooking = await Booking.findByPk(_id, {
            include: [{
                model: Table,
                as: 'table',
                attributes: ['tableNumber', 'capacity', 'location']
            }]
        });

        return response.status(200).json({
            message: "Cập nhật đặt bàn thành công",
            data: updatedBooking,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Cancel booking
export async function cancelBookingController(request, response) {
    try {
        const { _id } = request.body;

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID đặt bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const booking = await Booking.findByPk(_id);
        if (!booking) {
            return response.status(404).json({
                message: "Không tìm thấy đặt bàn",
                error: true,
                success: false
            });
        }

        if (booking.status === 'cancelled') {
            return response.status(400).json({
                message: "Đặt bàn đã bị hủy trước đó",
                error: true,
                success: false
            });
        }

        if (booking.status === 'completed') {
            return response.status(400).json({
                message: "Không thể hủy đặt bàn đã hoàn thành",
                error: true,
                success: false
            });
        }

        // Sequelize: update
        await booking.update({ status: 'cancelled' });

        // Send email
        if (booking.email) {
            await sendEmail({
                sendTo: booking.email,
                subject: "Thông báo hủy đặt bàn - EatEase Restaurant",
                html: bookingEmailTemplate(booking)
            });
        }

        // Refund logic
        if (booking.depositPaid && booking.paymentIntentId && !booking.depositRefunded) {
            const now = new Date();
            const bookingTime = new Date(booking.bookingDate);
            const timeDiff = bookingTime - now;
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            // Refund 100% if cancelled by admin or > 24h before booking
            if (request.body.cancelledBy === 'admin' || hoursDiff > 24) {
                try {
                    const refund = await Stripe.refunds.create({
                        payment_intent: booking.paymentIntentId,
                    });
                    await booking.update({
                        depositRefunded: true,
                        refundId: refund.id,
                        depositRefundAmount: booking.depositAmount
                    });
                } catch (err) {
                    console.error("Refund failed:", err);
                }
            }
        }

        return response.status(200).json({
            message: "Hủy đặt bàn thành công",
            data: booking,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Confirm booking (admin)
export async function confirmBookingController(request, response) {
    try {
        const { _id } = request.body;

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID đặt bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const booking = await Booking.findByPk(_id);
        if (!booking) {
            return response.status(404).json({
                message: "Không tìm thấy đặt bàn",
                error: true,
                success: false
            });
        }

        if (booking.status !== 'pending') {
            return response.status(400).json({
                message: "Chỉ có thể xác nhận đặt bàn đang chờ",
                error: true,
                success: false
            });
        }

        // Sequelize: update
        await booking.update({ status: 'confirmed' });

        // Send email
        if (booking.email) {
            await sendEmail({
                sendTo: booking.email,
                subject: "Đặt bàn thành công - EatEase Restaurant",
                html: bookingEmailTemplate(booking)
            });
        }

        return response.status(200).json({
            message: "Xác nhận đặt bàn thành công",
            data: booking,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get available tables for booking
export async function getAvailableTablesForBookingController(request, response) {
    try {
        const { bookingDate, bookingTime, numberOfGuests } = request.body;

        if (!bookingDate || !bookingTime || !numberOfGuests) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ngày, giờ và số người",
                error: true,
                success: false
            });
        }

        const selectedDate = new Date(bookingDate);

        // Sequelize: Get all tables with enough capacity
        const tables = await Table.findAll({
            where: {
                capacity: { [Op.gte]: numberOfGuests },
                status: 'available'
            }
        });

        // Sequelize: Get bookings for this date/time
        const bookedTables = await Booking.findAll({
            where: {
                bookingDate: selectedDate,
                bookingTime,
                status: { [Op.in]: ['pending', 'confirmed'] }
            },
            attributes: ['tableId']
        });

        const bookedTableIds = bookedTables.map(b => b.tableId);

        // Filter out booked tables
        const availableTables = tables.filter(
            table => !bookedTableIds.includes(table.id)
        );

        return response.status(200).json({
            message: "Lấy danh sách bàn trống thành công",
            data: availableTables,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get customer bookings (by phone or email)
export async function getCustomerBookingsController(request, response) {
    try {
        const { phone, email } = request.body;

        if (!phone && !email) {
            return response.status(400).json({
                message: "Vui lòng cung cấp số điện thoại hoặc email",
                error: true,
                success: false
            });
        }

        // Sequelize: Build where clause
        const where = {};
        if (phone) where.phone = phone;
        if (email) where.email = email;

        // Sequelize: findAll with where and include
        const bookings = await Booking.findAll({
            where,
            include: [{
                model: Table,
                as: 'table',
                attributes: ['tableNumber', 'capacity', 'location']
            }],
            order: [['bookingDate', 'DESC'], ['bookingTime', 'DESC']]
        });

        return response.status(200).json({
            message: "Lấy danh sách đặt bàn thành công",
            data: bookings,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Create Stripe Payment Session for Booking
export async function createBookingPaymentSession(request, response) {
    try {
        const { bookingId } = request.body;
        const userId = request.userId; // From auth middleware

        // Sequelize: findByPk with include
        const booking = await Booking.findByPk(bookingId, {
            include: [{
                model: User,
                as: 'user'
            }]
        });

        if (!booking) {
            return response.status(404).json({
                message: "Không tìm thấy đặt bàn",
                error: true,
                success: false
            });
        }

        if (booking.depositPaid) {
            return response.status(400).json({
                message: "Đặt bàn này đã được thanh toán cọc",
                error: true,
                success: false
            });
        }

        if (booking.depositAmount <= 0) {
            return response.status(400).json({
                message: "Đặt bàn này không yêu cầu đặt cọc",
                error: true,
                success: false
            });
        }

        const params = {
            submit_type: 'pay',
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: booking.email,
            metadata: {
                bookingId: booking.id,
                type: 'booking_deposit'
            },
            line_items: [
                {
                    price_data: {
                        currency: 'vnd',
                        product_data: {
                            name: `Đặt cọc bàn cho ${booking.customerName}`,
                            description: `Đặt cọc cho ${booking.numberOfGuests} người vào ${new Date(booking.bookingDate).toLocaleDateString('vi-VN')} lúc ${booking.bookingTime}`,
                        },
                        unit_amount: booking.depositAmount,
                    },
                    quantity: 1,
                },
            ],
            success_url: `${process.env.FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/booking/cancel`,
        };

        const session = await Stripe.checkout.sessions.create(params);

        return response.status(200).json(session);

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get booking report data for analytics
export async function getBookingReportData(request, response) {
    try {
        const { startDate, endDate } = request.query;

        // Sequelize: Build where clause
        const where = {};
        if (startDate || endDate) {
            where.bookingDate = {};
            if (startDate) where.bookingDate[Op.gte] = new Date(startDate);
            if (endDate) where.bookingDate[Op.lte] = new Date(endDate);
        }

        // Sequelize: findAll with include
        const bookings = await Booking.findAll({
            where,
            include: [
                {
                    model: Table,
                    as: 'table',
                    attributes: ['tableNumber']
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email']
                }
            ],
            order: [['bookingDate', 'DESC']]
        });

        // Calculate metrics
        const totalBookings = bookings.length;
        const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;
        const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
        const pendingBookings = bookings.filter(b => b.status === 'pending').length;
        const completedBookings = bookings.filter(b => b.status === 'completed').length;

        const cancellationRate = totalBookings > 0
            ? ((cancelledBookings / totalBookings) * 100).toFixed(2)
            : 0;

        // Peak hours analysis
        const hourCounts = {};
        bookings.forEach(booking => {
            const hour = booking.bookingTime.split(':')[0];
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const peakHours = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([hour, count]) => ({
                hour: `${hour}:00`,
                count
            }));

        // Average party size
        const totalGuests = bookings.reduce((sum, b) => sum + b.numberOfGuests, 0);
        const avgPartySize = totalBookings > 0
            ? (totalGuests / totalBookings).toFixed(1)
            : 0;

        // Bookings by date
        const bookingsByDate = {};
        bookings.forEach(booking => {
            const date = new Date(booking.bookingDate).toISOString().split('T')[0];
            if (!bookingsByDate[date]) {
                bookingsByDate[date] = {
                    date,
                    count: 0,
                    guests: 0
                };
            }
            bookingsByDate[date].count += 1;
            bookingsByDate[date].guests += booking.numberOfGuests;
        });

        return response.status(200).json({
            message: "Lấy báo cáo đặt bàn thành công",
            data: {
                summary: {
                    totalBookings,
                    confirmedBookings,
                    pendingBookings,
                    cancelledBookings,
                    completedBookings,
                    cancellationRate: parseFloat(cancellationRate),
                    avgPartySize: parseFloat(avgPartySize)
                },
                peakHours,
                bookingsByDate: Object.values(bookingsByDate).sort((a, b) =>
                    new Date(a.date) - new Date(b.date)
                ),
                statusDistribution: {
                    pending: pendingBookings,
                    confirmed: confirmedBookings,
                    cancelled: cancelledBookings,
                    completed: completedBookings
                },
                hourDistribution: hourCounts
            },
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}
