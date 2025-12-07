import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { PlanService } from '../subscriptions/plan.service';
import { Plan } from '../../common/entities';

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  lastUpdated: Date;
}

export interface PricingPlan {
  id: string;
  name: string;
  priceUSD: number;
  priceAnnualUSD: number;
  messages: number;
  agents: number;
  storage: string;
  // Broadcast limits
  broadcastContacts: number;
  broadcastTemplates: number;
  broadcastCampaignsPerMonth: number;
  broadcastMessagesPerDay: number;
  hasExternalApi: boolean;
  hasWebhooks: boolean;
  hasScheduling: boolean;
}

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);

  // Cache des taux de change
  private cachedRates: ExchangeRates | null = null;
  private readonly CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 heures

  // Marge appliquée aux conversions (10%)
  private readonly CONVERSION_MARGIN = 0.10;

  // Taux de secours si l'API échoue
  private readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    XAF: 605, // FCFA - Franc CFA
    XOF: 605, // Franc CFA BCEAO
    NGN: 1550, // Naira Nigérian
    GHS: 15.5, // Cedi Ghanéen
    KES: 153, // Shilling Kenyan
    ZAR: 18.5, // Rand Sud-Africain
    MAD: 10, // Dirham Marocain
    TND: 3.1, // Dinar Tunisien
    EGP: 49, // Livre Égyptienne
  };

  // Cache des plans depuis la base de données
  private cachedPricing: Record<string, PricingPlan> = {};

  // Getter pour PRICING - récupère depuis le cache (chargé depuis la DB)
  get PRICING(): Record<string, PricingPlan> {
    // Si le cache est vide, charger les plans de fallback
    if (Object.keys(this.cachedPricing).length === 0) {
      this.loadFallbackPlans();
    }
    return this.cachedPricing;
  }

  /**
   * Assure que les plans sont chargés (utile pour les appels async)
   */
  async ensurePlansLoaded(): Promise<void> {
    if (Object.keys(this.cachedPricing).length === 0) {
      await this.refreshPlansFromDatabase();
    }
  }

  /**
   * Obtient un plan par son ID de façon sécurisée
   */
  getPlan(planId: string): PricingPlan | null {
    const pricing = this.PRICING;
    return pricing[planId.toUpperCase()] || null;
  }

  // Devises supportées
  readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'XAF', 'XOF', 'NGN', 'GHS', 'KES', 'ZAR', 'MAD', 'TND', 'EGP'];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => PlanService))
    private readonly planService: PlanService,
  ) {}

  async onModuleInit() {
    // Charger les taux et les plans au démarrage
    await this.refreshExchangeRates();
    await this.refreshPlansFromDatabase();
  }

  /**
   * Rafraîchit les plans depuis la base de données
   */
  async refreshPlansFromDatabase(): Promise<void> {
    try {
      const plans = await this.planService.getAllPlans();
      this.cachedPricing = {};

      for (const plan of plans) {
        this.cachedPricing[plan.code.toUpperCase()] = this.convertPlanToPricingPlan(plan);
      }

      this.logger.log(`Plans loaded from database: ${Object.keys(this.cachedPricing).length} plans`);
    } catch (error) {
      this.logger.error(`Failed to load plans from database: ${error.message}`);
      // Utiliser des valeurs par défaut si la DB n'est pas accessible
      this.loadFallbackPlans();
    }
  }

  /**
   * Convertit une entité Plan en PricingPlan
   */
  private convertPlanToPricingPlan(plan: Plan): PricingPlan {
    return {
      id: plan.code.toUpperCase(),
      name: plan.name,
      priceUSD: plan.priceMonthlyUSD,
      priceAnnualUSD: plan.priceAnnualUSD,
      messages: plan.maxWhatsAppMessages,
      agents: plan.maxAgents,
      storage: this.formatStorageSize(plan.maxStorageBytes),
      // Broadcast limits
      broadcastContacts: plan.maxBroadcastContacts,
      broadcastTemplates: plan.maxMessageTemplates,
      broadcastCampaignsPerMonth: plan.maxCampaignsPerMonth,
      broadcastMessagesPerDay: plan.maxMessagesPerCampaign,
      hasExternalApi: plan.featureApiAccess,
      hasWebhooks: plan.featureWebhooks,
      hasScheduling: plan.featureScheduledCampaigns,
    };
  }

  /**
   * Formate la taille de stockage en chaîne lisible
   */
  private formatStorageSize(bytes: number): string {
    if (bytes < 0) return 'Unlimited';
    if (bytes >= 1073741824) return `${Math.round(bytes / 1073741824)}GB`;
    if (bytes >= 1048576) return `${Math.round(bytes / 1048576)}MB`;
    return `${bytes}B`;
  }

  /**
   * Charge des plans par défaut si la DB n'est pas accessible
   */
  private loadFallbackPlans(): void {
    this.cachedPricing = {
      FREE: {
        id: 'FREE',
        name: 'Free',
        priceUSD: 0,
        priceAnnualUSD: 0,
        messages: 100,
        agents: 1,
        storage: '100MB',
        broadcastContacts: 50,
        broadcastTemplates: 3,
        broadcastCampaignsPerMonth: 5,
        broadcastMessagesPerDay: 50,
        hasExternalApi: false,
        hasWebhooks: false,
        hasScheduling: false,
      },
      STANDARD: {
        id: 'STANDARD',
        name: 'Standard',
        priceUSD: 2,
        priceAnnualUSD: 20,
        messages: 1000,
        agents: 1,
        storage: '500MB',
        broadcastContacts: 500,
        broadcastTemplates: 10,
        broadcastCampaignsPerMonth: 20,
        broadcastMessagesPerDay: 500,
        hasExternalApi: false,
        hasWebhooks: true,
        hasScheduling: true,
      },
      PRO: {
        id: 'PRO',
        name: 'Pro',
        priceUSD: 3,
        priceAnnualUSD: 30,
        messages: 5000,
        agents: 3,
        storage: '2GB',
        broadcastContacts: 2000,
        broadcastTemplates: 50,
        broadcastCampaignsPerMonth: 100,
        broadcastMessagesPerDay: 2000,
        hasExternalApi: true,
        hasWebhooks: true,
        hasScheduling: true,
      },
      ENTERPRISE: {
        id: 'ENTERPRISE',
        name: 'Enterprise',
        priceUSD: 4,
        priceAnnualUSD: 40,
        messages: -1,
        agents: 10,
        storage: '10GB',
        broadcastContacts: -1,
        broadcastTemplates: -1,
        broadcastCampaignsPerMonth: -1,
        broadcastMessagesPerDay: -1,
        hasExternalApi: true,
        hasWebhooks: true,
        hasScheduling: true,
      },
    };
    this.logger.warn('Using fallback pricing plans');
  }

  /**
   * Rafraîchit les taux de change toutes les 6 heures
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshExchangeRates(): Promise<void> {
    try {
      await this.fetchExchangeRates();
      this.logger.log('Exchange rates refreshed successfully');
    } catch (error) {
      this.logger.error(`Failed to refresh exchange rates: ${error.message}`);
    }
  }

  /**
   * Récupère les taux de change depuis l'API
   */
  private async fetchExchangeRates(): Promise<ExchangeRates> {
    // Essayer ExchangeRate-API (gratuit, 1500 req/mois)
    const apiKey = this.configService.get<string>('EXCHANGE_RATE_API_KEY');

    try {
      let rates: Record<string, number>;

      if (apiKey) {
        // Utiliser ExchangeRate-API avec clé
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
        const response = await firstValueFrom(this.httpService.get(url));
        rates = response.data.conversion_rates;
      } else {
        // Utiliser l'API gratuite sans clé (open.er-api.com)
        const url = 'https://open.er-api.com/v6/latest/USD';
        const response = await firstValueFrom(this.httpService.get(url));
        rates = response.data.rates;
      }

      this.cachedRates = {
        base: 'USD',
        rates,
        lastUpdated: new Date(),
      };

      this.logger.log(`Exchange rates updated: ${Object.keys(rates).length} currencies`);
      return this.cachedRates;

    } catch (error) {
      this.logger.error(`Exchange rate API error: ${error.message}`);

      // Utiliser les taux de secours
      if (!this.cachedRates) {
        this.cachedRates = {
          base: 'USD',
          rates: this.FALLBACK_RATES,
          lastUpdated: new Date(),
        };
      }

      return this.cachedRates;
    }
  }

  /**
   * Obtient le taux de change actuel pour une devise
   */
  async getExchangeRate(currency: string): Promise<number> {
    const upperCurrency = currency.toUpperCase();

    // Vérifier si le cache est valide
    if (!this.cachedRates ||
        Date.now() - this.cachedRates.lastUpdated.getTime() > this.CACHE_DURATION_MS) {
      await this.fetchExchangeRates();
    }

    const rate = this.cachedRates?.rates[upperCurrency] || this.FALLBACK_RATES[upperCurrency];

    if (!rate) {
      this.logger.warn(`Currency ${currency} not supported, defaulting to USD`);
      return 1;
    }

    return rate;
  }

  /**
   * Convertit un montant USD vers une autre devise avec marge de 10%
   */
  async convertFromUSD(amountUSD: number, targetCurrency: string): Promise<number> {
    const upperCurrency = targetCurrency.toUpperCase();

    if (upperCurrency === 'USD') {
      return amountUSD;
    }

    const rate = await this.getExchangeRate(upperCurrency);

    // Appliquer la marge de 10%
    const rateWithMargin = rate * (1 + this.CONVERSION_MARGIN);

    // Arrondir selon la devise
    const converted = amountUSD * rateWithMargin;

    // Pour les devises africaines (XAF, XOF, NGN), arrondir à l'entier
    if (['XAF', 'XOF', 'NGN', 'KES', 'GHS', 'EGP'].includes(upperCurrency)) {
      return Math.ceil(converted / 100) * 100; // Arrondir au centième supérieur
    }

    // Pour les autres devises, arrondir à 2 décimales
    return Math.round(converted * 100) / 100;
  }

  /**
   * Obtient le prix d'un plan dans une devise donnée
   * Pour le billing annuel, retourne le prix MENSUEL équivalent (avec réduction ~17%)
   */
  async getPlanPrice(
    planId: string,
    currency: string,
    billingPeriod: 'monthly' | 'annually' = 'monthly'
  ): Promise<{ amount: number; currency: string; symbol: string; yearlyTotal?: number }> {
    const plan = this.PRICING[planId.toUpperCase()];

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    let monthlyPrice: number;
    let yearlyTotal: number | undefined;

    if (billingPeriod === 'annually') {
      // Pour l'annuel: retourner le prix mensuel équivalent (avec réduction)
      // priceAnnualUSD est le total annuel, on divise par 12 pour le mensuel
      monthlyPrice = plan.priceAnnualUSD / 12;
      yearlyTotal = await this.convertFromUSD(plan.priceAnnualUSD, currency);
    } else {
      // Pour le mensuel: retourner le prix mensuel normal
      monthlyPrice = plan.priceUSD;
    }

    const convertedAmount = await this.convertFromUSD(monthlyPrice, currency);

    return {
      amount: convertedAmount,
      currency: currency.toUpperCase(),
      symbol: this.getCurrencySymbol(currency),
      yearlyTotal,
    };
  }

  /**
   * Obtient tous les prix pour toutes les devises supportées
   */
  async getAllPricing(billingPeriod: 'monthly' | 'annually' = 'monthly'): Promise<any> {
    const pricing: Record<string, Record<string, any>> = {};

    for (const [planId, plan] of Object.entries(this.PRICING)) {
      pricing[planId] = {
        ...plan,
        prices: {},
      };

      for (const currency of this.SUPPORTED_CURRENCIES) {
        const price = await this.getPlanPrice(planId, currency, billingPeriod);
        pricing[planId].prices[currency] = price;
      }
    }

    return {
      billingPeriod,
      lastUpdated: this.cachedRates?.lastUpdated || new Date(),
      plans: pricing,
    };
  }

  /**
   * Obtient le symbole d'une devise
   */
  getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      XAF: 'FCFA',
      XOF: 'FCFA',
      NGN: '₦',
      GHS: 'GH₵',
      KES: 'KSh',
      ZAR: 'R',
      MAD: 'DH',
      TND: 'DT',
      EGP: 'E£',
    };

    return symbols[currency.toUpperCase()] || currency;
  }

  /**
   * Obtient les informations de devise
   */
  getCurrencyInfo(currency: string): { code: string; symbol: string; name: string } {
    const info: Record<string, { name: string; symbol: string }> = {
      USD: { name: 'US Dollar', symbol: '$' },
      EUR: { name: 'Euro', symbol: '€' },
      GBP: { name: 'British Pound', symbol: '£' },
      XAF: { name: 'CFA Franc BEAC', symbol: 'FCFA' },
      XOF: { name: 'CFA Franc BCEAO', symbol: 'FCFA' },
      NGN: { name: 'Nigerian Naira', symbol: '₦' },
      GHS: { name: 'Ghanaian Cedi', symbol: 'GH₵' },
      KES: { name: 'Kenyan Shilling', symbol: 'KSh' },
      ZAR: { name: 'South African Rand', symbol: 'R' },
      MAD: { name: 'Moroccan Dirham', symbol: 'DH' },
      TND: { name: 'Tunisian Dinar', symbol: 'DT' },
      EGP: { name: 'Egyptian Pound', symbol: 'E£' },
    };

    const currencyInfo = info[currency.toUpperCase()];

    return {
      code: currency.toUpperCase(),
      symbol: currencyInfo?.symbol || currency,
      name: currencyInfo?.name || currency,
    };
  }

  /**
   * Liste toutes les devises supportées
   */
  getSupportedCurrencies(): Array<{ code: string; symbol: string; name: string }> {
    return this.SUPPORTED_CURRENCIES.map(code => this.getCurrencyInfo(code));
  }

  /**
   * Obtient les taux de change actuels
   */
  async getCurrentRates(): Promise<ExchangeRates> {
    if (!this.cachedRates ||
        Date.now() - this.cachedRates.lastUpdated.getTime() > this.CACHE_DURATION_MS) {
      await this.fetchExchangeRates();
    }

    return this.cachedRates!;
  }
}
