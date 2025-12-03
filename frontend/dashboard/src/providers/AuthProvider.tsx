'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
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
  logout: () => void;
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
      console.log('AuthProvider: getUserPlanInfo called with userData:', userData);
      const response = await api.get('/subscriptions/usage-summary');
      console.log('AuthProvider: Subscription response:', response);

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

        console.log('AuthProvider: Organization info - hasOrg:', hasOrganization, 'name:', orgName);

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
      console.log('Error fetching plan info:', error);
    }

    // Fallback to free plan
    const hasOrganization = userData?.currentOrganizationId ||
                            userData?.currentOrganization?.id ||
                            userData?.organizationId;
    const fallbackName = userData?.currentOrganization?.name ||
                         userData?.organization?.name ||
                         (hasOrganization ? 'Mon Organisation' : 'Personal Workspace');

    console.log('AuthProvider: Using fallback - hasOrg:', hasOrganization, 'name:', fallbackName);

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
      // Check for token in URL first (from marketing site login)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const urlRefresh = urlParams.get('refresh');
      
      if (urlToken) {
        console.log('AuthProvider: Found token in URL, setting in localStorage');
        localStorage.setItem('auth-token', urlToken);
        if (urlRefresh) {
          localStorage.setItem('refresh-token', urlRefresh);
        }
        // Clean up URL
        window.history.replaceState(null, '', window.location.pathname);
      }
      
      const savedToken = localStorage.getItem('auth-token');
      if (!savedToken) {
        console.log('AuthProvider: No token found');
        setIsLoading(false);
        return;
      }

      // Try to validate token with real API first
      console.log('AuthProvider: Validating token:', savedToken.substring(0, 20) + '...');
      api.setToken(savedToken);
      
      try {
        const response = await api.getProfile();
        console.log('AuthProvider: API response:', response);
        
        if (response.success && response.data.user) {
          console.log('AuthProvider: Token valid, setting user');
          console.log('AuthProvider: Full response.data:', response.data);
          const userData = response.data.user;
          setToken(savedToken);

          // Get subscription plan info with user data
          const planInfo = await getUserPlanInfo(userData);

          setUser({
            ...userData,
            role: 'owner', // Default role for users without organizations
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
      } catch (error) {
        console.log('AuthProvider: API call failed:', error);
      }
      
      // If API failed, the token is likely invalid - remove it
      console.log('AuthProvider: Token validation failed, removing invalid token');
      localStorage.removeItem('auth-token');
      localStorage.removeItem('refresh-token');
      api.setToken(null);
    } catch (error) {
      // Token is invalid
      console.log('AuthProvider: Exception during auth init:', error);
      localStorage.removeItem('auth-token');
      api.setToken(null);
      console.error('Auth initialization failed:', error);
    } finally {
      console.log('AuthProvider: Initialization complete');
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
        role: 'owner', // Default role
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
      
      toast.success(`Welcome back, ${userData.firstName}!`);
      router.push('/dashboard');
    } catch (error: any) {
      const message = error.message || 'Login failed';
      toast.error(message);
      throw new Error(message);
    }
  };

  const logout = () => {
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

  const refreshTokenFn = async (): Promise<void> => {
    try {
      console.log('AuthProvider: Attempting token refresh');
      const response = await api.refreshToken();
      
      if (!response.success) {
        throw new Error('Token refresh failed');
      }

      const { accessToken } = response.data;
      setToken(accessToken);
      localStorage.setItem('auth-token', accessToken);
      api.setToken(accessToken);
      
      console.log('AuthProvider: Token refreshed successfully');
    } catch (error) {
      console.error('AuthProvider: Token refresh failed:', error);
      // If refresh fails, logout user
      logout();
      throw error;
    }
  };

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