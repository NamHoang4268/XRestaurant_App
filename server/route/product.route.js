import { Router } from "express";
import verifyCognitoToken from '../middleware/verifyCognitoToken.js';
import authorize from '../middleware/authorize.js'
import {
    addProductController,
    deleteProductDetails,
    getProductByCategory,
    getProductByCategoryAndSubCategory,
    getProductController,
    getProductDetails,
    searchProduct,
    updateProductDetails,
    getInitialProducts
} from "../controllers/product.controller.js";

const productRouter = Router()

productRouter.post('/add-product', verifyCognitoToken, authorize('ADMIN'), addProductController)
productRouter.post('/get-product', getProductController)
productRouter.post('/get-product-by-category', getProductByCategory)
productRouter.post('/get-product-by-category-and-subcategory', getProductByCategoryAndSubCategory)
productRouter.post('/get-product-details', getProductDetails)

//update product
productRouter.put('/update-product-details', verifyCognitoToken, authorize('ADMIN'), updateProductDetails)

//delete product
productRouter.delete('/delete-product', verifyCognitoToken, authorize('ADMIN'), deleteProductDetails)

//search product
productRouter.post('/search-product', searchProduct)

//get initial products
productRouter.post('/initial-products', getInitialProducts)

export default productRouter