import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { formConfigController } from './formConfig.controller.js';
import {
    categoryKeyParamSchema,
    fieldIdParamSchema,
    moduleParamSchema,
    optionIdParamSchema,
    sectionParamSchema,
} from './formConfig.validator.js';

/** Roles allowed to change forms and dropdowns. */
export const FORM_CONFIG_ADMIN_ROLES = ['Admin', 'Administrator', 'Super Admin'] as const;

/**
 * /api/form-configs
 *   GET    /                                          ?includeInactive  → FormConfigsPayload (any signed-in user)
 *   GET    /modules/:module/defaults                  built-in field defaults (what reset restores)
 *   ── Admin only ──
 *   POST   /categories                                { key?, label, module, description?, options? }
 *   PATCH  /categories/:categoryKey                   { label?, description? }
 *   DELETE /categories/:categoryKey                   hard delete (admin-created only; removes its options + linked custom fields)
 *   POST   /categories/:categoryKey/options           { value, label?, meta? }   (re-adding an archived value restores it)
 *   PUT    /categories/:categoryKey/options/reorder   { optionIds }
 *   PATCH  /options/:optionId                         { value?, label?, meta?, isActive? }  (system options: no rename / archive)
 *   DELETE /options/:optionId                         permanent delete; blocked for system options (archive = PATCH isActive:false)
 *   POST   /fields                                    custom field (key auto-prefixed cf_)
 *   PATCH  /fields/:fieldId                           (core-locked: can't hide / un-require; built-in: fixed tab, any section of it)
 *   DELETE /fields/:fieldId                           permanent delete of a custom field; blocked for built-in fields
 *   PUT    /modules/:module/fields/reorder            { fieldIds }
 *   PATCH  /modules/:module/sections/:sectionKey      { sectionLabel }
 *   POST   /modules/:module/reset                     built-in fields back to defaults (custom fields kept)
 */
const router = Router();
router.use(authenticate);

router.get('/', formConfigController.getAll);
router.get('/modules/:module/defaults', validateRequest({ params: moduleParamSchema }), formConfigController.getModuleDefaults);

const admin = requireRole(...FORM_CONFIG_ADMIN_ROLES);

router.post('/categories', admin, formConfigController.createCategory);
router.patch('/categories/:categoryKey', admin, validateRequest({ params: categoryKeyParamSchema }), formConfigController.updateCategory);
router.delete('/categories/:categoryKey', admin, validateRequest({ params: categoryKeyParamSchema }), formConfigController.deleteCategory);
router.post('/categories/:categoryKey/options', admin, validateRequest({ params: categoryKeyParamSchema }), formConfigController.addOption);
router.put(
    '/categories/:categoryKey/options/reorder',
    admin,
    validateRequest({ params: categoryKeyParamSchema }),
    formConfigController.reorderOptions,
);
router.patch('/options/:optionId', admin, validateRequest({ params: optionIdParamSchema }), formConfigController.updateOption);
router.delete('/options/:optionId', admin, validateRequest({ params: optionIdParamSchema }), formConfigController.deleteOption);

router.post('/fields', admin, formConfigController.createField);
router.patch('/fields/:fieldId', admin, validateRequest({ params: fieldIdParamSchema }), formConfigController.updateField);
router.delete('/fields/:fieldId', admin, validateRequest({ params: fieldIdParamSchema }), formConfigController.deleteField);
router.put('/modules/:module/fields/reorder', admin, validateRequest({ params: moduleParamSchema }), formConfigController.reorderFields);
router.patch('/modules/:module/sections/:sectionKey', admin, validateRequest({ params: sectionParamSchema }), formConfigController.renameSection);
router.post('/modules/:module/reset', admin, validateRequest({ params: moduleParamSchema }), formConfigController.resetModule);

export default router;
