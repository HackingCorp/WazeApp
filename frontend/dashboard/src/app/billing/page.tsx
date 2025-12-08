'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
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
  ArrowRight
} from 'lucide-react';
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

const statusConfig = {
  draft: { label: 'Brouillon', icon: FileText, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  pending: { label: 'En attente', icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' },
  paid: { label: 'Payee', icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  overdue: { label: 'En retard', icon: AlertTriangle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  cancelled: { label: 'Annulee', icon: XCircle, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  refunded: { label: 'Remboursee', icon: ArrowRight, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
};

export default function BillingPage() {
  const { user, refreshAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'invoices'>('plan');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Handle E-nkap payment return
  useEffect(() => {
    if (!searchParams) return;

    const paymentStatus = searchParams.get('payment');
    const plan = searchParams.get('plan');

    if (paymentStatus === 'success' && plan) {
      toast.success(`Paiement recu ! Votre abonnement ${plan.toUpperCase()} est en cours d'activation...`, {
        duration: 5000,
      });

      // Refresh user data to get updated subscription (wait for webhook to process)
      setTimeout(() => {
        refreshAuth();
        fetchInvoices();
      }, 3000);

      // Clean URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('plan');
      window.history.replaceState({}, '', url.pathname);
    } else if (paymentStatus === 'failed') {
      toast.error('Le paiement a echoue. Veuillez reessayer.');

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
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices') {
      fetchInvoices();
    }
  }, [activeTab]);

  const currentPlan = user?.organization?.plan?.toLowerCase() || 'free';
  const billingCycle = 'monthly';

  // Plan change is handled by PaymentModal for upgrades
  // For downgrades to free, just reload the page (backend handles it via payment success callback)
  const handlePlanChange = async (planId: string) => {
    // The actual plan change happens in PaymentModal after successful payment
    // This callback is called after payment success, so just refresh auth
    console.log('Plan changed to:', planId);
    await refreshAuth();
  };

  // Billing cycle is passed to PaymentModal and handled during payment
  const handleBillingCycleChange = async (cycle: 'monthly' | 'annual') => {
    // The billing cycle is stored with the subscription during payment
    console.log('Billing cycle changed to:', cycle);
  };

  const handlePayInvoice = async (invoiceId: string) => {
    setPayingInvoice(invoiceId);
    try {
      // For now, simulate payment - in production, this would open the payment modal
      const response = await api.payInvoice(invoiceId, {
        paymentMethod: 'mobile_money',
        paymentReference: `PAY-${Date.now()}`,
      });

      if (response.success) {
        toast.success('Facture payee avec succes !');
        fetchInvoices();
        refreshAuth();
      } else {
        throw new Error(response.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Failed to pay invoice:', error);
      toast.error('Echec du paiement. Veuillez reessayer.');
    } finally {
      setPayingInvoice(null);
    }
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
              Abonnement
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
              Factures
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
          onPlanChange={handlePlanChange}
          onBillingCycleChange={handleBillingCycleChange}
          isLoading={isLoading}
        />
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Billing Summary */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Plan actuel</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
                  {summary.currentPlan}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Prochaine facturation</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.nextBillingDate ? formatDate(summary.nextBillingDate) : '-'}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Prochain montant</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatAmount(summary.nextAmount, summary.currency)}
                </div>
              </div>
              <div className={`rounded-xl p-6 shadow-sm border ${
                summary.totalDue > 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total a payer</div>
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
                Historique des factures
              </h2>
            </div>

            {loadingInvoices ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Aucune facture
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Les factures apparaitront ici une fois generees.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Facture
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Periode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Montant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Echeance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {invoices.map((invoice) => {
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
                              au {formatDate(invoice.periodEnd)}
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
                                Payee le {formatDate(invoice.paidAt)}
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
                                  onClick={() => handlePayInvoice(invoice.id)}
                                  disabled={payingInvoice === invoice.id}
                                  className="inline-flex items-center px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {payingInvoice === invoice.id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      Paiement...
                                    </>
                                  ) : (
                                    <>
                                      <CreditCard className="w-3 h-3 mr-1" />
                                      Payer
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                title="Telecharger"
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
                    Periode de facturation actuelle
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Du {formatDate(summary.billingPeriod.start)} au {formatDate(summary.billingPeriod.end)}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Les quotas sont reinitialises apres le paiement de la facture.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
