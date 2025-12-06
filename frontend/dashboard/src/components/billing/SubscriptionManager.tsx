'use client';

import React, { useState, useEffect } from 'react';
import { Check, Zap, Shield, Crown, Star, CreditCard, ArrowRight, AlertTriangle, Sparkles, Smartphone, Globe, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { PaymentModal } from './PaymentModal';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  priceFCFA: number;
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

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceFCFA: 0,
    interval: 'month',
    description: 'Perfect for trying out our platform',
    icon: Zap,
    gradient: 'from-gray-500 to-gray-600',
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    features: [
      '1 WhatsApp agent',
      'Basic analytics',
      'Email support',
      'Standard templates',
      '50 broadcast contacts',
      '3 message templates',
    ],
    limits: {
      maxAgents: 1,
      maxRequests: 100,
      maxStorage: '100MB',
    },
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 29,
    priceFCFA: 19000,
    interval: 'month',
    description: 'Great for small businesses',
    icon: Shield,
    gradient: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    features: [
      '1 WhatsApp agent',
      'Advanced analytics',
      'Priority support',
      'Custom templates',
      'Basic automation',
      'File sharing',
      '500 broadcast contacts',
      '10 message templates',
      'Scheduled campaigns',
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
    price: 69,
    priceFCFA: 45000,
    interval: 'month',
    description: 'Perfect for growing teams',
    icon: Crown,
    gradient: 'from-emerald-500 to-green-600',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    popular: true,
    features: [
      '3 WhatsApp agents',
      'Advanced analytics & reports',
      '24/7 priority support',
      'Custom branding',
      'Advanced automation',
      'Team collaboration',
      'API access',
      '5,000 broadcast contacts',
      '50 message templates',
      'Recurring campaigns',
      'Webhooks integration',
    ],
    limits: {
      maxAgents: 3,
      maxRequests: 8000,
      maxStorage: '5GB',
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    priceFCFA: 130000,
    interval: 'month',
    description: 'For large organizations',
    icon: Star,
    gradient: 'from-purple-500 to-indigo-600',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    features: [
      '10 WhatsApp agents',
      'Custom analytics dashboard',
      'Dedicated account manager',
      'White-label solution',
      'Advanced security features',
      'Custom integrations',
      'SLA guarantee',
      'On-premise deployment',
      'Unlimited broadcast contacts',
      'Unlimited templates',
      'External API access',
      'Priority webhooks',
    ],
    limits: {
      maxAgents: 10,
      maxRequests: 30000,
      maxStorage: '20GB',
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
  };
}

export function SubscriptionManager({
  currentPlan = 'free',
  billingCycle = 'monthly',
  onPlanChange,
  onBillingCycleChange,
  isLoading = false,
}: SubscriptionManagerProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [selectedCycle, setSelectedCycle] = useState(billingCycle);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [planToPurchase, setPlanToPurchase] = useState<Plan | null>(null);

  // Currency state
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState<Currency[]>([
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'XAF', name: 'CFA Franc', symbol: 'FCFA ' },
  ]);
  const [dynamicPricing, setDynamicPricing] = useState<DynamicPricing>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  // Official exchange rates from backend
  const [officialRates, setOfficialRates] = useState<{ [key: string]: ExchangeRateData }>({});
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null);

  const currentPlanData = plans.find(p => p.id === currentPlan);
  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  // Fetch available currencies and exchange rates on mount
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await api.getCurrencies() as any;
        if (response.success && response.currencies) {
          setCurrencies(response.currencies);
        }
      } catch (error) {
        console.error('Error fetching currencies:', error);
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
          console.log('Official exchange rates loaded:', Object.keys(response.rates).length, 'currencies');
        }
      } catch (error) {
        console.error('Error fetching exchange rates:', error);
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
        if (response.success && response.plans) {
          const pricing: DynamicPricing = {};
          for (const [key, value] of Object.entries(response.plans)) {
            const plan = value as any;
            pricing[key.toLowerCase()] = {
              price: plan.price,
              symbol: plan.symbol,
              currency: plan.currency,
              priceFormatted: plan.priceFormatted,
            };
          }
          setDynamicPricing(pricing);
        }
      } catch (error) {
        console.error('Error fetching pricing:', error);
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
    if (selectedPlanData && selectedPlanData.price > 0) {
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
    // Reload the page to reflect changes
    window.location.reload();
  };

  // Get the current currency symbol
  const getCurrentCurrencySymbol = () => {
    const currency = currencies.find(c => c.code === selectedCurrency);
    return currency?.symbol || '$';
  };

  // Get price for a plan in the selected currency
  const getPlanPrice = (planId: string): { price: number; symbol: string; formatted: string } => {
    // Primary: Use dynamically fetched pricing from backend (already converted)
    const pricing = dynamicPricing[planId];
    if (pricing) {
      return {
        price: pricing.price,
        symbol: pricing.symbol,
        formatted: pricing.priceFormatted,
      };
    }

    // Fallback: Use official exchange rates from backend for local calculation
    const plan = plans.find(p => p.id === planId);
    const basePrice = plan?.price || 0;
    const symbol = getCurrentCurrencySymbol();

    if (basePrice === 0) {
      return { price: 0, symbol, formatted: 'Free' };
    }

    // Use official rates if available, otherwise fall back to hardcoded rates
    let rateWithMargin: number;
    const officialRate = officialRates[selectedCurrency];

    if (officialRate) {
      // Use official rate with margin (already calculated by backend)
      rateWithMargin = officialRate.rateWithMargin;
    } else {
      // Ultimate fallback: hardcoded rates with 10% margin
      const fallbackRate = FALLBACK_RATES[selectedCurrency] || 1;
      rateWithMargin = fallbackRate * 1.1;
    }

    let converted = basePrice * rateWithMargin;

    // Round for African currencies
    if (['XAF', 'XOF', 'NGN', 'KES', 'GHS', 'EGP'].includes(selectedCurrency)) {
      converted = Math.ceil(converted / 100) * 100;
    } else {
      converted = Math.round(converted * 100) / 100;
    }

    return {
      price: converted,
      symbol,
      formatted: `${symbol}${converted.toLocaleString()}`,
    };
  };

  const PlanCard = ({ plan }: { plan: Plan }) => {
    const isCurrentPlan = plan.id === currentPlan;
    const Icon = plan.icon;
    const planPricing = getPlanPrice(plan.id);
    const symbol = planPricing.symbol;

    // When annual is selected, API returns the annual total - we need to calculate monthly equivalent
    const apiPrice = planPricing.price;
    const price = selectedCycle === 'annual' && apiPrice > 0 ? Math.round(apiPrice / 12) : apiPrice;
    const yearlyPrice = selectedCycle === 'annual' ? apiPrice : price * 12;
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
            Most Popular
          </div>
        )}

        {/* Current plan badge */}
        {isCurrentPlan && !plan.popular && (
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-gray-700 to-gray-800 dark:from-gray-600 dark:to-gray-700 text-white text-center py-2 text-sm font-semibold">
            Current Plan
          </div>
        )}

        {isCurrentPlan && plan.popular && (
          <div className="absolute top-9 right-3 z-10">
            <span className="bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold shadow-md">
              Current
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
          </div>

          {/* Pricing */}
          <div className="mb-6">
            {price === 0 ? (
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-gray-900 dark:text-white">Free</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  {pricingLoading ? (
                    <span className="text-5xl font-bold text-gray-400 dark:text-gray-500 animate-pulse">...</span>
                  ) : (
                    <span className="text-5xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>
                      {symbol}{price.toLocaleString()}
                    </span>
                  )}
                  <span className="text-gray-500 dark:text-gray-400 text-lg">
                    /month
                  </span>
                </div>
                {selectedCycle === 'annual' && !pricingLoading && (
                  <div className="mt-2 space-y-1" suppressHydrationWarning>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      <span className="line-through">{symbol}{monthlyOriginal.toLocaleString()}</span>
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                        Save 17%
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {symbol}{yearlyPrice.toLocaleString()} billed annually
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Features */}
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
              What's included
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
              Usage Limits
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxAgents}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Agents</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxRequests >= 1000
                    ? `${plan.limits.maxRequests / 1000}K`
                    : plan.limits.maxRequests}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Req/mo</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {plan.limits.maxStorage}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Storage</p>
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
              'Current Plan'
            ) : (
              <>
                {plan.price === 0 ? 'Downgrade' : `Upgrade to ${plan.name}`}
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
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Scale your WhatsApp automation with plans designed for businesses of all sizes.
          No hidden fees, cancel anytime.
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
            Monthly
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
            Annual
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

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4 mb-16">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      {/* Features Comparison */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-8">
          Compare plans in detail
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-4 px-4 text-gray-500 dark:text-gray-400 font-medium">Feature</th>
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
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">WhatsApp Agents</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxAgents}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">Monthly Requests</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxRequests.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">Storage</td>
                {plans.map(plan => (
                  <td key={plan.id} className="text-center py-4 px-4 font-semibold text-gray-900 dark:text-white">
                    {plan.limits.maxStorage}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">Analytics</td>
                <td className="text-center py-4 px-4 text-gray-500 dark:text-gray-400">Basic</td>
                <td className="text-center py-4 px-4 text-gray-900 dark:text-white font-medium">Advanced</td>
                <td className="text-center py-4 px-4 text-emerald-600 dark:text-emerald-400 font-medium">Advanced + Reports</td>
                <td className="text-center py-4 px-4 text-purple-600 dark:text-purple-400 font-medium">Custom Dashboard</td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">Support</td>
                <td className="text-center py-4 px-4 text-gray-500 dark:text-gray-400">Email</td>
                <td className="text-center py-4 px-4 text-gray-900 dark:text-white font-medium">Priority</td>
                <td className="text-center py-4 px-4 text-emerald-600 dark:text-emerald-400 font-medium">24/7 Priority</td>
                <td className="text-center py-4 px-4 text-purple-600 dark:text-purple-400 font-medium">Dedicated Manager</td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">API Access</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-emerald-500 mx-auto" /></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-purple-500 mx-auto" /></td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">White-label</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
                <td className="text-center py-4 px-4"><Check className="w-5 h-5 text-purple-500 mx-auto" /></td>
              </tr>
              <tr>
                <td className="py-4 px-4 text-gray-700 dark:text-gray-300">SLA Guarantee</td>
                <td className="text-center py-4 px-4"><span className="text-gray-300 dark:text-gray-600">—</span></td>
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your current plan</p>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {currentPlanData.name} Plan
                </h3>
                <p className="text-gray-600 dark:text-gray-300" suppressHydrationWarning>
                  {getPlanPrice(currentPlanData.id).price === 0 ? 'Free forever' : `${getPlanPrice(currentPlanData.id).symbol}${getPlanPrice(currentPlanData.id).price.toLocaleString()}/month`}
                </p>
              </div>
            </div>
            {getPlanPrice(currentPlanData.id).price > 0 && (
              <div className="text-left md:text-right">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Next billing date</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white" suppressHydrationWarning>
                  {format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMMM dd, yyyy')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAQ Section */}
      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Have questions?
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Contact our sales team for custom enterprise solutions or any pricing questions.
        </p>
        <button className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
          Contact Sales
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
                Confirm Plan Change
              </h3>
            </div>

            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                You're about to {getPlanPrice(selectedPlanData.id).price > getPlanPrice(currentPlanData?.id || 'free').price ? 'upgrade' : 'downgrade'} to the <strong className="text-gray-900 dark:text-white">{selectedPlanData.name}</strong> plan.
              </p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Plan</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedPlanData.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Price</span>
                  <span className="font-semibold text-gray-900 dark:text-white" suppressHydrationWarning>
                    {getPlanPrice(selectedPlanData.id).price === 0 ? 'Free' : `${getPlanPrice(selectedPlanData.id).symbol}${getPlanPrice(selectedPlanData.id).price.toLocaleString()}/month`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Currency</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedCurrency}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Billing</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedCycle === 'annual' ? 'Annual' : 'Monthly'}
                  </span>
                </div>
              </div>

              {getPlanPrice(selectedPlanData.id).price > getPlanPrice(currentPlanData?.id || 'free').price && (
                <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
                    Moyens de paiement disponibles:
                  </p>
                  <div className="flex items-center gap-4 text-xs text-emerald-600 dark:text-emerald-400">
                    <div className="flex items-center gap-1">
                      <Smartphone className="w-4 h-4" />
                      <span>MTN / Orange</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CreditCard className="w-4 h-4" />
                      <span>Visa / MC / PayPal</span>
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
                Cancel
              </button>
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
              >
                {isLoading ? 'Processing...' : getPlanPrice(selectedPlanData?.id || 'free').price > 0 ? 'Choisir le mode de paiement' : 'Confirm'}
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
      />
    </div>
  );
}
