// API client for connecting to the WizeApp backend
// Ensure we always target the versioned API prefix even if env omits it
const rawBase = process.env.NEXT_PUBLIC_API_URL || 'https://api.wazeapp.xyz/api/v1';
const API_BASE_URL = (() => {
  try {
    const u = new URL(rawBase);
    // If path already contains '/api/', keep as-is; else append '/api/v1'
    if (/\/api\//.test(u.pathname)) return rawBase.replace(/\/$/, '');
    return `${rawBase.replace(/\/$/, '')}/api/v1`;
  } catch {
    // Fallback for relative or malformed values
    return rawBase.endsWith('/api/v1') ? rawBase : `${rawBase.replace(/\/$/, '')}/api/v1`;
  }
})();

interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  organizationName?: string;
  invitationToken?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined as unknown as T,
          error: data.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        data: undefined as unknown as T,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Authentication endpoints
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<{ message: string }>> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async resendVerificationEmail(email: string): Promise<ApiResponse<{ message: string }>> {
    return this.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // OAuth endpoints
  getGoogleAuthUrl(): string {
    return `${this.baseURL}/auth/google`;
  }

  getMicrosoftAuthUrl(): string {
    return `${this.baseURL}/auth/microsoft`;
  }

  getFacebookAuthUrl(): string {
    return `${this.baseURL}/auth/facebook`;
  }

  // Health check
  async health(): Promise<ApiResponse<any>> {
    return this.request('/health');
  }
}

// Export singleton instance
export const api = new ApiClient(API_BASE_URL);
export type { ApiResponse, AuthResponse, LoginRequest, RegisterRequest };
