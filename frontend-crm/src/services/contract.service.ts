import type { Contract, ContractFormData } from '../types/contract.types';
import { createCrudService } from './base.service';

export const contractService = createCrudService<Contract, ContractFormData, Partial<ContractFormData>>('/api/contracts');
