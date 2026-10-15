import { authService } from '../services/auth.service';
export * from '../types';
export * from '../services';

// Re-export authApi for backwards compatibility
export const authApi = authService;
