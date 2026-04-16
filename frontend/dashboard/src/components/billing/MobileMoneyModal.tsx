'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, Smartphone, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import clsx from 'clsx';

interface Plan {
  id: string;
  name: string;
  price: number;
  priceFCFA: number;
}

interface MobileMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
  onSuccess: () => void;
  customerName: string;
  customerEmail: string;
  userId?: string;
  billingPeriod?: 'monthly' | 'annually';
}

type PaymentProvider = 'mtn' | 'orange';
type PaymentStatus = 'idle' | 'processing' | 'pending' | 'success' | 'failed';

// Plan pricing in FCFA (monthly)
const PLAN_PRICES_FCFA: Record<string, number> = {
  standard: 19000,   // ~$29/month
  pro: 32000,        // ~$49/month
  enterprise: 130000, // ~$199/month
};

export function MobileMoneyModal({
  isOpen,
  onClose,
  plan,
  onSuccess,
  customerName,
  customerEmail,
  userId,
  billingPeriod = 'monthly',
}: MobileMoneyModalProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [ptn, setPtn] = useState<string | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPhoneNumber('');
      setProvider(null);
      setStatus('idle');
      setError(null);
      setTransactionRef(null);
      setPtn(null);
    } else {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // Auto-detect provider from phone number
  // MTN: 67x (all), 680, 650-654
  // Orange: 640, 655-659, 686-689, 69x (all)
  useEffect(() => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length >= 3) {
      const basePhone = cleanPhone.startsWith('237') ? cleanPhone.substring(3) : cleanPhone;
      if (basePhone.length < 3) return;

      const prefix3 = basePhone.substring(0, 3);
      const prefix3Num = parseInt(prefix3);

      // MTN: 670-679, 680, 650-654
      if ((prefix3Num >= 670 && prefix3Num <= 679) ||
          prefix3Num === 680 ||
          (prefix3Num >= 650 && prefix3Num <= 654)) {
        setProvider('mtn');
      }
      // Orange: 640, 655-659, 686-689, 690-699
      else if (prefix3Num === 640 ||
          (prefix3Num >= 655 && prefix3Num <= 659) ||
          (prefix3Num >= 686 && prefix3Num <= 689) ||
          (prefix3Num >= 690 && prefix3Num <= 699)) {
        setProvider('orange');
      }
    }
  }, [phoneNumber]);

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Format as XXX XXX XXX
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const getCleanPhoneNumber = () => {
    let clean = phoneNumber.replace(/\D/g, '');
    // Add country code if not present
    if (!clean.startsWith('237')) {
      clean = '237' + clean;
    }
    return clean;
  };

  const handleInitiatePayment = async () => {
    if (!plan || !provider || !phoneNumber) return;

    setStatus('processing');
    setError(null);

    try {
      const amount = PLAN_PRICES_FCFA[plan.id] || plan.priceFCFA || plan.price * 655;

      const response = await api.initiateS3PPayment({
        amount,
        customerPhone: getCleanPhoneNumber(),
        paymentType: provider,
        customerName: customerName || 'Client WazeApp',
        description: `Abonnement WazeApp - Plan ${plan.name}`,
        plan: plan.id.toUpperCase() as 'STANDARD' | 'PRO' | 'ENTERPRISE',
        userId,
        billingPeriod,
      });

      if (response.success && response.data) {
        const data = response.data;
        setTransactionRef(data.transactionId);
        setPtn(data.ptn);

        if (data.status === 'SUCCESS') {
          setStatus('success');
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 2000);
        } else if (data.status === 'PENDING') {
          setStatus('pending');
          // Start polling for status
          pollPaymentStatus(data.ptn, data.transactionId, amount);
        } else {
          setStatus('failed');
          setError(data.message || 'Le paiement a échoué');
        }
      } else {
        setStatus('failed');
        setError(response.error || 'Erreur lors de l\'initiation du paiement');
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Payment error:', err);
      }
      setStatus('failed');
      setError('Une erreur est survenue. Veuillez reessayer.');
    }
  };

  const pollPaymentStatus = async (paymentPtn: string, transId: string, paymentAmount: number) => {
    let attempts = 0;
    const maxAttempts = 12; // 2 minutes max (10s intervals)

    const checkStatus = async () => {
      attempts++;

      try {
        const response = await api.verifyPayment({
          ptn: paymentPtn,
          transactionId: transId,
          plan: plan?.id.toUpperCase() as 'STANDARD' | 'PRO' | 'ENTERPRISE',
          userId,
          amount: paymentAmount,
          billingPeriod,
        });

        if (response.success && response.data) {
          const s3pStatus = response.data.status;

          if (s3pStatus === 'SUCCESS' || s3pStatus === 'SUCCESSFUL') {
            setStatus('success');
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 2000);
            return;
          } else if (s3pStatus === 'FAILED' || s3pStatus === 'CANCELLED') {
            setStatus('failed');
            setError('Le paiement a ete refuse ou annule');
            return;
          }
        }

        // Continue polling if still pending
        if (attempts < maxAttempts) {
          pollingTimeoutRef.current = setTimeout(checkStatus, 10000);
        } else {
          setStatus('pending');
          setError('Le paiement est toujours en attente. Vérifiez votre téléphone.');
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          pollingTimeoutRef.current = setTimeout(checkStatus, 10000);
        }
      }
    };

    // Start polling after initial 10 second delay
    pollingTimeoutRef.current = setTimeout(checkStatus, 10000);
  };

  if (!isOpen || !plan) return null;

  const priceFCFA = PLAN_PRICES_FCFA[plan.id] || plan.priceFCFA || Math.round(plan.price * 655);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Paiement Mobile Money</h2>
          <button
            onClick={onClose}
            disabled={status === 'processing' || status === 'pending'}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Payment Status Display */}
          {status === 'processing' && (
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Traitement en cours...
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Veuillez patienter pendant que nous initialisons votre paiement
              </p>
            </div>
          )}

          {status === 'pending' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Confirmez sur votre téléphone
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Un message de confirmation a été envoyé au <strong>{phoneNumber}</strong>
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Entrez votre code PIN {provider === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'} pour confirmer
              </p>
              {ptn && (
                <p className="mt-4 text-xs text-gray-400">
                  Reference: {ptn}
                </p>
              )}
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin mx-auto mt-4" />
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Paiement réussi !
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Votre abonnement au plan {plan.name} est maintenant actif
              </p>
            </div>
          )}

          {status === 'failed' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Paiement échoué
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {error || 'Une erreur est survenue lors du paiement'}
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Réessayer
              </button>
            </div>
          )}

          {status === 'idle' && (
            <>
              {/* Plan Summary */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400">Plan</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{plan.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Montant</span>
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {priceFCFA.toLocaleString()} FCFA
                  </span>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Choisissez votre opérateur
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setProvider('mtn')}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'mtn'
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-yellow-300'
                    )}
                  >
                    <Image src="/images/payments/mtn.svg" alt="MTN" width={48} height={48} className="w-12 h-12 rounded-full" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">MTN MoMo</span>
                  </button>
                  <button
                    onClick={() => setProvider('orange')}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'orange'
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-orange-300'
                    )}
                  >
                    <Image src="/images/payments/orange-money.svg" alt="Orange Money" width={48} height={48} className="w-12 h-12 rounded-full" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Orange Money</span>
                  </button>
                </div>
              </div>

              {/* Phone Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Numéro de téléphone
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">+237</span>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="6XX XXX XXX"
                    maxLength={11}
                    className="w-full pl-20 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                {provider && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Opérateur détecté : <span className={provider === 'mtn' ? 'text-yellow-600' : 'text-orange-600'}>{provider === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'}</span>
                  </p>
                )}
              </div>

              {/* Info Message */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-6">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Vous recevrez une demande de confirmation sur votre téléphone.
                  Assurez-vous d'avoir suffisamment de solde.
                </p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleInitiatePayment}
                disabled={!provider || phoneNumber.replace(/\D/g, '').length < 9}
                className={clsx(
                  'w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
                  provider && phoneNumber.replace(/\D/g, '').length >= 9
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                )}
              >
                <Smartphone className="w-5 h-5" />
                Payer {priceFCFA.toLocaleString()} FCFA
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
