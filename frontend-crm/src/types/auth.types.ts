export interface User {
    id: number;
    username: string;
    role: string;
}

export interface LoginPayload {
    username: string;
    password: string;
}

export interface AuthState {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
}
