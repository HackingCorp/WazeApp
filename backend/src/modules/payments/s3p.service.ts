import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createHmac, randomBytes } from 'crypto';
import { firstValueFrom } from 'rxjs';

export interface S3PPaymentRequest {
  amount: number;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  customerAddress?: string;
  serviceNumber: string;
  transactionId: string;
  plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';
}

export interface S3PPaymentResponse {
  success: boolean;
  ptn?: string;
  quoteId?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  message?: string;
  transactionId: string;
}

@Injectable()
export class S3PService {
  private readonly logger = new Logger(S3PService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  // Services configurés pour les abonnements WizeApp
  private readonly services = {
    STANDARD: '20052', // Service ID pour abonnement STANDARD
    PRO: '20053',      // Service ID pour abonnement PRO  
    ENTERPRISE: '20054' // Service ID pour abonnement ENTERPRISE
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('S3P_BASE_URL', 'https://s3p.smobilpay.staging.maviance.info/v2');
    this.apiKey = this.configService.get<string>('S3P_API_KEY', '776c15fb-9e90-43cc-b8ce-85281ea26592');
    this.apiSecret = this.configService.get<string>('S3P_API_SECRET', 'ba625c55-8aa8-4112-af09-339183248c8a');

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('S3P credentials not configured. Mobile Money payments will not be available.');
    }
  }

  /**
   * Génère l'en-tête d'authentification S3P avec signature HMAC-SHA1
   */
  private generateAuthHeader(method: string, url: string, params: any = {}): string {
    const timestamp = Date.now();
    const nonce = Date.now();
    const signatureMethod = 'HMAC-SHA1';

    const s3pParams = {
      s3pAuth_nonce: nonce,
      s3pAuth_timestamp: timestamp,
      s3pAuth_signature_method: signatureMethod,
      s3pAuth_token: this.apiKey,
    };

    const allParams = { ...params, ...s3pParams };
    
    // Trier les paramètres par clé
    const sortedParams = Object.keys(allParams)
      .sort()
      .reduce((result, key) => {
        result[key] = typeof allParams[key] === 'string' ? allParams[key].trim() : allParams[key];
        return result;
      }, {});

    // Créer la chaîne de paramètres
    const parameterString = Object.keys(sortedParams)
      .map(key => `${key}=${sortedParams[key]}`)
      .join('&');

    // Créer la base string pour la signature
    const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(parameterString)}`;

    // Générer la signature HMAC-SHA1
    const signature = createHmac('sha1', this.apiSecret)
      .update(baseString)
      .digest('base64');

    // Construire l'en-tête d'autorisation
    return `s3pAuth s3pAuth_timestamp="${timestamp}", s3pAuth_signature="${signature}", s3pAuth_nonce="${nonce}", s3pAuth_signature_method="${signatureMethod}", s3pAuth_token="${this.apiKey}"`;
  }

  /**
   * Récupère les informations de service pour un plan donné
   */
  async getServiceInfo(plan: string): Promise<any> {
    const serviceId = this.services[plan];
    if (!serviceId) {
      throw new HttpException(`Plan ${plan} not supported`, HttpStatus.BAD_REQUEST);
    }

    const url = `${this.baseUrl}/subscription`;
    const params = { serviceid: serviceId };
    const authHeader = this.generateAuthHeader('GET', url, params);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            Authorization: authHeader,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get service info', error.response?.data);
      throw new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Demande un devis pour un paiement
   */
  async requestQuote(payItemId: string, amount: number): Promise<any> {
    const url = `${this.baseUrl}/quotestd`;
    const body = {
      payItemId,
      amount,
    };

    const authHeader = this.generateAuthHeader('POST', url, body);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to request quote', error.response?.data);
      throw new HttpException('Quote request failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Exécute un paiement Mobile Money
   */
  async executePayment(paymentRequest: S3PPaymentRequest): Promise<S3PPaymentResponse> {
    try {
      // 1. Récupérer les informations du service
      const serviceInfo = await this.getServiceInfo(paymentRequest.plan);
      const payItemId = serviceInfo.payItems[0]?.payItemId;

      if (!payItemId) {
        throw new HttpException('Service not available', HttpStatus.SERVICE_UNAVAILABLE);
      }

      // 2. Demander un devis
      const quote = await this.requestQuote(payItemId, paymentRequest.amount);
      const quoteId = quote.quoteId;

      if (!quoteId) {
        throw new HttpException('Quote generation failed', HttpStatus.BAD_REQUEST);
      }

      // 3. Exécuter le paiement
      const collectData = {
        quoteId,
        customerPhonenumber: paymentRequest.customerPhone,
        customerEmailaddress: paymentRequest.customerEmail,
        customerName: paymentRequest.customerName,
        customerAddress: paymentRequest.customerAddress || 'Cameroun',
        serviceNumber: paymentRequest.serviceNumber,
        trid: paymentRequest.transactionId,
      };

      const collectUrl = `${this.baseUrl}/collectstd`;
      const authHeader = this.generateAuthHeader('POST', collectUrl, collectData);

      const collectResponse = await firstValueFrom(
        this.httpService.post(collectUrl, collectData, {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        }),
      );

      const ptn = collectResponse.data.ptn;

      return {
        success: true,
        ptn,
        quoteId,
        status: 'PENDING',
        transactionId: paymentRequest.transactionId,
        message: 'Payment initiated successfully',
      };

    } catch (error) {
      this.logger.error('Payment execution failed', error);
      return {
        success: false,
        status: 'FAILED',
        transactionId: paymentRequest.transactionId,
        message: error.message || 'Payment failed',
      };
    }
  }

  /**
   * Vérifie le statut d'un paiement
   */
  async verifyPayment(ptn?: string, trid?: string): Promise<any> {
    const url = `${this.baseUrl}/verifytx`;
    const params = ptn ? { ptn } : { trid };
    const authHeader = this.generateAuthHeader('GET', url, params);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            Authorization: authHeader,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Payment verification failed', error.response?.data);
      throw new HttpException('Verification failed', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Test de connectivité avec l'API S3P
   */
  async ping(): Promise<boolean> {
    const url = `${this.baseUrl}/ping`;
    const authHeader = this.generateAuthHeader('GET', url);

    try {
      await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: authHeader,
          },
        }),
      );
      return true;
    } catch (error) {
      this.logger.error('S3P ping failed', error);
      return false;
    }
  }
}