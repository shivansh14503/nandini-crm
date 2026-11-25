import type { Document } from '../types/document.types';
import { createCrudService } from './base.service';

/**
 * Activities › Documents (`/api/documents`). Read-only: use `list`, `getAll` and `getById`; documents are written by
 * the opportunity form's Documentation section.
 */
export const documentService = createCrudService<Document, never, never>('/api/documents');
