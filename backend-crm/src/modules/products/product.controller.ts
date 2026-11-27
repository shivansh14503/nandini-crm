import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { createCrudController } from '../shared/crud.js';
import { productService } from './product.service.js';

export const productController = {
    ...createCrudController(productService, { singular: 'Product', plural: 'products' }),
    /** Manufacturer suggestions for the product form (`ManufacturerSuggestionDto[]`). */
    async manufacturers(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await productService.manufacturers(req.query));
    },
};
