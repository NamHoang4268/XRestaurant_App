import { Router } from 'express'
import {
    changePassword, forgotPasswordController, loginController,
    logoutController, refreshTokenController, registerUserController, resetPassword,
    updateUserDetails, uploadAvatar, userDetails, userPoints, verifyEmailController,
    verifyForgotPasswordOtp, verifyPassword, getCustomerAnalytics, googleLoginController
} from '../controllers/user.controller.sequelize.js'
import verifyCognitoToken from '../middleware/verifyCognitoToken.js'
import upload from './../middleware/multer.js';

const userRouter = Router()

userRouter.post('/register', registerUserController)
userRouter.post('/verify-email', verifyEmailController)
userRouter.post('/login', loginController)
userRouter.post('/google-login', googleLoginController)
userRouter.get('/logout', verifyCognitoToken, logoutController)
userRouter.put('/upload-avatar', verifyCognitoToken, upload.single('avatar'), uploadAvatar)
userRouter.put('/update-user', verifyCognitoToken, updateUserDetails)
userRouter.put('/forgot-password', forgotPasswordController)
userRouter.put('/verify-forgot-password-otp', verifyForgotPasswordOtp)
userRouter.put('/reset-password', resetPassword)
userRouter.post('/refresh-token', refreshTokenController)
userRouter.post('/verify-password', verifyCognitoToken, verifyPassword)
userRouter.put('/change-password', verifyCognitoToken, changePassword)
userRouter.get('/user-details', verifyCognitoToken, userDetails)
userRouter.get('/user-points', verifyCognitoToken, userPoints)

// Analytics route
userRouter.get('/analytics', verifyCognitoToken, getCustomerAnalytics)

export default userRouter