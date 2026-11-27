import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { formConfigController } from './formConfig.controller.js';
import {
    categoryKeyParamSchema,
    fieldIdParamSchema,
    moduleParamSchema,
    moduleSettingParamSchema,
    optionIdParamSchema,
    sectionParamSchema,
} from './formConfig.validator.js';

/**
 * /api/form-configs
 *   GET    /                                          ?includeInactive  → FormConfigsPayload (any signed-in user)
 *   ── Admin only ──
 *   POST   /categories                                { label, module, description?, options? }  (key derived from the label)
 *   PATCH  /categories/:categoryKey                   { label?, description?, module? }  (an admin-created dropdown's key follows its label)
 *   DELETE /categories/:categoryKey                   hard delete (admin-created only; removes its options + linked custom fields)
 *   POST   /categories/:categoryKey/options           { value, meta? }   (the option's name is its value)
 *   PUT    /categories/:categoryKey/options/reorder   { optionIds }
 *   PATCH  /options/:optionId                         { label?, meta?, isDefault? }  (a rename renames the stored value; records and filters follow; system options: no rename)
 *   DELETE /options/:optionId                         permanent delete; blocked for system options
 *   POST   /fields                                    field added in the builder (key = its label in snake_case, e.g. po_number)
 *   PATCH  /fields/:fieldId                           (core-locked: can't hide / un-require; a custom field's key follows its label)
 *   DELETE /fields/:fieldId                           permanent delete of a custom field; blocked for built-in fields
 *   PUT    /modules/:module/fields/reorder            { fieldIds }
 *   PATCH  /modules/:module/sections/:sectionKey      { sectionLabel }
 *   PUT    /modules/:module/settings/:settingKey      { value }  module setting, e.g. leads/ratingNewLead { hot, warm }
 *
 * Option `meta` is free-form except `ratingRule` (Customer Response options) and `closesLead` (Status options),
 * which are validated: docs/lead-rating-rules.md.
 *
 * Deletes are permanent: a deleted built-in field stays a hidden tombstone and is never restored.
 */
const router = Router();
router.use(authenticate);

router.get('/', formConfigController.getAll);

const admin = requireAdmin;

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
router.put('/modules/:module/fields/convert-order', admin, validateRequest({ params: moduleParamSchema }), formConfigController.reorderConvertFields);
router.patch('/modules/:module/sections/:sectionKey', admin, validateRequest({ params: sectionParamSchema }), formConfigController.renameSection);
router.put('/modules/:module/settings/:settingKey', admin, validateRequest({ params: moduleSettingParamSchema }), formConfigController.updateModuleSetting);

export default router;
