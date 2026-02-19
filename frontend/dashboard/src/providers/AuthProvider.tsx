'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    plan: string;
    limits: {
      maxAgents: number;
      maxRequestsPerMonth: number;
      maxStorageBytes: number;
    };
  };
  avatar?: string;
  preferences: {
    theme: string;
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  hasPermission: (permission: string) => boolean;
  refreshAuth: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const getUserPlanInfo = async (userData: any) => {
    try {
      const response = await api.get('/subscriptions/usage-summary');

      if (response.success && response.data) {
        const planData = response.data;

        // Check if user has a real organization - prefer data from subscription endpoint
        const hasOrganization = planData?.organizationId ||
                                userData?.currentOrganizationId ||
                                userData?.currentOrganization?.id ||
                                userData?.organizationId;

        // Get organization name - prefer subscription data which includes real org name
        const orgName = planData?.organizationName ||
                        userData?.currentOrganization?.name ||
                        userData?.organization?.name ||
                        (hasOrganization ? 'Mon Organisation' : 'Personal Workspace');

        return {
          organization: {
            id: hasOrganization || 'personal',
            name: orgName,
            plan: planData.plan,
            limits: {
              maxAgents: planData.usage?.agents?.limit || 1,
              maxRequestsPerMonth: planData.usage?.monthlyRequests?.limit || 100,
              maxStorageBytes: planData.usage?.storage?.limit || 100 * 1024 * 1024,
            },
          },
        };
      }
    } catch (error) {
      // Silently fall back to free plan
    }

    // Fallback to free plan
    const hasOrganization = userData?.currentOrganizationId ||
                            userData?.currentOrganization?.id ||
                            userData?.organizationId;
    const fallbackName = userData?.currentOrganization?.name ||
                         userData?.organization?.name ||
                         (hasOrganization ? 'Mon Organisation' : 'Personal Workspace');

    return {
      organization: {
        id: hasOrganization || 'personal',
        name: fallbackName,
        plan: 'free',
        limits: {
          maxAgents: 1,
          maxRequestsPerMonth: 100,
          maxStorageBytes: 100 * 1024 * 1024,
        },
      },
    };
  };

  const initAuth = async () => {
    try {
      // Check for OAuth temp code in URL (from OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get('code');

      if (authCode) {
        // Clean up URL immediately to prevent code reuse
        window.history.replaceState(null, '', window.location.pathname);

        // Exchange the temporary code for actual tokens
        const exchangeResponse = await api.exchangeCode(authCode);
        if (exchangeResponse.success && exchangeResponse.data?.accessToken) {
          localStorage.setItem('auth-token', exchangeResponse.data.accessToken);
          if (exchangeResponse.data.refreshToken) {
            localStorage.setItem('refresh-token', exchangeResponse.data.refreshToken);
          }
        }
      }

      const savedToken = localStorage.getItem('auth-token');
      const savedRefreshToken = localStorage.getItem('refresh-token');

      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      // Try to validate token with real API first
      api.setToken(savedToken);

      const response = await api.getProfile();

      if (response.success && response.data?.user) {
        const userData = response.data.user;
        setToken(savedToken);

        // Get subscription plan info with user data
        const planInfo = await getUserPlanInfo(userData);

        setUser({
          ...userData,
          role: userData.role || userData.currentOrganization?.role || 'member',
          organizationId: userData.currentOrganizationId || null,
          organization: planInfo.organization,
          preferences: {
            theme: 'system',
            language: 'en',
            timezone: 'UTC',
            notifications: {
              email: true,
              push: true,
              sms: false,
            },
          },
        });
        return;
      }

      // Check if it's an auth error (401) vs network error
      // Be more specific with "Invalid" to avoid false positives
      const isAuthError = response.error?.includes('401') ||
                          response.error?.includes('Unauthorized') ||
                          response.error?.includes('Invalid token') ||
                          response.error?.includes('jwt') ||
                          response.error?.includes('expired');

      if (isAuthError) {
        // Token is invalid, try to refresh
        const refreshToken = localStorage.getItem('refresh-token');

        if (refreshToken) {
          try {
            const refreshResponse = await api.refreshToken();

            if (refreshResponse.success && refreshResponse.data?.accessToken) {
              // Retry profile with new token
              const retryResponse = await api.getProfile();
              if (retryResponse.success && retryResponse.data?.user) {
                const userData = retryResponse.data.user;
                setToken(refreshResponse.data.accessToken);
                const planInfo = await getUserPlanInfo(userData);
                setUser({
                  ...userData,
                  role: userData.role || userData.currentOrganization?.role || 'member',
                  organizationId: userData.currentOrganizationId || null,
                  organization: planInfo.organization,
                  preferences: {
                    theme: 'system',
                    language: 'en',
                    timezone: 'UTC',
                    notifications: { email: true, push: true, sms: false },
                  },
                });
                return;
              }
            }
          } catch (refreshError) {
            // Refresh failed silently
          }
        }

        // Refresh failed, remove tokens
        localStorage.removeItem('auth-token');
        localStorage.removeItem('refresh-token');
        api.setToken(null);
      }
      // Network or other error - keep the token for retry
    } catch (error) {
      // Unexpected error - don't remove token automatically
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login(email, password);
      
      if (!response.success) {
        throw new Error(response.error || 'Login failed');
      }

      const { user: userData, accessToken, refreshToken } = response.data;

      // Set token FIRST before any API calls
      setToken(accessToken);
      localStorage.setItem('auth-token', accessToken);
      if (refreshToken) {
        localStorage.setItem('refresh-token', refreshToken);
      }
      api.setToken(accessToken);

      // Now get subscription plan info (requires token)
      const planInfo = await getUserPlanInfo(userData);

      setUser({
        ...userData,
        role: userData.role || userData.currentOrganization?.role || 'member',
        organizationId: userData.currentOrganizationId || null,
        organization: planInfo.organization,
        preferences: {
          theme: 'system',
          language: 'en',
          timezone: 'UTC',
          notifications: {
            email: true,
            push: true,
            sms: false,
          },
        },
      });
      
      analytics.track('login_success', { userId: userData.id });
      toast.success(`Welcome back, ${userData.firstName}!`);
      router.push('/dashboard');
    } catch (error: any) {
      const message = error.message || 'Login failed';
      toast.error(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    // Invalidate refresh token on the backend (best-effort)
    try {
      await api.logout();
    } catch {
      // Ignore errors - still clear local state
    }

    analytics.track('logout');
    analytics.reset();
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth-token');
    localStorage.removeItem('refresh-token');
    api.setToken(null);

    toast.success('Logged out successfully');
    // Redirect to local login page
    window.location.href = '/login';
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;

    // Role-based permissions
    const rolePermissions: Record<string, string[]> = {
      owner: ['*'], // All permissions
      admin: [
        'agents.manage',
        'knowledge.manage',
        'conversations.view',
        'conversations.manage',
        'analytics.view',
        'users.manage',
        'settings.manage',
      ],
      member: [
        'agents.view',
        'knowledge.view',
        'conversations.view',
        'analytics.view',
      ],
      viewer: [
        'agents.view',
        'conversations.view',
        'analytics.view',
      ],
    };

    const userPermissions = rolePermissions[user.role] || [];
    
    // Check for wildcard permission
    if (userPermissions.includes('*')) return true;
    
    // Check for specific permission
    return userPermissions.includes(permission);
  };

  const refreshTokenFn = useCallback(async (): Promise<void> => {
    try {
      const response = await api.refreshToken();

      if (!response.success) {
        throw new Error('Token refresh failed');
      }

      const { accessToken } = response.data;
      setToken(accessToken);
      localStorage.setItem('auth-token', accessToken);
      api.setToken(accessToken);
    } catch (error) {
      // If refresh fails, logout user
      logout();
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        updateUser,
        hasPermission,
        refreshAuth: initAuth,
        refreshToken: refreshTokenFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}