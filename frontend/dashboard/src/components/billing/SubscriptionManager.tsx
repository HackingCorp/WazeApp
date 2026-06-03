'use client';

import React, { useState, useEffect } from 'react';
import { Check, Zap, Shield, Crown, Star, CreditCard, ArrowRight, AlertTriangle, Sparkles, Smartphone, Globe, ChevronDown, ExternalLink, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import dynamic from 'next/dynamic';

const PaymentModal = dynamic(() => import('./PaymentModal').then(mod => mod.PaymentModal), { ssr: false });
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  interval: 'month' | 'year';
  description: string;
  icon: React.ComponentType<any>;
  features: string[];
  limits: {
    maxAgents: number;
    maxRequests: number;
    maxStorage: string;
  };
  popular?: boolean;
  gradient?: string;
  iconBg?: string;
}

interface SubscriptionManagerProps {
  currentPlan?: string;
  billingCycle?: 'monthly' | 'annual';
  subscriptionStatus?: string;
  trialEndsAt?: string;
  nextBillingDate?: string;
  onPlanChange?: (planId: string) => void;
  onBillingCycleChange?: (cycle: 'monthly' | 'annual') => void;
  isLoading?: boolean;
}

// Fallback exchange rates (used only if API fails completely)
const FALLBACK_RATES: { [key: string]: number } = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  XAF: 605,
  XOF: 605,
  NGN: 1550,
};

interface ExchangeRateData {
  rate: number;
  rateWithMargin: number;
  symbol: string;
}

// Trial days per plan
const TRIAL_DAYS: Record<string, number> = {
  standard: 7,
  pro: 14,
  enterprise: 14,
};

// Plans structure - prices are fetched dynamically from the API
const getPlans = (t: (key: string) => string): Plan[] => [
  {
    id: 'standard',
    name: 'Standard',
    interval: 'month',
    description: t('billing.planStandardDesc'),
    icon: Shield,
    gradient: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    features: [
      t('billing.feat1Agent'),
      t('billing.featAdvancedAnalytics'),
      t('billing.featPrioritySupport'),
      t('billing.featCustomTemplates'),
      t('billing.featBasicAutomation'),
      t('billing.featFileSharing'),
      t('billing.feat500Broadcast'),
      t('billing.feat10Templates'),
      t('billing.featScheduledCampaigns'),
    ],
    limits: {
      maxAgents: 1,
      maxRequests: 2000,
      maxStorage: '500MB',
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    interval: 'month',
    description: t('billing.planProDesc'),
    icon: Crown,
    gradient: 'from-emerald-500 to-green-600',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    popular: true,
    features: [
      t('billing.feat3Agents'),
      t('billing.featAdvancedAnalyticsReports'),
      t('billing.feat247Support'),
      t('billing.featAdvancedAutomation'),
      t('billing.featTeamCollab'),
      t('billing.featApiAccess'),
      t('billing.feat2000Broadcast'),
      t('billing.feat50Templates'),
      t('billing.featRecurringCampaigns'),
      t('billing.featWebhooksIntegration'),
    ],
    limits: {
      maxAgents: 3,
      maxRequests: 8000,
      maxStorage: '2GB',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    interval: 'month',
    description: t('billing.planEnterpriseDesc'),
    icon: Star,
    gradient: 'from-purple-500 to-indigo-600',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    features: [
      t('billing.feat10Agents'),
      t('billing.featCustomAnalytics'),
      t('billing.featDedicatedManager'),
      t('billing.featWhiteLabel'),
      t('billing.featAdvancedSecurity'),
      t('billing.featCustomIntegrations'),
      t('billing.featSla'),
      t('billing.featOnPremise'),
      t('billing.featUnlimitedBroadcast'),
      t('billing.featUnlimitedTemplates'),
      t('billing.featExternalApi'),
      t('billing.featPriorityWebhooks'),
    ],
    limits: {
      maxAgents: 10,
      maxRequests: -1,
      maxStorage: '10GB',
    },
  },
];

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface DynamicPricing {
  [planId: string]: {
    price: number;
    symbol: string;
    currency: string;
    priceFormatted: string;
    yearlyTotal?: number; // Total annual price when billing is annual
  };
}

export function SubscriptionManager({
  currentPlan = 'free',
  billingCycle = 'monthly',
  subscriptionStatus,
  trialEndsAt,
  nextBillingDate,
  onPlanChange,
  onBillingCycleChange,
  isLoading = false,
}: SubscriptionManagerProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  const plans = getPlans(t);
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [selectedCycle, setSelectedCycle] = useState(billingCycle);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [planToPurchase, setPlanToPurchase] = useState<Plan | null>(null);
  const [stripePortalLoading, setStripePortalLoading] = useState(false);

  // Currency state
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState<Currency[]>([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'XAF', name: 'CFA Franc', symbol: 'FCFA ' },
  ]);
  const [dynamicPricing, setDynamicPricing] = useState<DynamicPricing>({});
  const [pricingLoading, setPricingLoading] = useState(true); // Start with loading
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Official exchange rates from backend
  const [officialRates, setOfficialRates] = useState<{ [key: string]: ExchangeRateData }>({});
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null);

  const currentPlanData = plans.find(p => p.id === currentPlan);
  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  // Set mounted to true after hydration to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch available currencies and exchange rates on mount
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await api.getCurrencies() as any;
        if (response.success && response.currencies) {
          setCurrencies(response.currencies);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching currencies:', error);
        }
      }
    };

    const fetchExchangeRates = async () => {
      try {
        const response = await api.getExchangeRates() as any;
        if (response.success && response.rates) {
          setOfficialRates(response.rates);
          if (response.lastUpdated) {
            setRatesLastUpdated(new Date(response.lastUpdated));
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching exchange rates:', error);
        }
      }
    };

    fetchCurrencies();
    fetchExchangeRates();
  }, []);

  // Fetch pricing when currency or billing cycle changes
  useEffect(() => {
    const fetchPricing = async () => {
      setPricingLoading(true);
      try {
        const billing = selectedCycle === 'annual' ? 'annually' : 'monthly';
        const response = await api.getPricing(selectedCurrency, billing) as any;
        const plans = response.data?.plans || response.plans;
        if (response.success && plans) {
          const pricing: DynamicPricing = {};
          for (const [key, value] of Object.entries(plans)) {
            const plan = value as any;
            pricing[key.toLowerCase()] = {
              price: plan.price,
              symbol: plan.symbol,
              currency: plan.currency,
              priceFormatted: plan.priceFormatted,
              yearlyTotal: plan.yearlyTotal, // Total annual price when billing is annual
            };
          }
          setDynamicPricing(pricing);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching pricing:', error);
        }
      } finally {
        setPricingLoading(false);
      }
    };
    fetchPricing();
  }, [selectedCurrency, selectedCycle]);

  const getDiscountedPrice = (price: number, cycle: 'monthly' | 'annual') => {
    return cycle === 'annual' ? Math.round(price * 0.83) : price;
  };

  const getYearlyTotal = (price: number) => {
    return getDiscountedPrice(price, 'annual') * 12;
  };

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    if (planId !== currentPlan) {
      setShowUpgradeModal(true);
    }
  };

  const handleUpgrade = () => {
    // Close upgrade confirmation modal
    setShowUpgradeModal(false);

    // If upgrading to a paid plan, show Mobile Money payment modal
    if (selectedPlanData && getPlanPrice(selectedPlanData.id).price > 0) {
      setPlanToPurchase(selectedPlanData);
      setShowPaymentModal(true);
    } else {
      // Downgrading to free plan
      onPlanChange?.(selectedPlan);
      onBillingCycleChange?.(selectedCycle);
    }
  };

  const handlePaymentSuccess = () => {
    // Payment successful - update the plan
    onPlanChange?.(selectedPlan);
    onBillingCycleChange?.(selectedCycle);
    setShowPaymentModal(false);
    setPlanToPurchase(null);
    // Wait briefly for webhooks to process, then reload
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  // Redirect to Stripe Customer Portal to manage subscription
  const handleManageStripeSubscription = async () => {
    setStripePortalLoading(true);
    try {
      const response = await api.createStripePortalSession(window.location.href) as any;
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      } else {
        const errorMsg = response.error || 'Impossible de créer la session de gestion';
        // Show error to user instead of silently failing
        if (typeof window !== 'undefined') {
          const { default: toast } = await import('react-hot-toast');
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      if (typeof window !== 'undefined') {
        const { default: toast } = await import('react-hot-toast');
        toast.error('Erreur réseau. Veuillez réessayer.');
      }
    } finally {
      setStripePortalLoading(false);
    }
  };

  // Check if user has a Stripe-managed subscription (flag sent by backend auth)
  const hasStripeSubscription = !!(user as any)?.hasStripeSubscription
    || !!(user as any)?.organization?.subscription?.stripeSubscriptionId
    || !!(user as any)?.subscription?.stripeSubscriptionId;

  // Get the current currency symbol
  const getCurrentCurrencySymbol = () => {
    const currency = currencies.find(c => c.code === selectedCurrency);
    return currency?.symbol || '$';
  };

  // Get price for a plan in the selected currency (from API only)
  const getPlanPrice = (planId: string): { price: number; symbol: string; formatted: string; yearlyTotal?: number } => {
    const symbol = getCurrentCurrencySymbol();

    // Free plan is always 0
    if (planId === 'free') {
      return { price: 0, symbol, formatted: t('billing.free') };
    }

    // Use dynamically fetched pricing from backend
    const pricing = dynamicPricing[planId];
    if (pricing) {
      return {
        price: pricing.price,
        symbol: pricing.symbol,
        formatted: pricing.priceFormatted,
        yearlyTotal: pricing.yearlyTotal,
      };
    }

    // Loading state - return 0 while fetching
    return { price: 0, symbol, formatted: '...' };
  };

  const PlanCard = ({ plan }: { plan: Plan }) => {
    const isCurrentPlan = plan.id === currentPlan;
    const Icon = plan.icon;
    const planPricing = getPlanPrice(plan.id);
    const symbol = planPricing.symbol;

    // Backend now returns monthly equivalent for annual billing (already divided by 12)
    // So we use the price directly without additional division
    const price = planPricing.price;
    // For yearly total: use yearlyTotal from API if available, otherwise calculate
    const yearlyPrice = selectedCycle === 'annual'
      ? (planPricing.yearlyTotal || price * 12)
      : price * 12;
    // Calculate what the monthly price would be without discount (for "Save 17%" display)
    const monthlyOriginal = selectedCycle === 'annual' ? Math.round(price / 0.83) : price;

    return (
      <div
        className={clsx(
          'relative flex flex-col rounded-2xl border transition-all duration-300 overflow-hidden group',
          plan.popular
            ? 'border-emerald-500 dark:border-emerald-400 shadow-xl shadow-emerald-500/10 dark:shadow-emerald-500/5 scale-[1.02] lg:scale-105'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg',
          isCurrentPlan && 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-gray-900'
        )}
      >
        {/* Popular badge */}
        {plan.popular && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-center py-2 text-sm font-semibold flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            {t('billing.mostPopular')}
          </div>
        )}

        {/* Current plan badge */}
        {isCurrentPlan && !plan.popular && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-gray-700 to-gray-800 dark:from-gray-600 dark:to-gray-700 text-white text-center py-2 text-sm font-semibold">
            {t('billing.currentPlanBadge')}
          </div>
        )}

        {isCurrentPlan && plan.popular && (
          <div className="absolute top-9 right-3 z-10">
            <span className="bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold shadow-md">
              {t('billing.current')}
            </span>
          </div>
        )}

        <div className={clsx(
          'p-6 flex-1 flex flex-col',
          (plan.popular || isCurrentPlan) && 'pt-12'
        )}>
          {/* Header */}
          <div className="mb-6">
            <div className={clsx(
              'w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110',
              plan.iconBg
            )}>
              <Icon className={clsx(
                'w-7 h-7',
                plan.popular ? 'text-emerald-600 dark:text-emerald-400' :
                plan.id === 'enterprise' ? 'text-purple-600 dark:text-purple-400' :
                plan.id === 'standard' ? 'text-blue-600 dark:text-blue-400' :
                'text-gray-600 dark:text-gray-400'
              )} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {plan.name}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {plan.description}
            </p>
            {/* Trial badge - only show for users without any plan (free) */}
            {TRIAL_DAYS[plan.id] && !isCurrentPlan && currentPlan === 'free' && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {t('billing.trialBadge').replace('{{days}}', String(TRIAL_DAYS[plan.id]))}
                </span>
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="mb-6">
            {price === 0 ? (
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-gray-900 dark:text-white">{t('billing.free')}</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  {!mounted || pricingLoading ? (
                    <span className="text-3xl font-bold text-gray-400 dark:text-gray-500 animate-pulse">...</span>
                  ) : (
                    <span className={clsx(
                      "font-bold text-gray-900 dark:text-white",
                      price >= 100000 ? "text-2xl" : price >= 10000 ? "text-3xl" : "text-4xl"
                    )} suppressHydrationWarning>
                      {symbol}{price.toLocaleString()}
                    </span>
                  )}
                  <span className="text-gray-500 dark:text-gray-400 text-base">
                    {t('billing.perMonth')}
                  </span>
                </div>
                {selectedCycle === 'annual' && mounted && !pricingLoading && (
                  <div className="mt-2 space-y-1" suppressHydrationWarning>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      <span className="line-through">{symbol}{monthlyOriginal.toLocaleString()}</span>
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                        {t('billing.save17')}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {symbol}{yearlyPrice.toLocaleString()} {t('billing.billedAnnually')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Features */}
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
              {t('billing.whatsIncluded')}
            </h4>
            <ul className="space-y-3">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    plan.popular ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'
                  )}>
                    <Check className={clsx(
                      'w-3 h-3',
                      plan.popular ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'
                    )} />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 text-sm">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Limits */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              {t('billing.usageLimits')}
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxAgents}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('billing.agents')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxRequests === -1
                    ? '∞'
                    : plan.limits.maxRequests >= 1000
                      ? `${plan.limits.maxRequests / 1000}K`
                      : plan.limits.maxRequests}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('billing.reqPerMonth')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxStorage}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('billing.storage')}</p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => handlePlanSelect(plan.id)}
            disabled={isLoading || isCurrentPlan}
            className={clsx(
              'mt-6 w-full py-3.5 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2',
              isCurrentPlan
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : plan.popular
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5'
                : plan.id === 'enterprise'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5'
                : 'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 hover:-translate-y-0.5',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isCurrentPlan ? (
              t('billing.currentPlanBadge')
            ) : (
              <>
                {TRIAL_DAYS[plan.id] && currentPlan === 'free'
                  ? t('billing.startFreeTrial')
                  : t('billing.upgradeTo').replace('{{plan}}', plan.name)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
          {t('billing.pricingTitle')}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          {t('billing.pricingSubtitle')}
        </p>
      </div>

      {/* Billing Toggle & Currency Selector */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-12">
        {/* Billing Toggle */}
        <div className="bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl inline-flex items-center">
          <button
            onClick={() => setSelectedCycle('monthly')}
            className={clsx(
              'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
              selectedCycle === 'monthly'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            {t('billing.monthly')}
          </button>
          <button
            onClick={() => setSelectedCycle('annual')}
            className={clsx(
              'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 relative',
              selectedCycle === 'annual'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            {t('billing.annual')}
            <span className="absolute -top-3 -right-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-lg">
              -17%
            </span>
          </button>
        </div>

        {/* Currency Selector */}
        <div className="relative">
          <button
            onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span>{selectedCurrency}</span>
            <ChevronDown className={clsx(
              'w-4 h-4 transition-transform',
              showCurrencyDropdown && 'rotate-180'
            )} />
          </button>

          {showCurrencyDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCurrencyDropdown(false)}
              />
              <div className="absolute top-full mt-2 right-0 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {currencies.map((currency) => (
                    <button
                      key={currency.code}
                      onClick={() => {
                        setSelectedCurrency(currency.code);
                        setShowCurrencyDropdown(false);
                      }}
                      className={clsx(
                        'w-full px-4 py-3 text-left text-sm transition-colors flex items-center justify-between',
                        selectedCurrency === currency.code
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="font-medium">{currency.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {currency.symbol} ({currency.code})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Legacy Free Plan Banner */}
      {currentPlan === 'free' && (
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {t('billing.legacyFreePrompt')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {t('billing.legacyFreeDesc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trial Status Banner */}
      {subscriptionStatus === 'trialing' && trialEndsAt && (
        <div className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {t('billing.trialActive')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {t('billing.trialExpiresOn')} <strong>{new Date(trialEndsAt).toLocaleDateString()}</strong>
                {' — '}
                {(() => {
                  const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return days > 0
                    ? t('billing.trialDaysRemaining').replace('{{days}}', String(days))
                    : t('billing.trialExpired');
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-4 mb-16">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      {/* Features Comparison */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
          {t('billing.comparePlans')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-4 px-4 text-gray-500 dark:text-gray-400 font-medium">{t('billing.feature')}</th>
                {plans.map(plan => (
                  <th key={plan.id} className={clsx(
                    'text-center py-4 px-4 font-semibold',
                    plan.popular ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'
                  )}>
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.whatsappAgents')}</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxAgents}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.monthlyRequests')}</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxRequests === -1 ? t('billing.unlimited') : plan.limits.maxRequests.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.storage')}</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxStorage}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.analytics')}</td>
                <td className="text-center py-4 px-4 text-gray-900 dark:text-white font-medium">{t('billing.advancedLabel')}</td>
                <td className="text-center py-4 px-4 text-emerald-600 dark:text-emerald-400 font-medium">{t('billing.advancedReports')}</td>
                <td className="text-center py-4 px-4 text-purple-600 dark:text-purple-400 font-medium">{t('billing.customDashboard')}</td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.supportLabel')}</td>
                <td className="text-center py-4 px-4 text-gray-900 dark:text-white font-medium">{t('billing.prioritySupport')}</td>
                <td className="text-center py-4 px-4 text-emerald-600 dark:text-emerald-400 font-medium">{t('billing.priority247')}</td>
                <td className="text-center py-4 px-4 text-purple-600 dark:text-purple-400 font-medium">{t('billing.dedicatedManager')}</td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.apiAccess')}</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-emerald-500 mx-auto" /></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-purple-500 mx-auto" /></td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.whiteLabel')}</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-purple-500 mx-auto" /></td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{t('billing.slaGuarantee')}</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-purple-500 mx-auto" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Current Plan Summary */}
      {currentPlanData && (
        <div className="mt-16 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center shadow-sm">
                <CreditCard className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.yourCurrentPlan')}</p>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {currentPlanData.name} {t('billing.plan')}
                </h3>
                <p className="text-gray-600 dark:text-gray-300" suppressHydrationWarning>
                  {getPlanPrice(currentPlanData.id).price === 0 ? t('billing.freeForever') : `${getPlanPrice(currentPlanData.id).symbol}${getPlanPrice(currentPlanData.id).price.toLocaleString()}${t('billing.perMonth')}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {getPlanPrice(currentPlanData.id).price > 0 && (
                <div className="text-left md:text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.nextBillingDate')}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white" suppressHydrationWarning>
                    {nextBillingDate
                      ? format(new Date(nextBillingDate), 'MMMM dd, yyyy')
                      : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMMM dd, yyyy')}
                  </p>
                </div>
              )}
              {hasStripeSubscription && (
                <button
                  onClick={handleManageStripeSubscription}
                  disabled={stripePortalLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25"
                >
                  {stripePortalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                  {t('billing.manageSubscription')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {t('billing.haveQuestions')}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          {t('billing.contactSalesDesc')}
        </p>
        <button className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
          {t('billing.contactSales')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && selectedPlanData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('billing.confirmPlanChange')}
              </h3>
            </div>

            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {getPlanPrice(selectedPlanData.id).price > getPlanPrice(currentPlanData?.id || 'free').price ? t('billing.aboutToUpgrade') : t('billing.aboutToDowngrade')} <strong className="text-gray-900 dark:text-white">{selectedPlanData.name}</strong>.
              </p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('billing.planLabel')}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedPlanData.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('billing.price')}</span>
                  <span className="font-semibold text-gray-900 dark:text-white" suppressHydrationWarning>
                    {getPlanPrice(selectedPlanData.id).price === 0 ? t('billing.free') : `${getPlanPrice(selectedPlanData.id).symbol}${getPlanPrice(selectedPlanData.id).price.toLocaleString()}${t('billing.perMonth')}`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('billing.currencyLabel')}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedCurrency}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('billing.billingLabel')}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedCycle === 'annual' ? t('billing.annual') : t('billing.monthly')}
                  </span>
                </div>
              </div>

              {getPlanPrice(selectedPlanData.id).price > getPlanPrice(currentPlanData?.id || 'free').price && (
                <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
                    {t('billing.availablePayments')}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-emerald-600 dark:text-emerald-400">
                    {['XAF', 'XOF'].includes(selectedCurrency) && (
                      <div className="flex items-center gap-1">
                        <Smartphone className="w-4 h-4" />
                        <span>MTN / Orange</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <CreditCard className="w-4 h-4" />
                      <span>Visa / MC / Stripe</span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mt-2">
                    {getPlanPrice(selectedPlanData.id).formatted}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 py-3 px-4 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('billing.cancelBtn')}
              </button>
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
              >
                {isLoading ? t('billing.processing') : getPlanPrice(selectedPlanData?.id || 'free').price > 0 ? t('billing.choosePaymentMethod') : t('billing.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal (Mobile Money + Card) */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPlanToPurchase(null);
        }}
        plan={planToPurchase}
        onSuccess={handlePaymentSuccess}
        customerName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ''}
        customerEmail={user?.email || ''}
        dynamicPrice={planToPurchase ? getPlanPrice(planToPurchase.id).price : 0}
        currency={selectedCurrency}
        userId={user?.id}
        organizationId={user?.organization?.id || user?.organizationId}
        billingPeriod={selectedCycle === 'monthly' ? 'monthly' : 'annually'}
      />
    </div>
  );
}
