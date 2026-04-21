import { Router } from "express";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";
import uploadImageController from "../controllers/uploadImage.controller.js";
import upload from './../middleware/multer.js';

const uploadRouter = Router()

uploadRouter.post('/upload', verifyCognitoToken, upload.single('image'), uploadImageController)

export default uploadRouter