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

// Mapping des codes d'erreur S3P vers des messages utilisateur
const S3P_ERROR_CODES: Record<number, { userMessage: string; technicalMessage: string }> = {
  // Erreurs de transaction operateur (41xxx)
  41001: { userMessage: 'Le numero de telephone est invalide ou non enregistre Mobile Money', technicalMessage: 'INVALID_PHONE_NUMBER' },
  41002: { userMessage: 'Le compte Mobile Money est bloque ou suspendu', technicalMessage: 'ACCOUNT_BLOCKED' },
  41003: { userMessage: 'Le montant depasse la limite autorisee', technicalMessage: 'AMOUNT_LIMIT_EXCEEDED' },
  41004: { userMessage: 'Transaction rejetee - verifiez que votre compte Mobile Money est actif et que vous avez confirme avec votre code PIN', technicalMessage: 'TRANSACTION_REJECTED' },
  41005: { userMessage: 'Transaction annulee par l\'utilisateur', technicalMessage: 'USER_CANCELLED' },
  41006: { userMessage: 'Transaction expiree - vous n\'avez pas confirme a temps', technicalMessage: 'TRANSACTION_EXPIRED' },
  41007: { userMessage: 'Code PIN incorrect', technicalMessage: 'INVALID_PIN' },
  41008: { userMessage: 'Solde insuffisant sur votre compte Mobile Money', technicalMessage: 'INSUFFICIENT_BALANCE' },
  41009: { userMessage: 'Limite journaliere atteinte sur votre compte', technicalMessage: 'DAILY_LIMIT_EXCEEDED' },
  41010: { userMessage: 'Le numero n\'a pas de compte Mobile Money actif', technicalMessage: 'NO_MOBILE_MONEY_ACCOUNT' },
  // Erreurs de service (50xxx)
  50001: { userMessage: 'Le service de paiement est temporairement indisponible', technicalMessage: 'SERVICE_UNAVAILABLE' },
  50002: { userMessage: 'Le service de paiement est en maintenance', technicalMessage: 'SERVICE_MAINTENANCE' },
  // Erreurs d'authentification (40xxx)
  40001: { userMessage: 'Erreur de configuration du paiement', technicalMessage: 'AUTH_FAILED' },
  40010: { userMessage: 'Le numero de telephone fourni est invalide', technicalMessage: 'INVALID_PHONE_FORMAT' },
};

@Injectable()
export class S3PService {
  private readonly logger = new Logger(S3PService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  // Services configurés pour les abonnements WazeApp
  private readonly services = {
    STANDARD: '20052', // Service ID pour abonnement STANDARD
    PRO: '20053',      // Service ID pour abonnement PRO
    ENTERPRISE: '20054' // Service ID pour abonnement ENTERPRISE
  };

  /**
   * Mappe un code d'erreur S3P vers un message utilisateur
   */
  private mapErrorCode(errorCode: number): { userMessage: string; technicalMessage: string } {
    return S3P_ERROR_CODES[errorCode] || {
      userMessage: 'Une erreur est survenue lors du paiement',
      technicalMessage: `S3P_ERROR_${errorCode}`
    };
  }

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
   * Selon la doc S3P, le PTN commence par 99999 et le statut peut être dans différents champs
   * IMPORTANT: On utilise TRID en priorité car c'est notre référence de transaction
   * et S3P peut mettre à jour ce statut plus rapidement que le PTN
   */
  async verifyPayment(ptn?: string, trid?: string): Promise<any> {
    const url = `${this.baseUrl}/verifytx`;

    // Priorité: TRID d'abord (notre référence), puis PTN (référence S3P)
    // Le TRID est plus fiable car c'est notre identifiant de transaction
    let params: any = {};
    if (trid) {
      params = { trid };
    } else if (ptn) {
      // Nettoyer le PTN (enlever les underscores ou suffixes)
      const cleanPtn = ptn.split('_')[0];
      params = { ptn: cleanPtn };
    }

    const authHeader = this.generateAuthHeader('GET', url, params);

    this.logger.log(`S3P verifyPayment request: ${JSON.stringify(params)}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params,
          headers: {
            Authorization: authHeader,
          },
        }),
      );

      const rawData = response.data;
      this.logger.log(`S3P verifyPayment RAW response: ${JSON.stringify(rawData)}`);

      // S3P retourne souvent un tableau - extraire le premier élément
      let data = rawData;
      if (Array.isArray(rawData) && rawData.length > 0) {
        data = rawData[0];
      }

      // Normalize the status - S3P peut retourner le statut dans différents champs
      let status = data.status;

      // Vérifier tous les champs possibles selon la documentation S3P
      if (!status) status = data.transactionStatus;
      if (!status) status = data.txStatus;
      if (!status) status = data.paymentStatus;
      if (!status) status = data.data?.status;
      if (!status) status = data.result?.status;

      // Extraire le errorCode
      const errorCode = data.errorCode;

      // Normalize status values selon la documentation
      if (status) {
        const upperStatus = String(status).toUpperCase();
        // Mapper vers SUCCESS
        if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'PAID'].includes(upperStatus)) {
          status = 'SUCCESS';
        }
        // Mapper vers PENDING
        else if (['PENDING', 'PROCESSING', 'INITIATED', 'WAITING'].includes(upperStatus)) {
          status = 'PENDING';
        }
        // Mapper vers FAILED
        else if (['FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'ERROR'].includes(upperStatus)) {
          status = 'FAILED';
        }
        else {
          status = upperStatus;
        }
      } else {
        // Si pas de status trouvé, considérer comme PENDING
        status = 'PENDING';
      }

      this.logger.log(`S3P verifyPayment NORMALIZED status: ${status}, errorCode: ${errorCode || 'none'}`);

      return {
        ...data,
        status,
        errorCode,
        ptn: data.ptn || ptn,
        originalStatus: rawData.status || rawData.transactionStatus || 'unknown',
      };
    } catch (error) {
      this.logger.error(`S3P Payment verification failed: ${error.message}`, error.response?.data);
      // En cas d'erreur, retourner PENDING plutôt que de throw
      return {
        status: 'PENDING',
        error: error.message,
        ptn: ptn,
      };
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
    // PTN commence par 99999, TRID est notre référence (WAZEAPP-xxx)
    if (transactionRef.startsWith('99999')) {
      // C'est un PTN - on passe quand même comme TRID car verifyPayment priorise TRID
      return this.verifyPayment(transactionRef, undefined);
    } else {
      // C'est un TRID - utiliser comme TRID (prioritaire)
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
      // Selon la doc S3P: /cashout = collecter de l'argent du client
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

      this.logger.log(`S3P /cashin response: ${JSON.stringify(services)}`);

      if (Array.isArray(services)) {
        // Chercher le service par serviceid (peut être string ou number)
        const service = services.find((s) =>
          String(s.serviceid) === String(serviceId) ||
          String(s.serviceId) === String(serviceId) ||
          String(s.id) === String(serviceId)
        );
        if (!service) {
          // Log tous les services disponibles pour debug
          this.logger.warn(`Service ${serviceId} non trouvé. Services disponibles: ${JSON.stringify(services.map(s => ({ id: s.id, serviceid: s.serviceid, serviceId: s.serviceId, name: s.name || s.serviceName })))}`);
          throw new Error(`Service ${serviceId} non trouvé dans la liste des services cashout`);
        }
        payItemId = service.payItemId || service.payitemid || service.pay_item_id;
      } else if (services.payItemId) {
        payItemId = services.payItemId;
      } else if (services.payitemid) {
        payItemId = services.payitemid;
      } else {
        this.logger.warn(`Format de réponse inattendu: ${JSON.stringify(services)}`);
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

      // Extraire le errorCode et status de la réponse S3P (déjà normalisée par verifyPayment)
      const errorCode = verifyResponse.errorCode;
      const s3pStatus = verifyResponse.status || 'PENDING';

      // Déterminer le statut final
      let finalStatus = 'PENDING';
      let errorMessage: string | undefined;

      if (s3pStatus === 'SUCCESS' || s3pStatus === 'SUCCESSFUL') {
        finalStatus = 'SUCCESS';
      } else if (s3pStatus === 'ERRORED' || s3pStatus === 'FAILED') {
        finalStatus = 'FAILED';
        // Mapper le code d'erreur vers un message utilisateur
        if (errorCode) {
          const errorInfo = this.mapErrorCode(errorCode);
          errorMessage = errorInfo.userMessage;
          this.logger.warn(`S3P Error ${errorCode}: ${errorInfo.technicalMessage}`);
        }
      }

      this.logger.log(`Statut final: ${finalStatus} (S3P: ${s3pStatus}, errorCode: ${errorCode || 'none'})`);

      // Si le paiement a échoué, retourner avec l'erreur
      if (finalStatus === 'FAILED') {
        return {
          success: false,
          transactionId: trid,
          ptn,
          status: finalStatus,
          s3pStatus,
          errorCode,
          message: errorMessage || 'Le paiement a echoue',
          error: errorMessage || 'Le paiement a echoue',
        };
      }

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