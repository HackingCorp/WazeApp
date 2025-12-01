import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export interface EnkapOrderItem {
  id: string;
  product_id?: string;
  name: string;
  particulars?: string;
  quantity: number;
  price: number;
  unit_cost?: number;
  subtotal?: number;
}

export interface EnkapPaymentRequest {
  merchantReference: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  totalAmount: number;
  currency?: string;
  description?: string;
  items: EnkapOrderItem[];
  returnUrl?: string;
  notificationUrl?: string;
  expiryDate?: string;
}

export interface EnkapPaymentResponse {
  success: boolean;
  txid?: string;
  paymentUrl?: string;
  merchantReference?: string;
  uuid?: string;
  expiryDate?: string;
  error?: string;
  details?: any;
  rawResponse?: any;
}

export interface EnkapOrderStatus {
  success: boolean;
  status?: string;
  paymentStatus?: string;
  txid?: string;
  merchantReference?: string;
  totalAmount?: number;
  currency?: string;
  data?: any;
  error?: string;
  notFound?: boolean;
}

export interface EnkapWebhookData {
  txid?: string;
  status?: string;
  paymentStatus?: string;
  merchantReference?: string;
}

export interface EnkapWebhookResult {
  txid: string;
  status: string;
  paymentStatus: string;
  merchantReference: string;
  isPaid: boolean;
  isFailed: boolean;
  webhookData: any;
}

@Injectable()
export class EnkapService {
  private readonly logger = new Logger(EnkapService.name);
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly tokenUrl: string;
  private readonly apiUrl: string;
  private readonly returnUrl: string;
  private readonly notificationUrl: string;
  private readonly currency: string;
  private readonly lang: string;
  private readonly isProduction: boolean;

  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.baseUrl = this.configService.get('ENKAP_BASE_URL', 'https://api-v2.enkap.cm');
    this.apiVersion = '/purchase/v1.2';
    this.consumerKey = this.configService.get('ENKAP_CONSUMER_KEY', 'wXRF_8iU7h9UNiBG4zNYFdCQPwga');
    this.consumerSecret = this.configService.get('ENKAP_CONSUMER_SECRET', 'rD9fRGJkVVs8TZtfjJ0VTD7taOsa');

    // URLs selon l'environnement
    if (this.isProduction) {
      this.tokenUrl = 'https://api-v2.enkap.cm/token';
      this.apiUrl = `${this.baseUrl}${this.apiVersion}`;
    } else {
      this.tokenUrl = 'https://api.enkap-staging.maviance.info/token';
      this.apiUrl = `${this.baseUrl}${this.apiVersion}`;
    }

    this.returnUrl = this.configService.get('ENKAP_RETURN_URL', 'https://wazeapp.xyz/checkout/success');
    this.notificationUrl = this.configService.get('ENKAP_NOTIFICATION_URL', 'https://api.wazeapp.xyz/api/v1/enkap/webhook');
    this.currency = this.configService.get('ENKAP_CURRENCY', 'XAF');
    this.lang = this.configService.get('ENKAP_LANG', 'fr');

    if (!this.consumerKey || !this.consumerSecret) {
      this.logger.warn('E-nkap credentials not configured. Multi-channel payments will not be available.');
    }

    this.logger.log(`E-nkap Service initialized (${this.isProduction ? 'Production' : 'Staging'})`);
  }

  /**
   * Génère un token d'accès OAuth2 pour l'API E-nkap
   */
  async generateAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    const headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    const data = 'grant_type=client_credentials';

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, data, { headers }),
      );

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;

      // Le token expire après 1 heure, on le renouvelle 5 minutes avant
      const expiresIn = tokenData.expires_in || 3600;
      this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;

      this.logger.log('E-nkap access token generated successfully');
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to generate E-nkap token', error.response?.data || error.message);
      throw new HttpException('Failed to generate E-nkap token', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Vérifie si le token est valide et le renouvelle si nécessaire
   */
  async ensureValidToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry) {
      await this.generateAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Formate un numéro de téléphone pour E-nkap (format: 237XXXXXXXXX)
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';

    // Supprimer tous les caractères non numériques
    const cleanPhone = phone.replace(/\D/g, '');

    // Si le numéro commence par 237, le garder
    if (cleanPhone.startsWith('237')) {
      return cleanPhone;
    }

    // Si le numéro est local (9 chiffres commençant par 6 ou 2)
    if (cleanPhone.length === 9 && (cleanPhone[0] === '6' || cleanPhone[0] === '2')) {
      return '237' + cleanPhone;
    }

    // Si le numéro a 8 chiffres, ajouter 237
    if (cleanPhone.length === 8) {
      return '237' + cleanPhone;
    }

    return cleanPhone;
  }

  /**
   * Génère un UUID pour les commandes E-nkap
   */
  private generateUuid(): string {
    const uuid = uuidv4().substring(0, 19);
    const timestamp = Date.now();
    return `${uuid}${timestamp}`;
  }

  /**
   * Crée une commande de paiement E-nkap
   */
  async createPaymentOrder(orderData: EnkapPaymentRequest): Promise<EnkapPaymentResponse> {
    try {
      // S'assurer que le token est valide
      const token = await this.ensureValidToken();

      // Préparer les données de la commande
      const orderUuid = this.generateUuid();

      // Calculer la date d'expiration (24h par défaut)
      const expiryDate =
        orderData.expiryDate ||
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const payload = {
        currency: orderData.currency || this.currency,
        customerName: orderData.customerName,
        description: orderData.description || 'Paiement WazeApp',
        email: orderData.customerEmail || 'pay@wazeapp.xyz',
        expiryDate,
        id: {
          uuid: orderUuid,
          version: 'V1.2',
        },
        items: orderData.items.map((item) => ({
          itemId: item.id || item.product_id?.toString() || '1',
          particulars: item.particulars || item.name || 'Produit',
          quantity: item.quantity,
          subTotal: item.subtotal || item.price * item.quantity,
          unitCost: item.unit_cost || item.price,
        })),
        langKey: this.lang,
        merchantReference: orderData.merchantReference,
        orderDate: new Date().toISOString(),
        phoneNumber: this.formatPhoneNumber(orderData.customerPhone),
        totalAmount: orderData.totalAmount,
        returnUrl: orderData.returnUrl || this.returnUrl,
        notificationUrl: orderData.notificationUrl || this.notificationUrl,
      };

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const orderUrl = `${this.apiUrl}/api/order`;

      this.logger.log(`Creating E-nkap order: ${orderData.merchantReference}`);

      const response = await firstValueFrom(
        this.httpService.post(orderUrl, payload, { headers }),
      );

      const responseData = response.data;

      // Extraire le txid
      const txid =
        responseData.txid ||
        responseData.orderTransactionId ||
        responseData.id ||
        responseData.transactionId;

      this.logger.log(`E-nkap order created successfully - TxID: ${txid}`);

      return {
        success: true,
        txid,
        paymentUrl: responseData.paymentUrl || responseData.redirectUrl,
        merchantReference: orderData.merchantReference,
        uuid: orderUuid,
        expiryDate,
        rawResponse: responseData,
      };
    } catch (error) {
      this.logger.error('E-nkap order creation failed', error.response?.data || error.message);

      if (error.response?.data) {
        const errorData = error.response.data;

        // Gestion des erreurs de token invalide (retry automatique)
        if (errorData.code === '900901' || error.response.status === 401) {
          this.logger.log('Token expired, retrying with new token...');

          // Régénérer le token et réessayer
          this.accessToken = null;
          this.tokenExpiry = null;

          try {
            const newToken = await this.ensureValidToken();
            const headers = {
              Authorization: `Bearer ${newToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            };

            const orderUrl = `${this.apiUrl}/api/order`;
            const orderUuid = this.generateUuid();

            const expiryDate =
              orderData.expiryDate ||
              new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const payload = {
              currency: orderData.currency || this.currency,
              customerName: orderData.customerName,
              description: orderData.description || 'Paiement WazeApp',
              email: orderData.customerEmail || 'pay@wazeapp.xyz',
              expiryDate,
              id: {
                uuid: orderUuid,
                version: 'V1.2',
              },
              items: orderData.items.map((item) => ({
                itemId: item.id || item.product_id?.toString() || '1',
                particulars: item.particulars || item.name || 'Produit',
                quantity: item.quantity,
                subTotal: item.subtotal || item.price * item.quantity,
                unitCost: item.unit_cost || item.price,
              })),
              langKey: this.lang,
              merchantReference: orderData.merchantReference,
              orderDate: new Date().toISOString(),
              phoneNumber: this.formatPhoneNumber(orderData.customerPhone),
              totalAmount: orderData.totalAmount,
              returnUrl: orderData.returnUrl || this.returnUrl,
              notificationUrl: orderData.notificationUrl || this.notificationUrl,
            };

            const retryResponse = await firstValueFrom(
              this.httpService.post(orderUrl, payload, { headers }),
            );

            const retryData = retryResponse.data;
            const txid =
              retryData.txid ||
              retryData.orderTransactionId ||
              retryData.id;

            return {
              success: true,
              txid,
              paymentUrl: retryData.paymentUrl,
              merchantReference: orderData.merchantReference,
              uuid: orderUuid,
              expiryDate,
            };
          } catch (retryError) {
            return {
              success: false,
              error: retryError.message || 'Order creation failed after retry',
            };
          }
        }

        return {
          success: false,
          error: errorData.message || 'Order creation failed',
          details: errorData,
        };
      }

      return {
        success: false,
        error: error.message || 'Order creation failed',
      };
    }
  }

  /**
   * Vérifie le statut d'une commande E-nkap
   */
  async checkOrderStatus(identifier: string, identifierType: 'txid' | 'merchantReference' = 'txid'): Promise<EnkapOrderStatus> {
    try {
      const token = await this.ensureValidToken();

      const params: any = {};
      if (identifierType === 'txid') {
        params.txid = identifier;
      } else {
        params.orderMerchantId = identifier;
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };

      const orderUrl = `${this.apiUrl}/api/order`;

      const response = await firstValueFrom(
        this.httpService.get(orderUrl, { headers, params }),
      );

      const data = response.data;

      return {
        success: true,
        status: data.status,
        paymentStatus: data.paymentStatus,
        txid: data.txid,
        merchantReference: data.merchantReference,
        totalAmount: data.totalAmount,
        currency: data.currency,
        data,
      };
    } catch (error) {
      this.logger.error('E-nkap order status check failed', error.response?.data || error.message);

      // Gestion du retry pour token invalide
      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiry = null;

        try {
          const newToken = await this.ensureValidToken();
          const headers = {
            Authorization: `Bearer ${newToken}`,
            Accept: 'application/json',
          };

          const params: any = {};
          if (identifierType === 'txid') {
            params.txid = identifier;
          } else {
            params.orderMerchantId = identifier;
          }

          const orderUrl = `${this.apiUrl}/api/order`;
          const retryResponse = await firstValueFrom(
            this.httpService.get(orderUrl, { headers, params }),
          );

          const retryData = retryResponse.data;

          return {
            success: true,
            status: retryData.status,
            paymentStatus: retryData.paymentStatus,
            data: retryData,
          };
        } catch (retryError) {
          // Ignore retry error
        }
      }

      return {
        success: false,
        error: 'Order not found or verification failed',
        notFound: error.response?.status === 404,
      };
    }
  }

  /**
   * Traite les notifications webhook de E-nkap
   */
  processWebhook(webhookData: EnkapWebhookData): EnkapWebhookResult {
    const txid = webhookData.txid;
    const status = webhookData.status;
    const paymentStatus = webhookData.paymentStatus;
    const merchantReference = webhookData.merchantReference;

    // Mapper les statuts E-nkap
    const statusMapping: Record<string, string> = {
      COMPLETED: 'COMPLETED',
      PROCESSING: 'PROCESSING',
      PENDING: 'PENDING',
      FAILED: 'FAILED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED',
    };

    const paymentStatusMapping: Record<string, string> = {
      CONFIRMED: 'PAID',
      PAID: 'PAID',
      PENDING: 'PENDING',
      FAILED: 'FAILED',
      REFUNDED: 'REFUNDED',
      PARTIAL: 'PARTIAL',
    };

    const mappedStatus = statusMapping[status] || status;
    const mappedPaymentStatus = paymentStatusMapping[paymentStatus] || paymentStatus;

    return {
      txid,
      status: mappedStatus,
      paymentStatus: mappedPaymentStatus,
      merchantReference,
      isPaid: mappedPaymentStatus === 'PAID',
      isFailed: mappedPaymentStatus === 'FAILED',
      webhookData,
    };
  }

  /**
   * Test de génération de token
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.generateAccessToken();
      return true;
    } catch (error) {
      return false;
    }
  }
}
