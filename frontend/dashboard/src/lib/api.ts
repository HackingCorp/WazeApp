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
  total?: number;
  page?: number;
  limit?: number;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

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
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      // Handle 401 Unauthorized - try to refresh token
      if (response.status === 401 && !isRetry && typeof window !== 'undefined') {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
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
        total: data.total,
        page: data.page,
        limit: data.limit,
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
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this._doRefreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh-token');
      if (!refreshToken) {
        return false;
      }

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();

        const newAccessToken = data.data?.accessToken || data.accessToken;
        const newRefreshToken = data.data?.refreshToken || data.refreshToken;

        if (newAccessToken) {
          this.setToken(newAccessToken);

          // Update refresh token if provided
          if (newRefreshToken) {
            localStorage.setItem('refresh-token', newRefreshToken);
          }

          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('API: Token refresh error:', error);
      return false;
    }
  }

  // Geo detection
  async detectCountry() {
    return this.request<{ countryCode: string | null; mobileMoneyAvailable: boolean }>('/geo/detect');
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

  async exchangeCode(code: string) {
    return this.request('/auth/exchange-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
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

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request('/users/profile/change-password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Organization endpoints
  async createOrganization(data: {
    name: string;
    description?: string;
  }) {
    return this.request('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOrganizations(params?: {
    page?: number;
    limit?: number;
  }) {
    const queryString = params ? `?${new URLSearchParams(params as any)}` : '';
    return this.request(`/organizations${queryString}`);
  }

  async getOrganization(orgId: string) {
    return this.request(`/organizations/${orgId}`);
  }

  async updateOrganization(orgId: string, data: any) {
    return this.request(`/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getOrganizationMembers(orgId: string) {
    return this.request(`/organizations/${orgId}/members`);
  }

  async updateMemberRole(orgId: string, memberId: string, role: string) {
    return this.request(`/organizations/${orgId}/members/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(orgId: string, memberId: string) {
    return this.request(`/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  async leaveOrganization(orgId: string) {
    return this.request(`/organizations/${orgId}/leave`, {
      method: 'DELETE',
    });
  }

  // Users endpoints
  async getUsers() {
    return this.request('/users');
  }

  async inviteUser(orgId: string, data: { email: string; role: string }) {
    return this.request(`/organizations/${orgId}/invite`, {
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
          primaryLanguage: agent.primaryLanguage || 'en',
          tone: agent.tone || 'professional',
          conversationsCount: agent.metrics?.totalConversations || 0,
          averageResponseTime: agent.metrics?.averageResponseTime || 0,
          satisfactionScore: agent.metrics?.satisfactionScore || 0,
          createdAt: agent.createdAt,
          lastActive: agent.metrics?.lastActive || agent.updatedAt,
          systemPrompt: agent.systemPrompt,
          config: agent.config,
          welcomeMessage: agent.welcomeMessage,
          fallbackMessage: agent.fallbackMessage,
          tags: agent.tags || [],
          knowledgeBases: agent.knowledgeBases || [],
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
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Failed to fetch agents',
      };
    }
  }

  async createAgent(data: any) {
    return this.request('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAgent(id: string) {
    return this.request(`/agents/${id}`);
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

  async getAgentStats(agentId?: string) {
    return agentId
      ? this.request(`/conversations/stats?agentId=${agentId}`)
      : this.request('/agents/stats');
  }

  // Agent Testing
  async testAgent(agentId: string, data: {
    message: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    includeSources?: boolean;
    systemPromptOverride?: string;
  }) {
    return this.request(`/agents/${agentId}/test`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // FAQ Generation
  async generateFaq(agentId: string, data?: { maxItems?: number }) {
    return this.request(`/agents/${agentId}/generate-faq`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    });
  }

  // Agent Cloning
  async cloneAgent(agentId: string, name?: string) {
    return this.request(`/agents/${agentId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  // Agent Conversations
  async getAgentConversations(agentId: string, page = 1, limit = 20) {
    return this.request(`/agents/${agentId}/conversations?page=${page}&limit=${limit}`);
  }

  // Prompt History
  async getPromptHistory(agentId: string) {
    return this.request(`/agents/${agentId}/prompt/history`);
  }

  // Prompt Rollback
  async rollbackPrompt(agentId: string, version: number) {
    return this.request(`/agents/${agentId}/prompt/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version })
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

  // Facebook endpoints
  async getFacebookPages() {
    return this.request('/facebook/pages');
  }

  async connectFacebookPage(data: {
    pageAccessToken: string;
    agentId?: string;
    autoReplyEnabled?: boolean;
    replyDelay?: number;
    keywordsFilter?: string[];
  }) {
    return this.request('/facebook/pages/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFacebookPage(pageId: string) {
    return this.request(`/facebook/pages/${pageId}`);
  }

  async updateFacebookPage(pageId: string, data: {
    agentId?: string;
    autoReplyEnabled?: boolean;
    replyDelay?: number;
    keywordsFilter?: string[];
  }) {
    return this.request(`/facebook/pages/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async disconnectFacebookPage(pageId: string) {
    return this.request(`/facebook/pages/${pageId}`, {
      method: 'DELETE',
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
  async getKnowledgeBases(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const queryString = params ? `?${new URLSearchParams(params as any)}` : '';
    return this.request(`/knowledge-bases${queryString}`);
  }

  async getKnowledgeBase(id: string) {
    return this.request(`/knowledge-bases/${id}`);
  }

  async createKnowledgeBase(data: {
    name: string;
    description?: string;
    tags?: string[];
  }) {
    return this.request('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateKnowledgeBase(id: string, data: {
    name?: string;
    description?: string;
    tags?: string[];
  }) {
    return this.request(`/knowledge-bases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteKnowledgeBase(id: string) {
    return this.request(`/knowledge-bases/${id}`, {
      method: 'DELETE',
    });
  }

  async rebuildKnowledgeBase(id: string) {
    return this.request(`/knowledge-bases/${id}/rebuild`, {
      method: 'POST',
    });
  }

  async getKnowledgeBaseStats() {
    return this.request('/knowledge-bases/stats');
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

  // Escalation endpoints
  async takeoverConversation(id: string) {
    return this.request(`/conversations/${id}/takeover`, {
      method: 'POST',
    });
  }

  async releaseConversation(id: string) {
    return this.request(`/conversations/${id}/release`, {
      method: 'POST',
    });
  }

  async sendOperatorReply(id: string, message: string) {
    return this.request(`/conversations/${id}/operator-reply`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getEscalatedConversations(params?: { page?: number; limit?: number }) {
    const queryString = params ? `?${new URLSearchParams({ ...params as any, isHumanControlled: 'true' })}` : '?isHumanControlled=true';
    return this.request(`/conversations${queryString}`);
  }

  // ============================================
  // E-COMMERCE ENDPOINTS
  // ============================================

  // Products
  async getProducts(params?: {
    search?: string;
    status?: string;
    categoryId?: string;
    storeId?: string;
    source?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params?.storeId) queryParams.append('storeId', params.storeId);
    if (params?.source) queryParams.append('source', params.source);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    if (params?.minPrice !== undefined) queryParams.append('minPrice', params.minPrice.toString());
    if (params?.maxPrice !== undefined) queryParams.append('maxPrice', params.maxPrice.toString());
    const query = queryParams.toString();
    return this.request(`/ecommerce/products${query ? `?${query}` : ''}`);
  }

  async getProduct(id: string) {
    return this.request(`/ecommerce/products/${id}`);
  }

  async createProduct(data: any) {
    return this.request('/ecommerce/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: string, data: any) {
    return this.request(`/ecommerce/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: string) {
    return this.request(`/ecommerce/products/${id}`, { method: 'DELETE' });
  }

  async getProductStats() {
    return this.request('/ecommerce/products/stats');
  }

  async bulkDeleteProducts(ids: string[]) {
    return this.request('/ecommerce/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async bulkUpdateProductStatus(ids: string[], status: string) {
    return this.request('/ecommerce/products/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  }

  // E-commerce Stores
  async getEcommerceStores() {
    return this.request('/ecommerce/stores');
  }

  async getEcommerceStore(id: string) {
    return this.request(`/ecommerce/stores/${id}`);
  }

  async createManualCatalog(data: { name: string; description?: string }) {
    return this.request('/ecommerce/stores/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async connectShopifyStore(shopDomain: string) {
    return this.request('/ecommerce/stores/shopify/auth-url', {
      method: 'POST',
      body: JSON.stringify({ shopDomain }),
    });
  }

  async connectWooCommerceStore(data: { storeUrl: string; consumerKey: string; consumerSecret: string; name?: string }) {
    return this.request('/ecommerce/stores/woocommerce/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async connectEMarketStore(data: { storeUrl: string; apiKey: string; name?: string }) {
    return this.request('/ecommerce/stores/emarket/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async syncStore(id: string) {
    return this.request(`/ecommerce/stores/${id}/sync`, { method: 'POST' });
  }

  async getStoreSyncStatus(id: string) {
    return this.request(`/ecommerce/stores/${id}/sync-status`);
  }

  async disconnectStore(id: string) {
    return this.request(`/ecommerce/stores/${id}/disconnect`, { method: 'POST' });
  }

  async deleteStore(id: string) {
    return this.request(`/ecommerce/stores/${id}`, { method: 'DELETE' });
  }

  // E-commerce Categories
  async getProductCategories(params?: { search?: string; page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/ecommerce/categories${query ? `?${query}` : ''}`);
  }

  async createProductCategory(data: { name: string; description?: string; parentId?: string; imageUrl?: string }) {
    return this.request('/ecommerce/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProductCategory(id: string, data: any) {
    return this.request(`/ecommerce/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProductCategory(id: string) {
    return this.request(`/ecommerce/categories/${id}`, { method: 'DELETE' });
  }

  // ============================================
  // ORDERS ENDPOINTS
  // ============================================

  async getOrders(params?: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/orders${query ? `?${query}` : ''}`);
  }

  async getOrder(id: string) {
    return this.request(`/orders/${id}`);
  }

  async getOrderStats() {
    return this.request('/orders/stats');
  }

  async updateOrderStatus(id: string, status: string, reason?: string) {
    return this.request(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(reason && { cancellationReason: reason }) }),
    });
  }

  async createOrder(data: any) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // APPOINTMENTS ENDPOINTS
  // ============================================

  async getAppointments(params?: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    agentId?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
    if (params?.agentId) queryParams.append('agentId', params.agentId);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/appointments${query ? `?${query}` : ''}`);
  }

  async getAppointment(id: string) {
    return this.request(`/appointments/${id}`);
  }

  async getAppointmentStats() {
    return this.request('/appointments/stats');
  }

  async updateAppointmentStatus(id: string, status: string, reason?: string) {
    return this.request(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(reason && { cancellationReason: reason }) }),
    });
  }

  async getBusinessHours(agentId?: string) {
    const query = agentId ? `?agentId=${agentId}` : '';
    return this.request(`/appointments/availability/hours${query}`);
  }

  async setBusinessHours(hours: any[], agentId?: string) {
    return this.request('/appointments/availability/hours', {
      method: 'PUT',
      body: JSON.stringify({ hours, ...(agentId && { agentId }) }),
    });
  }

  async getDaysOff(params?: { agentId?: string; page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.agentId) queryParams.append('agentId', params.agentId);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/appointments/availability/days-off${query ? `?${query}` : ''}`);
  }

  async addDayOff(data: { date: string; reason?: string; allDay?: boolean; startTime?: string; endTime?: string; agentId?: string }) {
    return this.request('/appointments/availability/days-off', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeDayOff(id: string) {
    return this.request(`/appointments/availability/days-off/${id}`, { method: 'DELETE' });
  }

  async getAvailableSlots(date: string, agentId?: string) {
    const query = agentId ? `?date=${date}&agentId=${agentId}` : `?date=${date}`;
    return this.request(`/appointments/availability/slots${query}`);
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

    return this.request('/media/upload', {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type for FormData, let the browser set it
      },
    });
  }

  // ============================================
  // BROADCAST ENDPOINTS
  // ============================================

  // Contacts
  async getBroadcastContacts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    tags?: string[];
    isValidWhatsApp?: boolean;
    isSubscribed?: boolean;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.tags?.length) queryParams.append('tags', params.tags.join(','));
    if (params?.isValidWhatsApp !== undefined) queryParams.append('isValidWhatsApp', String(params.isValidWhatsApp));
    if (params?.isSubscribed !== undefined) queryParams.append('isSubscribed', String(params.isSubscribed));
    const query = queryParams.toString();
    return this.request(`/broadcast/contacts${query ? `?${query}` : ''}`);
  }

  async getBroadcastContactStats() {
    return this.request('/broadcast/contacts/stats');
  }

  async createBroadcastContact(data: {
    phoneNumber: string;
    name: string;
    email?: string;
    company?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  }) {
    return this.request('/broadcast/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBroadcastContact(id: string, data: {
    name?: string;
    email?: string;
    company?: string;
    tags?: string[];
    customFields?: Record<string, any>;
    isSubscribed?: boolean;
  }) {
    return this.request(`/broadcast/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBroadcastContact(id: string) {
    return this.request(`/broadcast/contacts/${id}`, { method: 'DELETE' });
  }

  async deleteBroadcastContactsBulk(ids: string[]) {
    return this.request('/broadcast/contacts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async importBroadcastContacts(file: File, options?: {
    tags?: string[];
    skipDuplicates?: boolean;
    validateWhatsApp?: boolean;
    sessionId?: string;
  }) {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.tags?.length) formData.append('tags', JSON.stringify(options.tags));
    if (options?.skipDuplicates !== undefined) formData.append('skipDuplicates', String(options.skipDuplicates));
    if (options?.validateWhatsApp !== undefined) formData.append('validateWhatsApp', String(options.validateWhatsApp));
    if (options?.sessionId) formData.append('sessionId', options.sessionId);

    return this.request('/broadcast/contacts/import', {
      method: 'POST',
      body: formData,
    });
  }

  async validateBroadcastContact(contactId: string, sessionId: string) {
    return this.request(`/broadcast/contacts/${contactId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async bulkValidateBroadcastContacts(sessionId: string) {
    return this.request('/broadcast/contacts/bulk-validate', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async exportBroadcastContacts(params?: {
    format?: 'csv' | 'json' | 'xlsx';
    tags?: string[];
  }) {
    const queryParams = new URLSearchParams();
    if (params?.format) queryParams.append('format', params.format);
    if (params?.tags?.length) queryParams.append('tags', params.tags.join(','));
    const query = queryParams.toString();
    return this.request(`/broadcast/contacts/export${query ? `?${query}` : ''}`);
  }

  async getBroadcastContactTags() {
    // Tags are returned as part of the contacts/stats endpoint
    const response = await this.request('/broadcast/contacts/stats');
    if (response.success) {
      const statsData = response.data?.data || response.data;
      return { success: true, data: statsData?.tags || [] };
    }
    return response;
  }

  async addTagsToBroadcastContacts(contactIds: string[], tags: string[]) {
    return this.request('/broadcast/contacts/add-tags', {
      method: 'POST',
      body: JSON.stringify({ contactIds, tags }),
    });
  }

  // Templates
  async getBroadcastTemplates(params?: {
    category?: string;
    type?: string;
    isSystem?: boolean;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.isSystem !== undefined) queryParams.append('isSystem', String(params.isSystem));
    const query = queryParams.toString();
    return this.request(`/broadcast/templates${query ? `?${query}` : ''}`);
  }

  async getBroadcastTemplate(id: string) {
    return this.request(`/broadcast/templates/${id}`);
  }

  async createBroadcastTemplate(data: {
    name: string;
    description?: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'sticker';
    category: string;
    content: string;
    caption?: string;
    mediaUrl?: string;
    buttons?: any[];
  }) {
    return this.request('/broadcast/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBroadcastTemplateWithMedia(formData: FormData): Promise<ApiResponse> {
    const response = await fetch(`${this.baseURL}/broadcast/templates/with-media`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.createBroadcastTemplateWithMedia(formData);
      }
    }

    return { success: response.ok, data: data.data || data, error: data.message };
  }

  async updateBroadcastTemplate(id: string, data: {
    name?: string;
    description?: string;
    type?: string;
    category?: string;
    content?: string;
    caption?: string;
    mediaUrl?: string;
    buttons?: any[];
  }) {
    return this.request(`/broadcast/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBroadcastTemplate(id: string) {
    return this.request(`/broadcast/templates/${id}`, { method: 'DELETE' });
  }

  async previewBroadcastTemplate(id: string, variables: Record<string, string>) {
    return this.request(`/broadcast/templates/${id}/preview`, {
      method: 'POST',
      body: JSON.stringify({ variables }),
    });
  }

  // Campaigns
  async getBroadcastCampaignLimits() {
    return this.request('/broadcast/campaigns/limits');
  }

  async getBroadcastDailyStats() {
    return this.request('/broadcast/campaigns/daily-stats');
  }

  async getBroadcastCampaigns(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/broadcast/campaigns${query ? `?${query}` : ''}`);
  }

  async getBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}`);
  }

  async createBroadcastCampaign(data: {
    name: string;
    description?: string;
    sessionId: string;
    templateId?: string;
    customMessage?: {
      type: string;
      content: string;
      caption?: string;
      mediaUrl?: string;
    };
    contactIds?: string[];
    contactFilter?: {
      tags?: string[];
      isValidWhatsApp?: boolean;
      isSubscribed?: boolean;
    };
    scheduledAt?: string;
    recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly';
    delayBetweenMessages?: number;
    variables?: Record<string, string>;
  }) {
    return this.request('/broadcast/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBroadcastCampaignWithMedia(formData: FormData): Promise<ApiResponse> {
    const response = await fetch(`${this.baseURL}/broadcast/campaigns/with-media`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
    });

    const data = await response.json();

    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.createBroadcastCampaignWithMedia(formData);
      }
    }

    return { success: response.ok, data: data.data || data, error: data.message };
  }

  async updateBroadcastCampaign(id: string, data: any) {
    return this.request(`/broadcast/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}`, { method: 'DELETE' });
  }

  async startBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}/start`, { method: 'POST' });
  }

  async pauseBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}/pause`, { method: 'POST' });
  }

  async resumeBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}/resume`, { method: 'POST' });
  }

  async cancelBroadcastCampaign(id: string) {
    return this.request(`/broadcast/campaigns/${id}/cancel`, { method: 'POST' });
  }

  async getBroadcastCampaignStats(id: string) {
    return this.request(`/broadcast/campaigns/${id}/stats`);
  }

  async getBroadcastCampaignMessages(id: string, params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/broadcast/campaigns/${id}/messages${query ? `?${query}` : ''}`);
  }

  // Webhooks
  async getBroadcastWebhooks() {
    return this.request('/broadcast/webhooks');
  }

  async createBroadcastWebhook(data: {
    name: string;
    url: string;
    events: string[];
    secret?: string;
    isActive?: boolean;
  }) {
    return this.request('/broadcast/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBroadcastWebhook(id: string, data: any) {
    return this.request(`/broadcast/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBroadcastWebhook(id: string) {
    return this.request(`/broadcast/webhooks/${id}`, { method: 'DELETE' });
  }

  async testBroadcastWebhook(id: string) {
    return this.request(`/broadcast/webhooks/${id}/test`, { method: 'POST' });
  }

  // API Keys
  async checkApiAccess() {
    return this.request('/broadcast/api-keys/access');
  }

  async getBroadcastApiKeys() {
    return this.request('/broadcast/api-keys');
  }

  async createBroadcastApiKey(data: {
    name: string;
    sessionId: string;
    permissions: string[];
    expiresAt?: string;
    allowedIps?: string[];
    rateLimitPerMinute?: number;
    description?: string;
  }) {
    return this.request('/broadcast/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBroadcastApiKey(id: string, data: any) {
    return this.request(`/broadcast/api-keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBroadcastApiKey(id: string) {
    return this.request(`/broadcast/api-keys/${id}`, { method: 'DELETE' });
  }

  async toggleBroadcastApiKey(id: string, isActive: boolean) {
    return this.request(`/broadcast/api-keys/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ isActive }),
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
    plan?: 'STANDARD' | 'PRO' | 'ENTERPRISE';
    userId?: string;
    billingPeriod?: 'monthly' | 'annually';
    currency?: string; // Currency of the amount (will be converted to XAF by backend)
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
  async verifyPayment(data: {
    ptn?: string;
    transactionId?: string;
    plan?: 'STANDARD' | 'PRO' | 'ENTERPRISE';
    userId?: string;
    organizationId?: string; // Organization ID for subscription upgrade
    amount?: number;
    billingPeriod?: 'monthly' | 'annually';
  }) {
    return this.request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // BILLING & INVOICE ENDPOINTS
  // ============================================

  // Get all invoices for the organization
  async getBillingInvoices() {
    return this.request('/billing/invoices');
  }

  // Get pending/overdue invoices
  async getPendingInvoices() {
    return this.request('/billing/invoices/pending');
  }

  // Get specific invoice details
  async getBillingInvoice(invoiceId: string) {
    return this.request(`/billing/invoices/${invoiceId}`);
  }

  // Mark invoice as paid
  async payInvoice(invoiceId: string, data: {
    paymentMethod: string;
    paymentReference: string;
  }) {
    return this.request(`/billing/invoices/${invoiceId}/pay`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Get billing summary
  async getBillingSummary() {
    return this.request('/billing/summary');
  }

  // Mark multiple invoices as paid
  async payMultipleInvoices(data: {
    invoiceIds: string[];
    paymentMethod: string;
    paymentReference: string;
  }) {
    return this.request('/billing/invoices/pay-multiple', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Manually trigger renewal invoice generation
  async generateRenewalInvoices() {
    return this.request('/billing/generate-renewal-invoices', {
      method: 'POST',
    });
  }

  // ============================================
  // MESSAGE CREDITS ENDPOINTS
  // ============================================

  // Get message credits pricing info
  async getMessageCreditsPricing() {
    return this.request('/message-credits/pricing');
  }

  // Calculate price for given amount of messages
  async calculateMessageCreditsPrice(amount: number) {
    return this.request(`/message-credits/calculate?amount=${amount}`);
  }

  // Get credits summary for organization
  async getMessageCreditsSummary() {
    return this.request('/message-credits/summary');
  }

  // Get purchase history
  async getMessageCreditsHistory(limit: number = 10, offset: number = 0) {
    return this.request(`/message-credits/history?limit=${limit}&offset=${offset}`);
  }

  // Record completed purchase (after payment verification)
  async purchaseMessageCredits(data: {
    amount: number;
    transactionId: string;
    ptn?: string;
    paymentMethod: string;
    phoneNumber?: string;
  }) {
    return this.request('/message-credits/purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Initiate purchase with Mobile Money
  async initiateMessageCreditsPurchase(data: {
    amount: number;
    phoneNumber: string;
    paymentMethod: 'orange_money' | 'mtn_mobile_money';
  }) {
    return this.request('/message-credits/initiate-purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // STRIPE PAYMENT ENDPOINTS
  // ============================================

  async createStripeCheckoutSession(data: {
    plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';
    billingPeriod?: 'monthly' | 'annually';
    successUrl?: string;
    cancelUrl?: string;
  }) {
    return this.request('/payments/stripe/checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createStripePortalSession(returnUrl?: string) {
    return this.request('/payments/stripe/portal-session', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  }

  async createStripeCreditCheckout(data: {
    amount: number;
    successUrl?: string;
    cancelUrl?: string;
  }) {
    return this.request('/payments/stripe/credit-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStripeConfig() {
    return this.request('/payments/stripe/config');
  }

  async renewSubscriptionNow() {
    return this.request('/payments/stripe/renew-now', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);

// Legacy apiHelpers for backward compatibility
export const apiHelpers = {
  agents: {
    getAll: () => api.getAgents(),
    get: (id: string) => api.get(`/agents/${id}`),
    create: (data: any) => api.createAgent(data),
    update: (id: string, data: any) => api.updateAgent(id, data),
    delete: (id: string) => api.deleteAgent(id),
    clone: (id: string, name?: string) => api.cloneAgent(id, name),
    test: (id: string, data: any) => api.testAgent(id, data),
    generateFaq: (id: string, data?: any) => api.generateFaq(id, data),
    getConversations: (id: string, page?: number, limit?: number) => api.getAgentConversations(id, page, limit),
    getPromptHistory: (id: string) => api.getPromptHistory(id),
    rollbackPrompt: (id: string, version: number) => api.rollbackPrompt(id, version),
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
  billing: {
    getInvoices: () => api.getBillingInvoices(),
    getPendingInvoices: () => api.getPendingInvoices(),
    getInvoice: (id: string) => api.getBillingInvoice(id),
    payInvoice: (id: string, data: { paymentMethod: string; paymentReference: string }) => api.payInvoice(id, data),
    getSummary: () => api.getBillingSummary(),
  },
  messageCredits: {
    getPricing: () => api.getMessageCreditsPricing(),
    calculatePrice: (amount: number) => api.calculateMessageCreditsPrice(amount),
    getSummary: () => api.getMessageCreditsSummary(),
    getHistory: (limit?: number, offset?: number) => api.getMessageCreditsHistory(limit, offset),
    purchase: (data: Parameters<typeof api.purchaseMessageCredits>[0]) => api.purchaseMessageCredits(data),
    initiatePurchase: (data: Parameters<typeof api.initiateMessageCreditsPurchase>[0]) => api.initiateMessageCreditsPurchase(data),
  },
  stripe: {
    createCheckoutSession: (data: Parameters<typeof api.createStripeCheckoutSession>[0]) => api.createStripeCheckoutSession(data),
    createPortalSession: (returnUrl?: string) => api.createStripePortalSession(returnUrl),
    createCreditCheckout: (data: Parameters<typeof api.createStripeCreditCheckout>[0]) => api.createStripeCreditCheckout(data),
    getConfig: () => api.getStripeConfig(),
    renewSubscriptionNow: () => api.renewSubscriptionNow(),
  },
};

export default api;
