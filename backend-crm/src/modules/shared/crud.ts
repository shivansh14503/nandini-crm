import type { Request, Response, Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import type { AuthUser } from '../../types/user.types.js';
import { sendCreated, sendPaginated, sendSuccess, type PaginatedResult } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { bulkIdsSchema, idParamSchema, patchBodySchema } from '../../validators/common.js';
import type { BulkDeleteResult } from './transactions.js';

/** What every entity service exposes; the frontend's `createCrudService` relies on exactly these endpoints. */
export interface CrudService<TDto> {
    list(query: unknown, user: AuthUser): Promise<PaginatedResult<TDto>>;
    getById(id: string, user: AuthUser): Promise<TDto>;
    create(body: unknown, user: AuthUser): Promise<TDto>;
    /** `PUT` carries a partial record (frontend `UpdateDto = Partial<…>`), merged onto the stored one. */
    update(id: string, patch: Record<string, unknown>, user: AuthUser): Promise<TDto>;
    remove(id: string, user: AuthUser): Promise<void>;
    bulkRemove(ids: string[], user: AuthUser): Promise<BulkDeleteResult>;
}

export interface EntityLabels {
    /** e.g. "Product" */
    singular: string;
    /** e.g. "products" */
    plural: string;
}

export function createCrudController<TDto>(service: CrudService<TDto>, labels: EntityLabels) {
    return {
        async list(req: Request, res: Response): Promise<void> {
            sendPaginated(res, await service.list(req.query, requireUser(req)));
        },
        async getById(req: Request, res: Response): Promise<void> {
            sendSuccess(res, await service.getById(String(req.params.id), requireUser(req)));
        },
        async create(req: Request, res: Response): Promise<void> {
            sendCreated(res, await service.create(req.body, requireUser(req)), `${labels.singular} created successfully`);
        },
        async update(req: Request, res: Response): Promise<void> {
            const updated = await service.update(String(req.params.id), req.body as Record<string, unknown>, requireUser(req));
            sendSuccess(res, updated, `${labels.singular} updated successfully`);
        },
        async remove(req: Request, res: Response): Promise<void> {
            const id = String(req.params.id);
            await service.remove(id, requireUser(req));
            sendSuccess(res, { id }, `${labels.singular} deleted successfully`);
        },
        async bulkRemove(req: Request, res: Response): Promise<void> {
            const { ids } = req.body as { ids: string[] };
            const result = await service.bulkRemove(ids, requireUser(req));
            sendSuccess(res, result, `${result.deleted} ${result.deleted === 1 ? labels.singular.toLowerCase() : labels.plural} deleted`);
        },
    };
}

export type CrudController = ReturnType<typeof createCrudController>;

/**
 * Registers the standard CRUD endpoints. Call it after any custom routes (e.g. `PATCH /bulk-status`) so
 * those paths aren't captured by `/:id`.
 */
export function registerCrudRoutes(router: Router, controller: CrudController): Router {
    const withId = validateRequest({ params: idParamSchema });
    const withPatch = validateRequest({ params: idParamSchema, body: patchBodySchema });

    router.get('/', controller.list);
    router.post('/', controller.create);
    router.post('/bulk-delete', validateRequest({ body: bulkIdsSchema }), controller.bulkRemove);
    router.get('/:id', withId, controller.getById);
    router.put('/:id', withPatch, controller.update);
    router.patch('/:id', withPatch, controller.update);
    router.delete('/:id', withId, controller.remove);
    return router;
}
