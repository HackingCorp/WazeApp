// API utility for making HTTP requests to the backend

const rawBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100/api/v1';
const API_BASE_URL = (() => {
  try {
    const u = new URL(rawBase);
    if (/\/api\//.test(u.pathname)) return rawBase.replace(/\/$/, '');
    return `${rawBase.replace(/\/$/, '')}/api/v1`;
  } catch {
    return rawBase.endsWith('/api/v1') ? rawBase : `${rawBase.replace(/\/$/, '')}/api/v1`;
  }
})();

interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Try to get token from localStorage on client side
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth-token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth-token', token);
      } else {
        localStorage.removeItem('auth-token');
      }
    }
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData = options.body instanceof FormData;
    
    const headers = {
      // Only set Content-Type for non-FormData requests
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };
    
    // Debug: Log token status
    console.log('API Request:', {
      url,
      hasToken: !!this.token,
      tokenPreview: this.token ? `${this.token.substring(0, 20)}...` : 'No token'
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      // Handle 401 Unauthorized - try to refresh token
      if (response.status === 401 && !isRetry && typeof window !== 'undefined') {
        console.log('API: Got 401, attempting token refresh...');
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          console.log('API: Token refreshed, retrying request...');
          return this.request(endpoint, options, true); // Retry with new token
        }
      }

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      };
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        data: null as T,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) {
        console.log('API: No refresh token available');
        return false;
      }

      console.log('API: Attempting token refresh with refresh token:', refreshToken.substring(0, 20) + '...');

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      console.log('API: Refresh response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('API: Refresh response data:', data);

        const newAccessToken = data.data?.accessToken || data.accessToken;
        const newRefreshToken = data.data?.refreshToken || data.refreshToken;

        if (newAccessToken) {
          this.setToken(newAccessToken);

          // Update refresh token if provided
          if (newRefreshToken) {
            localStorage.setItem('refresh-token', newRefreshToken);
            console.log('API: Updated refresh token');
          }

          console.log('API: Token refresh successful, new token:', newAccessToken.substring(0, 20) + '...');
          return true;
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.log('API: Token refresh failed with status', response.status, errorData);
      }

      return false;
    } catch (error) {
      console.error('API: Token refresh error:', error);
      return false;
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    organizationName: string;
  }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refresh-token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async getProfile() {
    return this.request('/auth/profile');
  }

  async updateProfile(data: any) {
    return this.request('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Organization endpoints
  async getOrganization() {
    return this.request('/organizations/current');
  }

  async updateOrganization(data: any) {
    return this.request('/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Users endpoints
  async getUsers() {
    return this.request('/users');
  }

  async inviteUser(data: { email: string; role: string }) {
    return this.request('/users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Agents endpoints
  async getAgents() {
    try {
      const response = await this.request('/agents');
      if (response.success && response.data && response.data.data) {
        // Transform the API response to match expected format
        const agents = response.data.data.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description || '',
          status: agent.status,
          model: 'GPT-4', // Default model for display
          language: agent.primaryLanguage || 'French',
          personality: agent.tone || 'Professional',
          conversationsCount: agent.metrics?.totalConversations || 0,
          averageResponseTime: agent.metrics?.averageResponseTime || 0,
          satisfactionRate: agent.metrics?.satisfactionScore || 0,
          createdAt: agent.createdAt,
          lastActive: 'Recently active', // Could be calculated from lastActive field
        }));
        
        return {
          success: true,
          data: agents
        };
      }
      
      // If no data, return empty array instead of mock data
      return {
        success: true,
        data: []
      };
    } catch (error) {
      console.error('Error fetching agents:', error);
      // Return empty array on error
      return {
        success: true,
        data: []
      };
    }
  }

  async createAgent(data: any) {
    return this.request('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgent(id: string, data: any) {
    return this.request(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(id: string) {
    return this.request(`/agents/${id}`, {
      method: 'DELETE',
    });
  }

  // WhatsApp endpoints
  async getWhatsAppSessions() {
    return this.request('/whatsapp/sessions');
  }

  async createWhatsAppSession(data: any) {
    return this.request('/whatsapp/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async connectWhatsAppSession(sessionId: string) {
    return this.request(`/whatsapp/sessions/${sessionId}/connect`, {
      method: 'POST',
    });
  }

  async disconnectWhatsAppSession(sessionId: string) {
    return this.request(`/whatsapp/sessions/${sessionId}/disconnect`, {
      method: 'POST',
    });
  }

  async getWhatsAppSessionStatus(sessionId: string) {
    return this.request(`/whatsapp/sessions/${sessionId}/status`);
  }

  async getQrCode(sessionId: string) {
    return this.request(`/whatsapp/sessions/${sessionId}/qr`);
  }

  async getSessionContacts(sessionId: string) {
    return this.request(`/whatsapp/sessions/${sessionId}/contacts`);
  }

  async lookupContactName(sessionId: string, phoneNumber: string) {
    return this.request(`/whatsapp/contacts/lookup?sessionId=${sessionId}&phoneNumber=${encodeURIComponent(phoneNumber)}`);
  }

  async sendMessage(data: {
    sessionId: string;
    phone: string;
    message: string;
    type?: 'text' | 'image' | 'audio' | 'file';
  }) {
    return this.request('/whatsapp/send-message', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Conversations endpoints
  async getConversations(params?: {
    page?: number;
    limit?: number;
    status?: string;
    state?: string;
  }) {
    const queryString = params ? `?${new URLSearchParams(params as any)}` : '';
    return this.request(`/conversations${queryString}`);
  }

  // WhatsApp Conversations endpoints
  async getWhatsAppConversations() {
    return this.request('/whatsapp/conversations');
  }

  async getWhatsAppConversationMessages(id: string) {
    return this.request(`/whatsapp/conversations/${id}/messages`);
  }

  async sendWhatsAppConversationMessage(id: string, content: string) {
    return this.request(`/whatsapp/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async markWhatsAppConversationAsRead(id: string) {
    return this.request(`/whatsapp/conversations/${id}/read`, {
      method: 'PUT',
    });
  }

  // Debug methods
  async simulateWhatsAppMessage(phoneNumber: string, message: string) {
    return this.request('/whatsapp/test/simulate-message', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, message }),
    });
  }

  async getWebSocketStatus() {
    return this.request('/whatsapp/debug/websocket-status');
  }

  async getConversation(id: string) {
    return this.request(`/conversations/${id}`);
  }

  async getConversationMessages(id: string, params?: {
    page?: number;
    limit?: number;
  }) {
    const queryString = params ? `?${new URLSearchParams(params as any)}` : '';
    return this.request(`/conversations/${id}/messages${queryString}`);
  }

  async sendConversationMessage(id: string, data: {
    content: string;
    mediaUrls?: string[];
    priority?: string;
    metadata?: any;
  }) {
    return this.request(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createConversation(data: {
    agentId: string;
    phoneNumber: string;
    initialMessage?: string;
    metadata?: any;
  }) {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async archiveConversation(id: string) {
    return this.request(`/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  // Analytics endpoints
  async getAnalytics(params?: any) {
    const queryString = params ? `?${new URLSearchParams(params)}` : '';
    return this.request(`/analytics${queryString}`);
  }

  // Knowledge Base endpoints
  async getKnowledgeBase(id: string) {
    return this.request(`/knowledge-bases/${id}`);
  }

  async getKnowledgeBaseDocuments(id: string, params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const queryString = params ? `?${new URLSearchParams(params as any)}` : '';
    return this.request(`/knowledge-bases/${id}/documents${queryString}`);
  }

  async deleteDocument(id: string) {
    return this.request(`/documents/${id}`, { method: 'DELETE' });
  }

  async reprocessDocument(id: string) {
    return this.request(`/documents/${id}/reprocess`, { method: 'POST' });
  }

  // Document upload method
  async uploadDocument(file: File, knowledgeBaseId: string, title?: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('knowledgeBaseId', knowledgeBaseId);
    formData.append('title', title || file.name);
    
    // Map file type to DocumentType enum
    const getDocumentType = (mimeType: string) => {
      if (mimeType.includes('pdf')) return 'pdf';
      if (mimeType.includes('docx')) return 'docx';
      if (mimeType.includes('msword')) return 'docx';
      if (mimeType.includes('text/plain')) return 'txt';
      if (mimeType.includes('text/markdown')) return 'md';
      if (mimeType.includes('image')) return 'image';
      if (mimeType.includes('video')) return 'video';
      if (mimeType.includes('audio')) return 'audio';
      return 'txt'; // default
    };
    
    formData.append('type', getDocumentType(file.type));

    return this.request('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  // URL upload method
  async uploadFromUrl(data: {
    url: string;
    title: string;
    knowledgeBaseId: string;
    tags?: string[];
    options?: {
      waitForSelector?: string;
      removeSelectors?: string[];
      includeImages?: boolean;
      followLinks?: boolean;
      maxDepth?: number;
    };
  }) {
    return this.request('/documents/upload-url', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Real-time URL scraping method
  async scrapeUrl(data: {
    url: string;
    options?: {
      waitForSelector?: string;
      removeSelectors?: string[];
      includeImages?: boolean;
      followLinks?: boolean;
      maxDepth?: number;
    };
  }) {
    return this.request('/documents/scrape-url', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Create rich text document (for saving scraped content directly)
  async createRichTextDocument(data: {
    title: string;
    content: string;
    knowledgeBaseId: string;
    tags?: string[];
    filename?: string;
    mimeType?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request('/documents/rich-text', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Generic HTTP methods
  async get(endpoint: string) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint: string, data?: any) {
    // Handle FormData differently from regular objects
    const isFormData = data instanceof FormData;
    
    return this.request(endpoint, {
      method: 'POST',
      ...(data && { 
        body: isFormData ? data : JSON.stringify(data) 
      }),
      ...(isFormData && {
        headers: {
          // Don't set Content-Type for FormData, let the browser set it
        }
      })
    });
  }

  async put(endpoint: string, data?: any) {
    return this.request(endpoint, {
      method: 'PUT',
      ...(data && { body: JSON.stringify(data) }),
    });
  }

  async patch(endpoint: string, data?: any) {
    return this.request(endpoint, {
      method: 'PATCH',
      ...(data && { body: JSON.stringify(data) }),
    });
  }

  async delete(endpoint: string) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // File upload
  async uploadFile(file: File, path: string = 'general') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    return this.request('/files/upload', {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type for FormData, let the browser set it
      },
    });
  }

  // ============================================
  // PAYMENT ENDPOINTS
  // ============================================

  // Get pricing information
  async getPaymentPricing() {
    return this.request('/payments/pricing');
  }

  // Get pricing with currency conversion
  async getPricing(currency?: string, billing: 'monthly' | 'annually' = 'monthly') {
    const params = new URLSearchParams();
    if (currency) params.append('currency', currency);
    params.append('billing', billing);
    return this.request(`/pricing?${params.toString()}`);
  }

  // Get supported currencies
  async getCurrencies() {
    return this.request('/pricing/currencies');
  }

  // Get exchange rates
  async getExchangeRates() {
    return this.request('/pricing/rates');
  }

  // Convert amount from USD
  async convertCurrency(amount: number, toCurrency: string) {
    return this.request(`/pricing/convert?amount=${amount}&to=${toCurrency}`);
  }

  // Test S3P connectivity
  async pingS3P() {
    return this.request('/payments/s3p/ping');
  }

  // Test E-nkap connectivity
  async pingEnkap() {
    return this.request('/payments/enkap/test-token');
  }

  // Initiate S3P Mobile Money payment (MTN/Orange)
  async initiateS3PPayment(data: {
    amount: number;
    customerPhone: string;
    paymentType: 'orange' | 'mtn';
    customerName?: string;
    description?: string;
  }) {
    return this.request('/payments/s3p/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Verify S3P payment status
  async verifyS3PPayment(transactionRef: string) {
    return this.request('/payments/s3p/verify', {
      method: 'POST',
      body: JSON.stringify({ transactionRef }),
    });
  }

  // Initiate E-nkap multi-channel payment
  async initiateEnkapPayment(data: {
    merchantReference: string;
    customerName: string;
    customerEmail?: string;
    customerPhone: string;
    totalAmount: number;
    currency?: string;
    description?: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    returnUrl?: string;
    notificationUrl?: string;
  }) {
    return this.request('/payments/enkap/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Check E-nkap payment status
  async checkEnkapStatus(txid: string) {
    return this.request(`/payments/enkap/status?txid=${txid}`);
  }

  // Get subscription usage summary
  async getSubscriptionUsage() {
    return this.request('/subscriptions/usage-summary');
  }

  // Legacy initiate payment (for backward compatibility)
  async initiatePayment(data: {
    plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';
    customerPhone: string;
    customerEmail: string;
    customerName: string;
    customerAddress?: string;
    serviceNumber: string;
  }) {
    return this.request('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Verify payment status
  async verifyPayment(data: { ptn?: string; transactionId?: string }) {
    return this.request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient(API_BASE_URL);

// Legacy apiHelpers for backward compatibility
export const apiHelpers = {
  agents: {
    getAll: () => api.getAgents(),
    create: (data: any) => api.createAgent(data),
    update: (id: string, data: any) => api.updateAgent(id, data),
    delete: (id: string) => api.deleteAgent(id),
  },
  analytics: {
    getDashboard: () => api.getAnalytics(),
  },
  media: {
    upload: (formData: FormData) => {
      const file = formData.get('file') as File;
      const path = formData.get('path') as string || 'general';
      return api.uploadFile(file, path);
    },
  },
  payments: {
    getPricing: () => api.getPaymentPricing(),
    pingS3P: () => api.pingS3P(),
    pingEnkap: () => api.pingEnkap(),
    initiateS3P: (data: Parameters<typeof api.initiateS3PPayment>[0]) => api.initiateS3PPayment(data),
    verifyS3P: (transactionRef: string) => api.verifyS3PPayment(transactionRef),
    initiateEnkap: (data: Parameters<typeof api.initiateEnkapPayment>[0]) => api.initiateEnkapPayment(data),
    checkEnkapStatus: (txid: string) => api.checkEnkapStatus(txid),
    initiate: (data: Parameters<typeof api.initiatePayment>[0]) => api.initiatePayment(data),
    verify: (data: Parameters<typeof api.verifyPayment>[0]) => api.verifyPayment(data),
  },
  subscriptions: {
    getUsage: () => api.getSubscriptionUsage(),
  },
};

export default api;
