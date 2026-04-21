import { Router } from "express";
import verifyCognitoToken from './../middleware/verifyCognitoToken.js';
import {
    addSubCategoryController,
    deleteSubCategoryController,
    getSubCategoryController,
    updateSubCategoryController
} from "../controllers/subCategory.controller.js";

const subCategoryRouter = Router()

subCategoryRouter.post('/add-sub-category', verifyCognitoToken, addSubCategoryController)
subCategoryRouter.get('/get-sub-category', getSubCategoryController)
subCategoryRouter.put('/update-sub-category', verifyCognitoToken, updateSubCategoryController)
subCategoryRouter.delete('/delete-sub-category', verifyCognitoToken, deleteSubCategoryController)

export default subCategoryRouter