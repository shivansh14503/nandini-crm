import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import type { CrmModuleKey } from './formConfig.defaults.js';
import { formConfigService } from './formConfig.service.js';

const param = (req: Request, name: string) => String(req.params[name]);
const moduleParam = (req: Request) => param(req, 'module') as CrmModuleKey;

export const formConfigController = {
    async getAll(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.getConfigs(req.query));
    },

    getModuleDefaults(req: Request, res: Response): void {
        sendSuccess(res, formConfigService.getModuleDefaults(moduleParam(req)));
    },

    // ── Categories & options ──
    async createCategory(req: Request, res: Response): Promise<void> {
        sendCreated(res, await formConfigService.createCategory(req.body, requireUser(req)), 'Dropdown created');
    },
    async updateCategory(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.updateCategory(param(req, 'categoryKey'), req.body, requireUser(req)), 'Dropdown updated');
    },
    async deleteCategory(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.deleteCategory(param(req, 'categoryKey'), requireUser(req)), 'Dropdown deleted');
    },
    async addOption(req: Request, res: Response): Promise<void> {
        sendCreated(res, await formConfigService.addOption(param(req, 'categoryKey'), req.body, requireUser(req)), 'Option added');
    },
    async updateOption(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.updateOption(param(req, 'optionId'), req.body, requireUser(req)), 'Option updated');
    },
    async deleteOption(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.deleteOption(param(req, 'optionId'), requireUser(req)), 'Option deleted');
    },
    async reorderOptions(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.reorderOptions(param(req, 'categoryKey'), req.body, requireUser(req)), 'Options reordered');
    },

    // ── Fields ──
    async createField(req: Request, res: Response): Promise<void> {
        sendCreated(res, await formConfigService.createField(req.body, requireUser(req)), 'Custom field added');
    },
    async updateField(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.updateField(param(req, 'fieldId'), req.body, requireUser(req)), 'Field updated');
    },
    async deleteField(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.deleteField(param(req, 'fieldId'), requireUser(req)), 'Custom field deleted');
    },
    async reorderFields(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.reorderFields(moduleParam(req), req.body, requireUser(req)), 'Fields reordered');
    },
    async renameSection(req: Request, res: Response): Promise<void> {
        sendSuccess(
            res,
            await formConfigService.renameSection(moduleParam(req), param(req, 'sectionKey'), req.body, requireUser(req)),
            'Section renamed',
        );
    },
    async resetModule(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await formConfigService.resetModule(moduleParam(req), requireUser(req)), 'Form reset to defaults');
    },
};
