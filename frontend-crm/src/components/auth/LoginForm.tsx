"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    TextField,
    Button,
    Typography,
    InputAdornment,
    IconButton,
    CircularProgress,
} from '@mui/material';
import {
    PersonOutlined as PersonOutlineIcon,
    LockOutlined as LockOutlinedIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../config/constants';
import { ErrorAlert } from '../common/ErrorAlert';
import { FIELD_MAX_LENGTH } from '../forms/fieldSizing';

const PASSWORD_MAX_LENGTH = 128;

export function LoginForm() {
    const router = useRouter();
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleTogglePassword = () => {
        setShowPassword((prev) => !prev);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        const trimmedUsername = username.trim();
        if (!trimmedUsername) {
            setError('Username is required.');
            return;
        }
        if (!password) {
            setError('Password is required.');
            return;
        }

        setLoading(true);
        try {
            await login({ username: trimmedUsername, password });
            router.push(ROUTES.DASHBOARD);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <ErrorAlert id="login-error-alert" error={error} onClose={() => setError(null)} />

            {/* Username Input */}
            <Box sx={{ mb: 2.5 }}>
                <Typography
                    sx={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#4A5568',
                        mb: 0.75,
                        letterSpacing: '0.1px',
                    }}
                >
                    User Name
                </Typography>
                <TextField
                    id="username"
                    fullWidth
                    placeholder="Enter your CRM username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    disabled={loading}
                    slotProps={{
                        htmlInput: { maxLength: FIELD_MAX_LENGTH.email },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <PersonOutlineIcon sx={{ color: '#A0AEC0', fontSize: '20px' }} />
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: '10px',
                            backgroundColor: '#FAFBFC',
                            fontSize: '14px',
                            '& fieldset': { borderColor: '#DDE3EC' },
                            '&:hover fieldset': { borderColor: 'primary.main' },
                            '&.Mui-focused fieldset': {
                                borderColor: 'primary.main',
                                borderWidth: '1.5px',
                            },
                        },
                        '& .MuiInputBase-input': {
                            color: '#2D3748',
                            py: '12px',
                            '&::placeholder': { color: '#A0AEC0', opacity: 1 },
                        },
                    }}
                />
            </Box>

            {/* Password Input */}
            <Box sx={{ mb: 3 }}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 0.75,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#4A5568',
                            letterSpacing: '0.1px',
                        }}
                    >
                        Password
                    </Typography>
                    {/* <Link
                        href="#"
                        underline="hover"
                        sx={{
                            fontSize: '13px',
                            color: 'primary.main',
                            fontWeight: 500,
                            cursor: 'pointer',
                            '&:hover': { color: 'primary.dark' },
                        }}
                    >
                        Forgot password?
                    </Link> */}
                </Box>
                <TextField
                    id="password"
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    slotProps={{
                        htmlInput: { maxLength: PASSWORD_MAX_LENGTH },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <LockOutlinedIcon sx={{ color: '#A0AEC0', fontSize: '20px' }} />
                                </InputAdornment>
                            ),
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        id="toggle-password-visibility"
                                        aria-label="toggle password visibility"
                                        onClick={handleTogglePassword}
                                        edge="end"
                                        sx={{
                                            color: '#A0AEC0',
                                            '&:hover': { color: 'primary.main' },
                                            transition: 'color 0.2s',
                                        }}
                                    >
                                        {showPassword ? (
                                            <VisibilityOffIcon sx={{ fontSize: '20px' }} />
                                        ) : (
                                            <VisibilityIcon sx={{ fontSize: '20px' }} />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            borderRadius: '10px',
                            backgroundColor: '#FAFBFC',
                            fontSize: '14px',
                            '& fieldset': { borderColor: '#DDE3EC' },
                            '&:hover fieldset': { borderColor: 'primary.main' },
                            '&.Mui-focused fieldset': {
                                borderColor: 'primary.main',
                                borderWidth: '1.5px',
                            },
                        },
                        '& .MuiInputBase-input': {
                            color: '#2D3748',
                            py: '12px',
                            '&::placeholder': { color: '#A0AEC0', opacity: 1 },
                        },
                    }}
                />
            </Box>

            {/* Submit Button */}
            <Button
                id="login-submit-btn"
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                    py: '12px',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: 600,
                    letterSpacing: '0.3px',
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)',
                    boxShadow: '0 4px 14px rgba(21, 101, 192, 0.4)',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                        background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 100%)',
                        boxShadow: '0 6px 20px rgba(21, 101, 192, 0.5)',
                        transform: 'translateY(-1px)',
                    },
                    '&:active': {
                        transform: 'translateY(0px)',
                        boxShadow: '0 2px 8px rgba(21, 101, 192, 0.35)',
                    },
                    '&.Mui-disabled': {
                        background: '#B0C4DE',
                        boxShadow: 'none',
                    },
                }}
            >
                {loading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Sign In'}
            </Button>
        </Box>
    );
}
