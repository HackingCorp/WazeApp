'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { NoInvoicesIllustration } from '@/components/illustrations/EmptyStateIllustrations';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import toast from 'react-hot-toast';
import {
  CreditCard,
  FileText,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  Loader2,
  ArrowRight,
  Gift,
} from 'lucide-react';
import { BonusCreditsWidget } from '@/components/billing/BonusCreditsWidget';
import dynamic from 'next/dynamic';

const MessageCreditsPurchaseModal = dynamic(() => import('@/components/billing/MessageCreditsPurchaseModal').then(mod => mod.MessageCreditsPurchaseModal), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/billing/PaymentModal').then(mod => mod.PaymentModal), { ssr: false });
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  amountInCents: number;
  totalAmountInCents: number;
  currency: string;
  description: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: string;
  createdAt: string;
}

interface BillingSummary {
  currentPlan: string;
  nextBillingDate: string | null;
  nextAmount: number;
  currency: string;
  pendingInvoices: number;
  totalDue: number;
  billingPeriod: { start: string; end: string } | null;
}

const getStatusConfig = (t: (key: string) => string) => ({
  draft: { label: t('billing.draft'), icon: FileText, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  pending: { label: t('billing.pending'), icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' },
  paid: { label: t('billing.paid'), icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  overdue: { label: t('billing.overdue'), icon: AlertTriangle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  cancelled: { label: t('billing.cancelled'), icon: XCircle, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  refunded: { label: t('billing.refunded'), icon: ArrowRight, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
});

export default function BillingPage() {
  const { user, refreshAuth } = useAuth();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [stripeSetupPending, setStripeSetupPending] = useState(false);
  const [creatingCheckout, setCreatingCheckout] = useState(false);

  useEffect(() => {
    analytics.track('billing_page_viewed');
  }, []);
  const [activeTab, setActiveTab] = useState<'plan' | 'credits' | 'invoices'>('plan');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showInvoicePaymentModal, setShowInvoicePaymentModal] = useState(false);
  const searchParams = useSearchParams();

  // Detect ?setup=stripe (redirect from AuthProvider when stripeCheckoutPending)
  useEffect(() => {
    if (searchParams?.get('setup') === 'stripe') {
      setStripeSetupPending(true);
    }
  }, [searchParams]);

  const handleCompleteStripeSetup = async () => {
    setCreatingCheckout(true);
    try {
      const plan = currentPlan !== 'free' ? currentPlan.toUpperCase() : 'STANDARD';
      analytics.track('stripe_checkout_started', { plan });
      const dashboardUrl = window.location.origin;
      const response = await api.createStripeCheckoutSession({
        plan: plan as 'STANDARD' | 'PRO' | 'ENTERPRISE',
        billingPeriod: 'monthly',
        successUrl: `${dashboardUrl}/billing?payment=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${dashboardUrl}/billing?setup=stripe&payment=stripe-cancelled`,
      });
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error(response.error || 'Impossible de créer la session de paiement');
      }
    } catch (error) {
      toast.error('Erreur réseau. Veuillez réessayer.');
    } finally {
      setCreatingCheckout(false);
    }
  };

  // Handle E-nkap and Stripe payment returns
  useEffect(() => {
    if (!searchParams) return;

    const paymentStatus = searchParams.get('payment');
    const plan = searchParams.get('plan');
    const sessionId = searchParams.get('session_id');

    // Handle Stripe return (redirect after Checkout)
    if (paymentStatus === 'stripe' && sessionId) {
      // Clear the setup pending banner since checkout was completed
      setStripeSetupPending(false);

      toast.success(t('billing.stripeProcessing'), {
        duration: 5000,
      });

      // Refresh user data to get updated subscription (wait for Stripe webhook to process)
      setTimeout(() => {
        refreshAuth();
        fetchInvoices();
        // Also refresh billing summary to update plan and next billing date
        api.getBillingSummary().then(res => {
          if (res.success) setSummary(res.data);
        }).catch(() => {});
      }, 4000);

      // Clean URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('session_id');
      url.searchParams.delete('setup');
      window.history.replaceState({}, '', url.pathname);
    } else if (paymentStatus === 'stripe-cancelled') {
      toast.error(t('billing.stripeCancelled'));

      // Clean URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.pathname);
    } else if (paymentStatus === 'success' && plan) {
      toast.success(t('billing.paymentReceived').replace('{{plan}}', plan.toUpperCase()), {
        duration: 5000,
      });

      // Refresh user data to get updated subscription (wait for webhook to process)
      setTimeout(() => {
        refreshAuth();
        fetchInvoices();
        // Also refresh billing summary
        api.getBillingSummary().then(res => {
          if (res.success) setSummary(res.data);
        }).catch(() => {});
      }, 3000);

      // Clean URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('plan');
      window.history.replaceState({}, '', url.pathname);
    } else if (paymentStatus === 'failed') {
      toast.error(t('billing.paymentFailed'));

      // Clean URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('plan');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams, refreshAuth]);

  // Fetch invoices and summary
  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const [invoicesRes, summaryRes] = await Promise.all([
        api.getBillingInvoices(),
        api.getBillingSummary(),
      ]);

      if (invoicesRes.success) {
        setInvoices(invoicesRes.data || []);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch billing data:', error);
      }
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Fetch billing summary on mount (needed for nextBillingDate on plan tab)
  useEffect(() => {
    if (!summary) {
      api.getBillingSummary().then(res => {
        if (res.success) setSummary(res.data);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'invoices') {
      fetchInvoices();
    }
  }, [activeTab]);

  // If Stripe checkout not completed, treat as free plan (internal trial doesn't count)
  const currentPlan = !user?.subscriptionActive
    ? 'free'
    : user?.organization?.plan?.toLowerCase() || (user as any)?.subscription?.plan?.toLowerCase() || 'free';
  const billingCycle = 'monthly';
  const subscriptionStatus = (user?.organization as any)?.subscription?.status?.toLowerCase() || (user as any)?.subscription?.status?.toLowerCase() || '';
  const trialEndsAt = (user?.organization as any)?.subscription?.trialEndsAt || (user as any)?.subscription?.trialEndsAt || undefined;

  // Plan change is handled by PaymentModal for upgrades
  // For downgrades to free, just reload the page (backend handles it via payment success callback)
  const handlePlanChange = async (planId: string) => {
    // The actual plan change happens in PaymentModal after successful payment
    // This callback is called after payment success, so just refresh auth
    await refreshAuth();
  };

  // Billing cycle is passed to PaymentModal and handled during payment
  const handleBillingCycleChange = async (cycle: 'monthly' | 'annual') => {
    // The billing cycle is stored with the subscription during payment
  };

  const handlePayInvoice = (invoice: Invoice) => {
    analytics.track('invoice_payment_opened', { invoiceId: invoice.id, amount: invoice.amountInCents });
    setSelectedInvoice(invoice);
    setShowInvoicePaymentModal(true);
  };

  const handleInvoicePaymentSuccess = async () => {
    // Payment was successful - mark invoice as paid in backend
    if (selectedInvoice) {
      try {
        await api.payInvoice(selectedInvoice.id, {
          paymentMethod: 'mobile_money',
          paymentReference: `INVOICE-PAYMENT-${Date.now()}`,
        });
      } catch (err) {
        // Don't block success flow - backend webhook may handle this too
        console.error('Failed to mark invoice as paid:', err);
      }
    }
    toast.success(t('billing.invoicePaid'));
    setShowInvoicePaymentModal(false);
    setSelectedInvoice(null);
    fetchInvoices();
    refreshAuth();
  };

  const formatAmount = (amountInCents: number, currency: string) => {
    const amount = amountInCents / 100;
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy', { locale: fr });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Stripe Setup Banner */}
      {stripeSetupPending && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Completez votre inscription Stripe pour acceder au dashboard
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Configurez votre méthode de paiement pour activer votre période d'essai gratuite. Aucun prélèvement immédiat.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCompleteStripeSetup}
                disabled={creatingCheckout}
                className="ml-4 inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {creatingCheckout ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Compléter le paiement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('plan')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'plan'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <CreditCard className="w-4 h-4 inline-block mr-2" />
              {t('billing.subscription')}
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'credits'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Gift className="w-4 h-4 inline-block mr-2" />
              {t('billing.bonusMessages')}
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'invoices'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <FileText className="w-4 h-4 inline-block mr-2" />
              {t('billing.invoices')}
              {summary && summary.pendingInvoices > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {summary.pendingInvoices}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'plan' ? (
        <SubscriptionManager
          currentPlan={currentPlan}
          billingCycle={billingCycle}
          subscriptionStatus={subscriptionStatus}
          trialEndsAt={trialEndsAt}
          nextBillingDate={summary?.nextBillingDate ?? undefined}
          onPlanChange={handlePlanChange}
          onBillingCycleChange={handleBillingCycleChange}
          isLoading={isLoading}
        />
      ) : activeTab === 'credits' ? (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {t('billing.additionalMessages')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {t('billing.buyBonusMessages')}
            </p>
          </div>

          {/* Bonus Credits Widget */}
          <BonusCreditsWidget />

          {/* Info Section */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4">
              {t('billing.howItWorks')}
            </h3>
            <ul className="space-y-3 text-sm text-blue-700 dark:text-blue-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300">1</span>
                <span>{t('billing.buyMessagePacks')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300">2</span>
                <span>{t('billing.bonusUsedFirst')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300">3</span>
                <span>{t('billing.unusedExpire')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-300">4</span>
                <span>{t('billing.fifoOrder')}</span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Billing Summary */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.currentPlan')}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
                  {!user?.subscriptionActive ? 'Free' : summary.currentPlan}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.nextBilling')}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.nextBillingDate ? formatDate(summary.nextBillingDate) : '-'}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.nextAmount')}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAmount(summary.nextAmount, summary.currency)}
                </div>
              </div>
              <div className={`rounded-xl p-6 shadow-sm border ${
                summary.totalDue > 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('billing.totalDue')}</div>
                <div className={`text-2xl font-bold ${
                  summary.totalDue > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-900 dark:text-white'
                }`}>
                  {formatAmount(summary.totalDue, summary.currency)}
                </div>
              </div>
            </div>
          )}

          {/* Invoices List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('billing.invoiceHistory')}
              </h2>
            </div>

            {loadingInvoices ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12">
                <NoInvoicesIllustration className="mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t('billing.noInvoices')}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {t('billing.invoicesWillAppear')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.invoice')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.period')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.amount')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.dueDate')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.status')}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('billing.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {invoices.map((invoice) => {
                      const statusConfig = getStatusConfig(t);
                      const status = statusConfig[invoice.status];
                      const StatusIcon = status.icon;
                      const isPending = invoice.status === 'pending' || invoice.status === 'overdue';

                      return (
                        <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {invoice.invoiceNumber}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {invoice.description}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {formatDate(invoice.periodStart)}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {t('billing.to')} {formatDate(invoice.periodEnd)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {formatAmount(invoice.totalAmountInCents, invoice.currency)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {formatDate(invoice.dueDate)}
                            </div>
                            {invoice.paidAt && (
                              <div className="text-xs text-green-600 dark:text-green-400">
                                {t('billing.paidOn')} {formatDate(invoice.paidAt)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              {isPending && (
                                <button
                                  onClick={() => handlePayInvoice(invoice)}
                                  className="inline-flex items-center px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                  <CreditCard className="w-3 h-3 mr-1" />
                                  {t('billing.pay')}
                                </button>
                              )}
                              <button
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                title={t('billing.download')}
                                aria-label="Download invoice"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Billing Period Info */}
          {summary?.billingPeriod && (
            <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3" />
                <div>
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {t('billing.billingPeriod')}
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    {t('billing.from')} {formatDate(summary.billingPeriod.start)} {t('billing.to')} {formatDate(summary.billingPeriod.end)}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {t('billing.quotasReset')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoice Payment Modal */}
      {selectedInvoice && (
        <PaymentModal
          isOpen={showInvoicePaymentModal}
          onClose={() => {
            setShowInvoicePaymentModal(false);
            setSelectedInvoice(null);
          }}
          plan={{
            id: `invoice-${selectedInvoice.id}`,
            name: selectedInvoice.description || `Facture ${selectedInvoice.invoiceNumber}`,
            isInvoice: true,
          }}
          onSuccess={handleInvoicePaymentSuccess}
          customerName={user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email || 'Client'}
          customerEmail={user?.email || ''}
          dynamicPrice={selectedInvoice.totalAmountInCents / 100}
          currency={selectedInvoice.currency || 'XAF'}
          userId={user?.id}
          organizationId={user?.organization?.id}
        />
      )}
    </div>
  );
}
