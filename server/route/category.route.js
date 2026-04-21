import { Router } from "express";
import verifyCognitoToken from "../middleware/verifyCognitoToken.js";
import {
    addCategoryController,
    deleteCategoryController,
    getCategoryController,
    updateCategoryController,
    getDeletedCategoriesController,
    restoreCategoryController,
    hardDeleteCategoryController
} from "../controllers/category.controller.js";

const categoryRouter = Router()

categoryRouter.post('/add-category', verifyCognitoToken, addCategoryController)
categoryRouter.get('/get-category', getCategoryController)
categoryRouter.put('/update-category', verifyCognitoToken, updateCategoryController)
categoryRouter.delete('/delete-category', verifyCognitoToken, deleteCategoryController)

// New routes for soft delete functionality
categoryRouter.get('/get-deleted-categories', verifyCognitoToken, getDeletedCategoriesController)
categoryRouter.put('/restore-category', verifyCognitoToken, restoreCategoryController)
categoryRouter.delete('/hard-delete-category', verifyCognitoToken, hardDeleteCategoryController)

export default categoryRouter