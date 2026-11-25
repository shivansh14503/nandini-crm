import { createCrudController } from '../shared/crud.js';
import { contractService } from './contract.service.js';

export const contractController = createCrudController(contractService, { singular: 'Contract', plural: 'contracts' });
