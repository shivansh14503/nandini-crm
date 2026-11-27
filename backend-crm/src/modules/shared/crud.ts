import type { Request, Response, Router } from 'express';
import { requirePermission } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import type { PermissionModule } from '../roles/permissions.js';
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
 * Registers the standard CRUD endpoints, each behind the role permission it needs on `module` (Admin › Roles):
 * GET → View, POST → Create, PUT / PATCH → Edit, DELETE and bulk-delete → Delete (403 when the role has None; the
 * service limits "Own" to the user's records). Call it after any custom routes (e.g. `PATCH /bulk-status`) so
 * those paths aren't captured by `/:id`.
 */
export function registerCrudRoutes(router: Router, controller: CrudController, module: PermissionModule): Router {
    const withId = validateRequest({ params: idParamSchema });
    const withPatch = validateRequest({ params: idParamSchema, body: patchBodySchema });
    const can = (action: 'view' | 'create' | 'edit' | 'delete') => requirePermission(module, action);

    router.get('/', can('view'), controller.list);
    router.post('/', can('create'), controller.create);
    router.post('/bulk-delete', can('delete'), validateRequest({ body: bulkIdsSchema }), controller.bulkRemove);
    router.get('/:id', can('view'), withId, controller.getById);
    router.put('/:id', can('edit'), withPatch, controller.update);
    router.patch('/:id', can('edit'), withPatch, controller.update);
    router.delete('/:id', can('delete'), withId, controller.remove);
    return router;
}
