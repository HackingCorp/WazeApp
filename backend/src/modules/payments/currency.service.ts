import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

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
}

@Injectable()
export class CurrencyService {
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

  // Prix de base en USD
  readonly PRICING: Record<string, PricingPlan> = {
    FREE: {
      id: 'FREE',
      name: 'Free',
      priceUSD: 0,
      priceAnnualUSD: 0,
      messages: 100,
      agents: 1,
      storage: '100MB',
    },
    STANDARD: {
      id: 'STANDARD',
      name: 'Standard',
      priceUSD: 29,
      priceAnnualUSD: 278, // ~20% discount
      messages: 2000,
      agents: 1,
      storage: '500MB',
    },
    PRO: {
      id: 'PRO',
      name: 'Pro',
      priceUSD: 69,
      priceAnnualUSD: 662, // ~20% discount
      messages: 8000,
      agents: 3,
      storage: '5GB',
    },
    ENTERPRISE: {
      id: 'ENTERPRISE',
      name: 'Enterprise',
      priceUSD: 199,
      priceAnnualUSD: 1910, // ~20% discount
      messages: 30000,
      agents: 10,
      storage: '20GB',
    },
  };

  // Devises supportées
  readonly SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'XAF', 'XOF', 'NGN', 'GHS', 'KES', 'ZAR', 'MAD', 'TND', 'EGP'];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    // Charger les taux au démarrage
    this.refreshExchangeRates();
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
   */
  async getPlanPrice(
    planId: string,
    currency: string,
    billingPeriod: 'monthly' | 'annually' = 'monthly'
  ): Promise<{ amount: number; currency: string; symbol: string }> {
    const plan = this.PRICING[planId.toUpperCase()];

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    const priceUSD = billingPeriod === 'monthly' ? plan.priceUSD : plan.priceAnnualUSD;
    const convertedAmount = await this.convertFromUSD(priceUSD, currency);

    return {
      amount: convertedAmount,
      currency: currency.toUpperCase(),
      symbol: this.getCurrencySymbol(currency),
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
