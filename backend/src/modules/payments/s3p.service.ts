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
    // Production S3P Configuration
    this.baseUrl = this.configService.get<string>('S3P_BASE_URL', 'https://s3pv2cm.smobilpay.com/v2');
    this.apiKey = this.configService.get<string>('S3P_API_KEY', '9183eee1-bf8b-49cb-bffc-d466706d3aef');
    this.apiSecret = this.configService.get<string>('S3P_API_SECRET', 'c5821829-a9db-4cf1-9894-65e3caffaa62');

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('S3P credentials not configured. Mobile Money payments will not be available.');
    }

    this.logger.log(`S3P Service initialized - URL: ${this.baseUrl}`);
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

  /**
   * Alias pour verifyPayment - utilisé par le controller
   */
  async verifyTransaction(transactionRef: string): Promise<any> {
    // Déterminer si c'est un PTN ou un TRID
    if (transactionRef.startsWith('99999')) {
      return this.verifyPayment(transactionRef, undefined);
    } else {
      return this.verifyPayment(undefined, transactionRef);
    }
  }

  /**
   * Formate un numéro de téléphone pour S3P (sans le code pays +237)
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return phone;

    // Nettoyer le numéro
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Supprimer le préfixe +237 ou 237
    if (cleaned.startsWith('+237')) {
      cleaned = cleaned.substring(4);
    } else if (cleaned.startsWith('237')) {
      cleaned = cleaned.substring(3);
    }

    return cleaned;
  }

  /**
   * Processus complet de paiement (nouvelle méthode)
   */
  async processPayment(paymentData: {
    amount: number;
    customerPhone: string;
    paymentType: 'orange' | 'mtn';
    customerName?: string;
    description?: string;
  }): Promise<any> {
    const { amount, customerPhone, paymentType, customerName, description } = paymentData;

    // Déterminer le Service ID selon le type de paiement (Production par défaut)
    // Production Service IDs: Orange = 30056, MTN = 20056
    // Staging Service IDs: Orange = 30053, MTN = 20053
    const useStaging = this.configService.get('S3P_USE_STAGING') === 'true';
    let serviceId: string;

    if (useStaging) {
      serviceId = paymentType.toLowerCase() === 'orange' ? '30053' : '20053';
      this.logger.warn('Using S3P STAGING environment');
    } else {
      serviceId = paymentType.toLowerCase() === 'orange' ? '30056' : '20056';
    }

    this.logger.log(`S3P Service ID: ${serviceId} for ${paymentType}`);

    // Formater le numéro du client
    const formattedPhone = this.formatPhoneNumber(customerPhone);

    // Générer un TRID unique
    const trid = `WAZEAPP-${Date.now()}`;

    this.logger.log(`=== S3P PAYMENT DEBUG ===`);
    this.logger.log(`Original customerPhone: ${customerPhone}`);
    this.logger.log(`Formatted serviceNumber: ${formattedPhone}`);
    this.logger.log(`Payment type: ${paymentType}`);
    this.logger.log(`Amount: ${amount} XAF`);
    this.logger.log(`TRID: ${trid}`);

    try {
      this.logger.log(`Initiation paiement S3P: ${trid} - ${amount} XAF - ${paymentType}`);

      // ÉTAPE 1: Récupérer les informations du service
      const url = `${this.baseUrl}/cashout`;
      const params = { serviceid: serviceId };
      const authHeader = this.generateAuthHeader('GET', url, params);

      const serviceResponse = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            Authorization: authHeader,
          },
        }),
      );

      let payItemId: string;
      const services = serviceResponse.data;

      if (Array.isArray(services)) {
        const service = services.find((s) => s.serviceid === serviceId);
        if (!service) {
          throw new Error(`Service ${serviceId} non trouvé`);
        }
        payItemId = service.payItemId;
      } else if (services.payItemId) {
        payItemId = services.payItemId;
      } else {
        throw new Error('Format de réponse inattendu');
      }

      this.logger.log(`PayItemId récupéré: ${payItemId}`);

      // ÉTAPE 2: Demander un devis
      const quote = await this.requestQuote(payItemId, amount);
      const quoteId = quote.quoteId;

      this.logger.log(`Quote généré: ${quoteId}`);

      // ÉTAPE 3: Exécuter le paiement
      const collectData = {
        quoteId,
        customerPhonenumber: this.configService.get('S3P_NOTIFICATION_PHONE', '237691371922'),
        customerEmailaddress: this.configService.get('S3P_NOTIFICATION_EMAIL', 'lontsi05@gmail.com'),
        customerName: customerName || 'Client WazeApp',
        customerAddress: 'Cameroon',
        serviceNumber: formattedPhone,
        trid,
      };

      this.logger.log(`=== S3P COLLECT DATA ===`);
      this.logger.log(`serviceNumber (customer to debit): ${collectData.serviceNumber}`);
      this.logger.log(`customerPhonenumber (notification): ${collectData.customerPhonenumber}`);
      this.logger.log(`quoteId: ${collectData.quoteId}`);
      this.logger.log(`Full collectData: ${JSON.stringify(collectData, null, 2)}`);

      const collectUrl = `${this.baseUrl}/collectstd`;
      const collectAuthHeader = this.generateAuthHeader('POST', collectUrl, collectData);

      const collectResponse = await firstValueFrom(
        this.httpService.post(collectUrl, collectData, {
          headers: {
            Authorization: collectAuthHeader,
            'Content-Type': 'application/json',
          },
        }),
      );

      const ptn = collectResponse.data.ptn;

      this.logger.log(`Paiement initié - PTN: ${ptn}`);
      this.logger.log(`S3P Collect Response: ${JSON.stringify(collectResponse.data, null, 2)}`);

      // ÉTAPE 4: Vérification après délai
      await new Promise((resolve) => setTimeout(resolve, 15000)); // Attendre 15 secondes

      const verifyResponse = await this.verifyPayment(ptn, trid);

      const s3pStatus = verifyResponse.status || 'PENDING';
      const finalStatus = s3pStatus === 'SUCCESS' ? 'SUCCESS' : s3pStatus === 'PENDING' ? 'PENDING' : 'FAILED';

      this.logger.log(`Statut final: ${finalStatus} (S3P: ${s3pStatus})`);

      return {
        success: true,
        transactionId: trid,
        ptn,
        status: finalStatus,
        s3pStatus,
        message: finalStatus === 'PENDING' ? 'Paiement initié avec succès' : 'Paiement confirmé',
        verificationData: verifyResponse,
        // Debug info
        debug: {
          originalPhone: customerPhone,
          formattedServiceNumber: formattedPhone,
          serviceId,
          paymentType,
          amount,
        },
      };
    } catch (error) {
      this.logger.error(`Erreur paiement S3P: ${error.message}`, error.stack);

      return {
        success: false,
        error: error.message,
        transactionId: trid,
      };
    }
  }
}