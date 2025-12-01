'use client';

import React, { useState } from 'react';
import { Check, Zap, Shield, Crown, Star, CreditCard, Calendar, ArrowRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  description: string;
  icon: React.ComponentType<any>;
  features: string[];
  limits: {
    maxAgents: number;
    maxRequests: number;
    maxStorage: string;
    features: string[];
  };
  popular?: boolean;
  current?: boolean;
}

interface SubscriptionManagerProps {
  currentPlan?: string;
  billingCycle?: 'monthly' | 'annual';
  onPlanChange?: (planId: string) => void;
  onBillingCycleChange?: (cycle: 'monthly' | 'annual') => void;
  isLoading?: boolean;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    description: 'Perfect for trying out our platform',
    icon: Zap,
    features: [
      '1 WhatsApp agent',
      'Basic analytics',
      'Email support',
      'Standard templates',
    ],
    limits: {
      maxAgents: 1,
      maxRequests: 100,
      maxStorage: '100MB',
      features: ['Basic Chat', 'Templates'],
    },
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 29,
    interval: 'month',
    description: 'Great for small businesses',
    icon: Shield,
    features: [
      '1 WhatsApp agent',
      'Advanced analytics',
      'Priority support',
      'Custom templates',
      'Basic automation',
      'File sharing',
    ],
    limits: {
      maxAgents: 1,
      maxRequests: 2000,
      maxStorage: '500MB',
      features: ['Advanced Chat', 'Automation', 'Analytics'],
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 69,
    interval: 'month',
    description: 'Perfect for growing teams',
    icon: Crown,
    popular: true,
    features: [
      '3 WhatsApp agents',
      'Advanced analytics & reports',
      '24/7 priority support',
      'Custom branding',
      'Advanced automation',
      'Team collaboration',
      'API access',
    ],
    limits: {
      maxAgents: 3,
      maxRequests: 8000,
      maxStorage: '5GB',
      features: ['Everything in Standard', 'Multi-agent', 'API', 'Branding'],
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    interval: 'month',
    description: 'For large organizations',
    icon: Star,
    features: [
      '10 WhatsApp agents',
      'Custom analytics dashboard',
      'Dedicated account manager',
      'White-label solution',
      'Advanced security features',
      'Custom integrations',
      'SLA guarantee',
      'On-premise deployment',
    ],
    limits: {
      maxAgents: 10,
      maxRequests: 30000,
      maxStorage: '20GB',
      features: ['Everything in Pro', 'White-label', 'SLA', 'On-premise'],
    },
  },
];

export function SubscriptionManager({
  currentPlan = 'free',
  billingCycle = 'monthly',
  onPlanChange,
  onBillingCycleChange,
  isLoading = false,
}: SubscriptionManagerProps) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [selectedCycle, setSelectedCycle] = useState(billingCycle);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const currentPlanData = plans.find(p => p.id === currentPlan);
  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  const getDiscountedPrice = (price: number, cycle: 'monthly' | 'annual') => {
    return cycle === 'annual' ? Math.round(price * 0.83) : price; // ~17% discount for annual
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
    onPlanChange?.(selectedPlan);
    onBillingCycleChange?.(selectedCycle);
    setShowUpgradeModal(false);
  };

  const PlanCard = ({ plan }: { plan: Plan }) => {
    const isCurrentPlan = plan.id === currentPlan;
    const isSelectedPlan = plan.id === selectedPlan;
    const Icon = plan.icon;
    const price = getDiscountedPrice(plan.price, selectedCycle);
    const yearlyPrice = getYearlyTotal(plan.price);
    
    return (
      <div
        className={clsx(
          'relative rounded-xl border-2 p-6 transition-all duration-200',
          isCurrentPlan && 'border-green-500 bg-green-50 dark:bg-green-900/20',
          isSelectedPlan && !isCurrentPlan && 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
          !isCurrentPlan && !isSelectedPlan && 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
          plan.popular && 'scale-105 shadow-lg'
        )}
      >
        {/* Popular badge */}
        {plan.popular && (
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium shadow-lg">
              Most Popular
            </span>
          </div>
        )}

        {/* Current plan badge */}
        {isCurrentPlan && (
          <div className="absolute -top-4 right-4">
            <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              Current Plan
            </span>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Icon className={clsx(
              'w-8 h-8 mr-3',
              isCurrentPlan ? 'text-green-600' : 'text-blue-600'
            )} />
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {plan.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {plan.description}
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-6">
          {plan.price === 0 ? (
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">Free</span>
            </div>
          ) : (
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">
                ${price}
              </span>
              <span className="text-lg text-gray-500 dark:text-gray-400 ml-1">
                /{selectedCycle === 'annual' ? 'month' : 'month'}
              </span>
            </div>
          )}
          
          {plan.price > 0 && selectedCycle === 'annual' && (
            <div className="mt-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ${yearlyPrice} billed annually
              </span>
              <span className="ml-2 text-sm text-green-600 font-medium">
                Save ${(plan.price * 12) - yearlyPrice}
              </span>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">
            What's included
          </h4>
          <ul className="space-y-2">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-start">
                <Check className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300 text-sm">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Limits */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-6">
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
            Usage Limits
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Agents:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-white">
                {plan.limits.maxAgents}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Requests:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-white">
                {plan.limits.maxRequests.toLocaleString()}/mo
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500 dark:text-gray-400">Storage:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-white">
                {plan.limits.maxStorage}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => handlePlanSelect(plan.id)}
          disabled={isLoading}
          className={clsx(
            'w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center',
            isCurrentPlan
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default'
              : plan.popular
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
              : 'bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isCurrentPlan ? (
            'Current Plan'
          ) : (
            <>
              {plan.price === 0 ? 'Downgrade to Free' : 'Upgrade to ' + plan.name}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Choose Your Plan
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Scale your WhatsApp automation with plans designed for businesses of all sizes.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center mb-12">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setSelectedCycle('monthly')}
            className={clsx(
              'px-6 py-2 rounded-md text-sm font-medium transition-all',
              selectedCycle === 'monthly'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setSelectedCycle('annual')}
            className={clsx(
              'px-6 py-2 rounded-md text-sm font-medium transition-all relative',
              selectedCycle === 'annual'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            Annual
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      {/* Current Plan Summary */}
      {currentPlanData && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mr-4">
                <CreditCard className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Current Plan: {currentPlanData.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {currentPlanData.price === 0 ? 'Free' : `$${currentPlanData.price}/month`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Next billing date</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && selectedPlanData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirm Plan Change
              </h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                You're about to {selectedPlanData.price > (currentPlanData?.price || 0) ? 'upgrade' : 'downgrade'} to the <strong>{selectedPlanData.name}</strong> plan.
              </p>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Plan</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedPlanData.name}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Price</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedPlanData.price === 0 ? 'Free' : `$${getDiscountedPrice(selectedPlanData.price, selectedCycle)}/${selectedCycle === 'annual' ? 'month' : 'month'}`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Billing</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {selectedCycle === 'annual' ? 'Annual' : 'Monthly'}
                  </span>
                </div>
              </div>

              {selectedPlanData.price > (currentPlanData?.price || 0) && (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                  Your card will be charged immediately for the prorated amount.
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}