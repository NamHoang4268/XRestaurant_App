import mongoose from "mongoose";
import OrderModel from "./order.model.js";

// Define points history schema
const pointsHistorySchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['earned', 'redemption', 'expired', 'admin_adjustment'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Provide name"],
    },
    email: {
        type: String,
        required: [true, "Provide email"],
        unique: true,
    },
    password: {
        type: String,
        default: null,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
    },
    avatar: {
        type: String,
        default: "",
    },
    mobile: {
        type: String,
        default: null,
    },
    refresh_token: {
        type: String,
        default: "",
    },
    verify_email: {
        type: Boolean,
        default: false,
    },
    last_login_date: {
        type: Date,
        default: "",
    },
    status: {
        type: String,
        enum: ["Active", "Inactive", "Suspended"],
        default: "Active",
    },
    shopping_cart: [
        {
            type: mongoose.Schema.ObjectId,
            ref: 'cartProduct'
        }
    ],
    orderHistory: [
        {
            type: mongoose.Schema.ObjectId,
            ref: 'order'
        }
    ],
    forgot_password_otp: {
        type: String,
        default: null,
    },
    forgot_password_expiry: {
        type: Date,
        default: "",
    },
    role: {
        type: String,
        enum: ["ADMIN", "WAITER", "CHEF", "CASHIER", "CUSTOMER", "TABLE"],
        default: "CUSTOMER",
    },
    // Employee-specific fields
    employeeId: {
        type: String,
        unique: true,
        sparse: true, // Allow null for non-employees
    },
    hireDate: {
        type: Date,
    },
    position: {
        type: String,
    },
    employeeStatus: {
        type: String,
        enum: ["active", "inactive", "on_leave"],
        default: "active",
    },
    // Table-specific field
    linkedTableId: {
        type: mongoose.Schema.ObjectId,
        ref: 'table',
        default: null
    },
    performanceStats: {
        totalWorkingHours: { type: Number, default: 0 },
        ordersHandled: { type: Number, default: 0 }, // For Waiter
        dishesCooked: { type: Number, default: 0 },  // For Chef
        averageRating: { type: Number, default: 0, min: 0, max: 5 },
    },
    rewardsPoint: {
        type: Number,
        default: 0,
        min: 0,
    },
    pointsHistory: [pointsHistorySchema],
}, {
    timestamps: true
})

// Add a post-save hook to the Order model to update user's rewards points
OrderModel.schema.post('save', async function (doc) {
    try {
        // Only process if the order has earnedPoints and is a new or updated document
        if (doc.earnedPoints && doc.earnedPoints > 0) {
            // Find the user and update their rewards points
            await mongoose.model('user').findByIdAndUpdate(
                doc.userId,
                {
                    $inc: { rewardsPoint: doc.earnedPoints },
                    $push: {
                        orderHistory: doc._id,
                        pointsHistory: {
                            orderId: doc.orderId,
                            points: doc.earnedPoints,
                            type: 'earned',
                            description: `Tích điểm từ đơn hàng ${doc.orderId}`,
                            createdAt: new Date()
                        }
                    }
                },
                { new: true, useFindAndModify: false }
            );

            console.log(`Added ${doc.earnedPoints} points to user ${doc.userId} for order ${doc._id}`);
        }
    } catch (error) {
        console.error('Error updating user points from order:', error);
    }
});

const UserModel = mongoose.model("user", userSchema)

export default UserModel