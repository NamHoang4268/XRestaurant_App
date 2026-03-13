import sendEmail from '../config/sendEmail.js'
import UserModel from '../models/user.model.js'
import bcryptjs from 'bcryptjs'
import verifyEmailTemplate from './../utils/verifyEmailTemplate.js';
import generatedAccessToken from '../utils/generatedAccessToken.js';
import generatedRefreshToken from '../utils/generatedRefreshToken.js';
import uploadImageCloudinary from '../utils/uploadImageCloudinary.js';
import generatedOtp from '../utils/generatedOtp.js';
import forgotPasswordTemplate from '../utils/forgotPasswordTemplate.js';
import welcomeEmailTemplate from '../utils/welcomeEmailTemplate.js';
import jwt from 'jsonwebtoken'
import OrderModel from '../models/order.model.js'
import { OAuth2Client } from 'google-auth-library'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

// Register Controller
export async function registerUserController(req, res) {
    try {
        const { name, email, password, mobile } = req.body

        if (!name || !email || !password || !mobile) {
            return res.status(400).json({
                message: "Vui lòng nhập các trường bắt buộc",
                error: true,
                success: false
            })
        }

        const user = await UserModel.findOne({ email })

        if (user) {
            return res.json({
                message: "Email đã tồn tại",
                error: true,
                success: false
            })
        }

        const salt = await bcryptjs.genSalt(10)
        const hashPassword = await bcryptjs.hash(password, salt)

        const payload = {
            name,
            email,
            password: hashPassword,
            mobile
        }

        const newUser = new UserModel(payload)
        const save = await newUser.save()

        const VerifyEmailUrl = `${process.env.FRONTEND_URL}/verify-email?code=${save?._id}`

        const verifyEmail = await sendEmail({
            sendTo: email,
            subject: "Xác nhận email từ EatEase Restaurant",
            html: verifyEmailTemplate({
                name,
                url: VerifyEmailUrl
            })
        })

        return res.json({
            message: "Đăng ký thành công",
            error: false,
            success: true,
            data: save
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Verify Email
export async function verifyEmailController(req, res) {
    try {
        const { code } = req.body

        const user = await UserModel.findOne({ _id: code })

        if (!user) {
            return res.status(400).json({
                message: "Mã không hợp lệ",
                error: true,
                success: false
            })
        }

        const updateUser = await UserModel.updateOne({ _id: code }, {
            verify_email: true
        })

        return res.json({
            message: "Xác nhận email thành công",
            error: false,
            success: true
        })
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: true
        })
    }
}

// Login Controller
export async function loginController(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Vui lòng nhập email, mật khẩu",
                error: true,
                success: false
            });
        }

        const user = await UserModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                message: "Tài khoản không tồn tại",
                error: true,
                success: false
            });
        }

        if (user.status !== "Active") {
            return res.status(400).json({
                message: "Liên hệ Admin",
                error: true,
                success: false
            });
        }

        // Tài khoản đăng ký qua Google không có mật khẩu
        if (!user.password) {
            return res.status(400).json({
                message: "Tài khoản này được đăng ký bằng Google. Vui lòng đăng nhập bằng Google.",
                error: true,
                success: false
            });
        }

        const checkPassword = await bcryptjs.compare(password, user.password);

        if (!checkPassword) {
            return res.status(400).json({
                message: "Mật khẩu không chính xác",
                error: true,
                success: false
            });
        }

        const accessToken = await generatedAccessToken(user._id);
        const refreshToken = await generatedRefreshToken(user._id);

        const updateUser = await UserModel.findByIdAndUpdate(user?._id, {
            last_login_date: new Date()
        });

        const cookiesOption = {
            httpOnly: true,
            secure: true,
            sameSite: "None"
        };

        // Lưu token vào cookie (vẫn giữ cho bảo mật)
        res.cookie('accessToken', accessToken, cookiesOption);
        res.cookie('refreshToken', refreshToken, cookiesOption);

        // Trả token trong response body để frontend sử dụng
        return res.json({
            message: "Đăng nhập thành công",
            error: false,
            success: true,
            data: {
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Logout Controller
export async function logoutController(req, res) {
    try {
        const userId = req.userId // middleware

        const cookiesOption = {
            httpOnly: true,
            secure: true,
            sameSite: "None"
        }

        res.clearCookie("accessToken", cookiesOption)
        res.clearCookie("refreshToken", cookiesOption)

        const removeRefreshToken = await UserModel.findByIdAndUpdate(userId, {
            refresh_token: ""
        })

        return res.json({
            message: "Đăng xuất thành công",
            error: false,
            success: true
        })
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Upload User Avatar
export async function uploadAvatar(req, res) {
    try {
        const userId = req.userId; // auth middleware
        const image = req.file; // multer middleware

        if (!image) {
            return res.status(400).json({
                message: "Không có file ảnh được tải lên",
                success: false,
                error: true
            });
        }

        const upload = await uploadImageCloudinary(image);

        if (!upload.success) {
            return res.status(400).json({
                message: upload.error || "Lỗi khi tải ảnh lên",
                success: false,
                error: true
            });
        }

        const updateUser = await UserModel.findByIdAndUpdate(
            userId,
            { avatar: upload.data.url },
            { new: true, select: '-password -refreshToken -otp -otpExpires' }
        );

        return res.json({
            message: "Cập nhật ảnh đại diện thành công",
            success: true,
            error: false,
            data: {
                _id: userId,
                avatar: upload.data.url
            }
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật ảnh đại diện:', error);
        return res.status(500).json({
            message: error.message || "Đã xảy ra lỗi khi cập nhật ảnh đại diện",
            error: true,
            success: false
        });
    }
}

// Update User Details
export async function updateUserDetails(req, res) {
    try {
        const userId = req.userId // auth middleware
        const { name, email, mobile, password } = req.body

        let hashPassword = ""

        if (password) {
            const salt = await bcryptjs.genSalt(10)
            hashPassword = await bcryptjs.hash(password, salt)
        }

        const updateUser = await UserModel.updateOne({ _id: userId }, {
            ...(name && { name: name }),
            ...(email && { email: email }),
            ...(mobile && { mobile: mobile }),
            ...(password && { password: hashPassword }),
        })

        return res.json({
            message: "Cập nhật thông tin thành công",
            error: false,
            success: true,
            data: updateUser
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Forgot Password API (not login)
export async function forgotPasswordController(req, res) {
    try {
        const { email } = req.body

        const user = await UserModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Tài khoản không tồn tại",
                error: true,
                success: false
            })
        }

        const otp = generatedOtp()
        const expireTime = new Date() + 60 * 60 * 1000 // 1hr

        const update = await UserModel.findByIdAndUpdate(user._id, {
            forgot_password_otp: otp,
            forgot_password_expiry: new Date(expireTime).toISOString()
        })

        await sendEmail({
            sendTo: email,
            subject: "Quên mật khẩu từ EatEase Restaurant",
            html: forgotPasswordTemplate({
                name: user.name,
                otp: otp
            })
        })

        return res.json({
            message: "Kiểm tra email",
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Verify Forgot Password Otp
export async function verifyForgotPasswordOtp(req, res) {
    try {
        const { email, otp } = req.body

        if (!email || !otp) {
            return res.status(400).json({
                message: "Vui lòng nhập email, otp.",
                error: true,
                success: false
            })
        }

        const user = await UserModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Email không tồn tại",
                error: true,
                success: false
            })
        }

        const currentTime = new Date().toISOString()

        if (user.forgot_password_expiry < currentTime) {
            return res.status(400).json({
                message: "Mã OTP đã hết hạn",
                error: true,
                success: false
            })
        }

        if (otp !== user.forgot_password_otp) {
            return res.status(400).json({
                message: "Mã OTP không chính xác",
                error: true,
                success: false
            })
        }

        const updateUser = await UserModel.findByIdAndUpdate(user?._id, {
            forgot_password_otp: '',
            forgot_password_expiry: ''
        })

        return res.json({
            message: "Xác nhận mã OTP thành công",
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Verify Password
export async function verifyPassword(req, res) {
    try {
        const { password } = req.body;
        const userId = req.userId; // Changed from req.user._id to req.userId

        if (!password) {
            return res.status(400).json({
                message: "Vui lòng nhập mật khẩu hiện tại",
                error: true,
                success: false
            });
        }

        const user = await UserModel.findById(userId).select('+password');

        if (!user) {
            return res.status(404).json({
                message: "Người dùng không tồn tại",
                error: true,
                success: false
            });
        }

        const isPasswordValid = await bcryptjs.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Mật khẩu không chính xác",
                error: true,
                success: false
            });
        }

        return res.json({
            message: "Xác thực mật khẩu thành công",
            error: false,
            success: true,
            email: user.email,
            userId: user._id // Include user ID in the response
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Change Password
export async function changePassword(req, res) {
    try {
        const { newPassword, confirmNewPassword, userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                message: "Thiếu thông tin người dùng",
                error: true,
                success: false
            });
        }

        // Get user email for resetPassword function
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                message: "Người dùng không tồn tại",
                error: true,
                success: false
            });
        }

        // Reuse resetPassword logic
        return resetPassword({
            ...req,
            body: {
                email: user.email,
                newPassword,
                confirmNewPassword
            }
        }, res);

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Reset the Password
export async function resetPassword(req, res) {
    try {
        const { email, newPassword, confirmNewPassword } = req.body

        if (!email || !newPassword || !confirmNewPassword) {
            return res.status(400).json({
                message: "Vui lòng nhập các trường bắt buộc",
                error: true,
                success: false
            })
        }

        const user = await UserModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Email không tồn tại",
                error: true,
                success: false
            })
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({
                message: "Mật khẩu mới và mật khẩu xác nhận phải giống nhau.",
                error: true,
                success: false
            })
        }

        const salt = await bcryptjs.genSalt(10)
        const hashPassword = await bcryptjs.hash(newPassword, salt)

        const updater = await UserModel.findOneAndUpdate(user._id, {
            password: hashPassword
        })

        return res.json({
            message: "Mật khẩu đã được cập nhật",
            error: false,
            success: true
        })

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}

// Refresh Token API Controller
export async function refreshTokenController(req, res) {
    try {
        const refreshToken = req?.headers?.authorization?.split(" ")[1];

        if (!refreshToken) {
            return res.status(400).json({
                message: "Token không hợp lệ",
                error: true,
                success: false
            });
        }

        const verifyToken = jwt.verify(refreshToken, process.env.SECRET_KEY_REFRESH_TOKEN);

        if (!verifyToken) {
            return res.status(400).json({
                message: "Token hết hạn",
                error: true,
                success: false
            });
        }

        const userId = verifyToken?._id;
        const newAccessToken = await generatedAccessToken(userId);

        return res.json({
            message: "Token mới đã được tạo",
            error: false,
            success: true,
            data: {
                accessToken: newAccessToken,
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get Login User Details
export async function userDetails(req, res) {
    try {
        const userId = req.userId

        const user = await UserModel.findById(userId).select('-password -refresh_token')

        return res.json({
            message: 'Chi tiết người dùng',
            data: user,
            error: false,
            success: true
        })
    } catch (error) {
        return res.status(500).json({
            message: 'Có lỗi xảy ra',
            error: true,
            success: false
        })
    }
}

export async function userPoints(req, res) {
    try {
        const userId = req.userId

        const user = await UserModel.findById(userId).select('points -password -refresh_token')

        return res.json({
            message: 'Điểm người dùng',
            data: user,
            error: false,
            success: true
        })
    } catch (error) {
        return res.status(500).json({
            message: 'Có lỗi xảy ra',
            error: true,
            success: false
        })
    }
}

// Google OAuth Login/Register Controller
export async function googleLoginController(req, res) {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({
                message: "Thiếu Google Access Token",
                error: true,
                success: false
            });
        }

        // Gọi Google userinfo endpoint để lấy thông tin user
        const userInfoResponse = await fetch(
            `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`
        );

        if (!userInfoResponse.ok) {
            return res.status(401).json({
                message: "Access Token Google không hợp lệ hoặc đã hết hạn",
                error: true,
                success: false
            });
        }

        const { sub: googleId, email, name, picture } = await userInfoResponse.json();

        if (!email) {
            return res.status(400).json({
                message: "Không lấy được email từ tài khoản Google",
                error: true,
                success: false
            });
        }

        // Tìm user theo googleId trước, sau đó theo email
        let user = await UserModel.findOne({ googleId });

        if (!user) {
            user = await UserModel.findOne({ email });

            if (user) {
                // Email đã tồn tại — liên kết googleId
                if (user.status !== "Active") {
                    return res.status(403).json({
                        message: "Tài khoản đã bị khóa. Vui lòng liên hệ Admin",
                        error: true,
                        success: false
                    });
                }
                user.googleId = googleId;
                if (!user.avatar) user.avatar = picture || "";
                await user.save();
            } else {
                // User mới — tự động đăng ký
                user = new UserModel({
                    name,
                    email,
                    googleId,
                    avatar: picture || "",
                    verify_email: true,
                    role: "CUSTOMER",
                    status: "Active"
                });
                await user.save();

                // Gửi email chào mừng cho user đăng ký lần đầu qua Google
                sendEmail({
                    sendTo: email,
                    subject: "Chào mừng bạn đến với EatEase Restaurant! 🎉",
                    html: welcomeEmailTemplate({
                        name,
                        loginUrl: process.env.FRONTEND_URL || "/"
                    })
                }).catch((err) => console.error("[sendEmail] Welcome email error:", err));
            }
        }

        if (user.status !== "Active") {
            return res.status(403).json({
                message: "Tài khoản đã bị khóa. Vui lòng liên hệ Admin",
                error: true,
                success: false
            });
        }

        const accessTokenJWT = await generatedAccessToken(user._id);
        const refreshToken = await generatedRefreshToken(user._id);

        await UserModel.findByIdAndUpdate(user._id, {
            last_login_date: new Date()
        });

        const cookiesOption = {
            httpOnly: true,
            secure: true,
            sameSite: "None"
        };

        res.cookie('accessToken', accessTokenJWT, cookiesOption);
        res.cookie('refreshToken', refreshToken, cookiesOption);

        return res.json({
            message: "Đăng nhập Google thành công",
            error: false,
            success: true,
            data: {
                accessToken: accessTokenJWT,
                refreshToken
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || "Lỗi xác thực Google",
            error: true,
            success: false
        });
    }
}

// Get customer analytics for reports

export async function getCustomerAnalytics(req, res) {
    try {
        const { startDate, endDate } = req.query;

        // Build query for orders
        const orderQuery = {};
        if (startDate) {
            orderQuery.createdAt = { $gte: new Date(startDate) };
        }
        if (endDate) {
            orderQuery.createdAt = {
                ...orderQuery.createdAt,
                $lte: new Date(endDate)
            };
        }

        // Get all orders with user info
        const orders = await OrderModel.find(orderQuery)
            .populate('userId', 'name email createdAt')
            .sort({ createdAt: -1 });

        // Calculate customer metrics
        const customerStats = {};

        orders.forEach(order => {
            if (!order.userId) return;

            const userId = order.userId._id.toString();

            if (!customerStats[userId]) {
                customerStats[userId] = {
                    userId: order.userId._id,
                    name: order.userId.name,
                    email: order.userId.email,
                    orderCount: 0,
                    totalRevenue: 0,
                    joinedDate: order.userId.createdAt
                };
            }

            customerStats[userId].orderCount += 1;
            customerStats[userId].totalRevenue += order.totalAmt || 0;
        });

        // Convert to array and sort
        const customersArray = Object.values(customerStats);

        // Top customers by order count
        const topByOrders = [...customersArray]
            .sort((a, b) => b.orderCount - a.orderCount)
            .slice(0, 10);

        // Top customers by revenue
        const topByRevenue = [...customersArray]
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);

        // New vs returning customers
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newCustomers = customersArray.filter(c =>
            new Date(c.joinedDate) >= thirtyDaysAgo
        ).length;

        const returningCustomers = customersArray.filter(c =>
            c.orderCount > 1
        ).length;

        // Customer growth by month
        const customerGrowth = {};
        customersArray.forEach(customer => {
            const month = new Date(customer.joinedDate).toISOString().slice(0, 7); // YYYY-MM
            customerGrowth[month] = (customerGrowth[month] || 0) + 1;
        });

        return res.status(200).json({
            message: "Lấy phân tích khách hàng thành công",
            data: {
                summary: {
                    totalCustomers: customersArray.length,
                    newCustomers,
                    returningCustomers,
                    avgOrdersPerCustomer: customersArray.length > 0
                        ? (orders.length / customersArray.length).toFixed(2)
                        : 0
                },
                topByOrders,
                topByRevenue,
                customerGrowth: Object.entries(customerGrowth)
                    .map(([month, count]) => ({ month, count }))
                    .sort((a, b) => a.month.localeCompare(b.month))
            },
            error: false,
            success: true
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}