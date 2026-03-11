'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Loader2, CheckCircle, XCircle, AlertCircle, Plus, Minus, MessageSquare, Clock, Gift, CreditCard } from 'lucide-react';
import { api, apiHelpers } from '@/lib/api';
import clsx from 'clsx';

interface MessageCreditsPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type PaymentProvider = 'mtn' | 'orange' | 'enkap' | 'stripe';
type PaymentStatus = 'idle' | 'processing' | 'pending' | 'success' | 'failed';

interface PricingInfo {
  pricePerMessage: { xaf: number; usd: number };
  minimumPurchase: number;
  minimumPrice: { xaf: number; usd: number };
  expirationDays: number;
}

export function MessageCreditsPurchaseModal({
  isOpen,
  onClose,
  onSuccess,
}: MessageCreditsPurchaseModalProps) {
  const [amount, setAmount] = useState(1000);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [ptn, setPtn] = useState<string | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  // Default pricing values - will be overwritten by API
  const [pricing, setPricing] = useState<PricingInfo>({
    pricePerMessage: { xaf: 2, usd: 0.0032 },
    minimumPurchase: 1000,
    minimumPrice: { xaf: 2000, usd: 3.2 },
    expirationDays: 30,
  });
  const [calculatedPrice, setCalculatedPrice] = useState<{ xaf: number; usd: number }>({ xaf: 2000, usd: 3.2 });

  // Load pricing info on mount
  useEffect(() => {
    if (isOpen) {
      loadPricingInfo();
    }
  }, [isOpen]);

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
      setAmount(1000);
      setPhoneNumber('');
      setProvider(null);
      setStatus('idle');
      setError(null);
      setPtn(null);
    } else {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // Calculate price when amount changes
  useEffect(() => {
    if (pricing) {
      setCalculatedPrice({
        xaf: amount * pricing.pricePerMessage.xaf,
        usd: amount * pricing.pricePerMessage.usd,
      });
    }
  }, [amount, pricing]);

  const loadPricingInfo = async () => {
    setLoadingPricing(true);
    try {
      const response = await apiHelpers.messageCredits.getPricing();
      if (response.success && response.data && response.data.pricePerMessage) {
        setPricing(response.data);
        setAmount(response.data.minimumPurchase);
        setCalculatedPrice({
          xaf: response.data.minimumPurchase * response.data.pricePerMessage.xaf,
          usd: response.data.minimumPurchase * response.data.pricePerMessage.usd,
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load pricing info:', err);
      }
      // Keep default values if API fails
    } finally {
      setLoadingPricing(false);
    }
  };

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
    const digits = value.replace(/\D/g, '');
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
    if (!clean.startsWith('237')) {
      clean = '237' + clean;
    }
    return clean;
  };

  const handleAmountChange = (delta: number) => {
    const newAmount = amount + delta;
    if (pricing && newAmount >= pricing.minimumPurchase && newAmount <= 100000) {
      setAmount(newAmount);
    }
  };

  const setPresetAmount = (preset: number) => {
    setAmount(preset);
  };

  const handleInitiatePayment = async () => {
    if (!provider || !calculatedPrice) return;
    if (provider !== 'enkap' && provider !== 'stripe' && !phoneNumber) return;

    setStatus('processing');
    setError(null);

    try {
      if (provider === 'stripe') {
        // Initiate Stripe payment for credits
        const response = await api.createStripeCreditCheckout({
          amount,
        });

        if (response.success && response.data) {
          const data = response.data;
          if (data.url) {
            window.location.href = data.url;
          } else {
            setStatus('failed');
            setError('URL de paiement Stripe non disponible');
          }
        } else {
          setStatus('failed');
          setError(response.error || 'Erreur lors de la creation de la session Stripe');
        }
        return;
      }

      if (provider === 'enkap') {
        // Initiate E-nkap payment (card payment)
        const merchantReference = `MSGCRED-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const response = await api.initiateEnkapPayment({
          merchantReference,
          customerName: 'Client WazeApp',
          customerPhone: '237600000000', // Placeholder for card payments
          totalAmount: calculatedPrice.xaf,
          currency: 'XAF',
          description: `Achat de ${amount} messages supplementaires`,
          items: [
            {
              id: 'msg-credits',
              name: `${amount} Messages WhatsApp`,
              quantity: 1,
              price: calculatedPrice.xaf,
            }
          ],
          returnUrl: `${window.location.origin}/billing?payment=enkap&status=success&credits=${amount}`,
        });

        if (response.success && response.data) {
          const data = response.data;
          if (data.paymentUrl) {
            // Store transaction info for later verification
            localStorage.setItem('enkap_pending_credit_purchase', JSON.stringify({
              transactionId: data.txid || merchantReference,
              merchantReference,
              amount: amount,
              totalXaf: calculatedPrice.xaf,
            }));
            // Validate payment URL against known payment providers
            const ALLOWED_PAYMENT_HOSTS = ['pay.enkap.cm', 'enkap.cm', 'pay.s3pmaviance.com', 's3pmaviance.com'];
            try {
              const paymentHost = new URL(data.paymentUrl).hostname;
              if (!ALLOWED_PAYMENT_HOSTS.some(h => paymentHost === h || paymentHost.endsWith('.' + h))) {
                throw new Error('Unexpected payment redirect');
              }
            } catch {
              setStatus('failed');
              setError('URL de paiement invalide');
              return;
            }
            // Redirect to E-nkap payment page
            window.location.href = data.paymentUrl;
          } else {
            setStatus('failed');
            setError('URL de paiement non disponible');
          }
        } else {
          setStatus('failed');
          setError(response.error || 'Erreur lors de l\'initiation du paiement');
        }
      } else {
        // Initiate S3P payment (Mobile Money)
        const response = await api.initiateS3PPayment({
          amount: calculatedPrice.xaf,
          customerPhone: getCleanPhoneNumber(),
          paymentType: provider,
          customerName: 'Client WazeApp',
          description: `Achat de ${amount} messages supplementaires (credits bonus)`,
          plan: 'MESSAGE_CREDITS' as any,
        });

        if (response.success && response.data) {
          const data = response.data;

          // Check if backend returned success: false (business logic error)
          if (data.success === false) {
            setStatus('failed');
            setError(data.message || data.error || 'Le paiement a échoué');
            return;
          }

          setPtn(data.ptn);

          if (data.status === 'SUCCESS') {
            // Record the purchase
            await recordPurchase(data.transactionId, data.ptn);
            setStatus('success');
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 2000);
          } else if (data.status === 'PENDING') {
            setStatus('pending');
            pollPaymentStatus(data.ptn, data.transactionId);
          } else if (data.status === 'FAILED') {
            setStatus('failed');
            setError(data.message || data.error || 'Le paiement a échoué');
          } else {
            // Status unknown - check if there's an error
            if (data.error || data.message) {
              setStatus('failed');
              setError(data.message || data.error || 'Le paiement a échoué');
            } else {
              // Assume pending if no clear status
              setStatus('pending');
              pollPaymentStatus(data.ptn, data.transactionId);
            }
          }
        } else {
          setStatus('failed');
          setError(response.error || 'Erreur lors de l\'initiation du paiement');
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Payment error:', err);
      }
      setStatus('failed');
      setError('Une erreur est survenue. Veuillez reessayer.');
    }
  };

  const recordPurchase = async (transactionId: string, paymentPtn?: string) => {
    try {
      await apiHelpers.messageCredits.purchase({
        amount,
        transactionId,
        ptn: paymentPtn,
        paymentMethod: provider === 'mtn' ? 'mtn_mobile_money' : 'orange_money',
        phoneNumber: getCleanPhoneNumber(),
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to record purchase:', err);
      }
    }
  };

  const pollPaymentStatus = async (paymentPtn: string, transId: string) => {
    let attempts = 0;
    const maxAttempts = 12;

    const checkStatus = async () => {
      attempts++;

      try {
        const response = await api.verifyPayment({
          ptn: paymentPtn,
          transactionId: transId,
          plan: 'MESSAGE_CREDITS' as any,
          amount: calculatedPrice?.xaf || 0,
        });

        if (response.success && response.data) {
          const s3pStatus = response.data.status;

          if (s3pStatus === 'SUCCESS' || s3pStatus === 'SUCCESSFUL') {
            await recordPurchase(transId, paymentPtn);
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

    pollingTimeoutRef.current = setTimeout(checkStatus, 10000);
  };

  if (!isOpen) return null;

  const presetAmounts = [1000, 2500, 5000, 10000];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-3">
            <Gift className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">Acheter des Messages</h2>
          </div>
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
                Achat réussi !
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {amount.toLocaleString()} messages ont été ajoutés à votre compte
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

          {status === 'idle' && pricing && (
            <>
              {/* Amount Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Nombre de messages
                </label>

                {/* Preset amounts */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {presetAmounts.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setPresetAmount(preset)}
                      className={clsx(
                        'py-2 px-3 rounded-lg text-sm font-medium transition-all',
                        amount === preset
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      )}
                    >
                      {preset.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Custom amount selector */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => handleAmountChange(-500)}
                    disabled={amount <= pricing.minimumPurchase}
                    className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="flex-1 text-center">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {amount.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">messages</div>
                  </div>
                  <button
                    onClick={() => handleAmountChange(500)}
                    disabled={amount >= 100000}
                    className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Price Display */}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Prix unitaire
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {pricing.pricePerMessage.xaf} FCFA/msg
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Validité
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {pricing.expirationDays} jours
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">Total</span>
                    <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {calculatedPrice?.xaf.toLocaleString()} FCFA
                    </span>
                  </div>
                  <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                    ~${calculatedPrice?.usd.toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Choisissez votre mode de paiement
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setProvider('mtn')}
                    className={clsx(
                      'p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'mtn'
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-yellow-300'
                    )}
                  >
                    <img src="/images/payments/mtn.svg" alt="MTN" className="w-10 h-10 rounded-full" />
                    <span className="text-xs font-medium text-gray-900 dark:text-white">MTN MoMo</span>
                  </button>
                  <button
                    onClick={() => setProvider('orange')}
                    className={clsx(
                      'p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'orange'
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-orange-300'
                    )}
                  >
                    <img src="/images/payments/orange-money.svg" alt="Orange Money" className="w-10 h-10 rounded-full" />
                    <span className="text-xs font-medium text-gray-900 dark:text-white">Orange Money</span>
                  </button>
                  <button
                    onClick={() => setProvider('enkap')}
                    className={clsx(
                      'p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'enkap'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                    )}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">Carte bancaire</span>
                  </button>
                  <button
                    onClick={() => setProvider('stripe')}
                    className={clsx(
                      'p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      provider === 'stripe'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-purple-300'
                    )}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-gray-900 dark:text-white">Stripe</span>
                  </button>
                </div>
              </div>

              {/* Phone Number Input - Only for Mobile Money */}
              {provider && provider !== 'enkap' && provider !== 'stripe' && (
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
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Opérateur : <span className={provider === 'mtn' ? 'text-yellow-600' : 'text-orange-600'}>{provider === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'}</span>
                  </p>
                </div>
              )}

              {/* Card Payment Info */}
              {provider === 'enkap' && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-white">Paiement par carte bancaire</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Vous serez redirigé vers la plateforme sécurisée E-nkap pour effectuer votre paiement par carte Visa, Mastercard ou autre.
                  </p>
                </div>
              )}

              {/* Stripe Payment Info */}
              {provider === 'stripe' && (
                <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="font-medium text-gray-900 dark:text-white">Paiement via Stripe</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Vous serez redirigé vers Stripe pour effectuer votre paiement par carte Visa, Mastercard ou AMEX.
                  </p>
                </div>
              )}

              {/* Info Message */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-6">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p>Les messages bonus sont utilisés en priorité avant votre quota mensuel.</p>
                  <p className="mt-1">Validité: {pricing?.expirationDays} jours après achat.</p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleInitiatePayment}
                disabled={!provider || (provider !== 'enkap' && provider !== 'stripe' && phoneNumber.replace(/\D/g, '').length < 9)}
                className={clsx(
                  'w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
                  provider && (provider === 'enkap' || provider === 'stripe' || phoneNumber.replace(/\D/g, '').length >= 9)
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                )}
              >
                {provider === 'enkap' || provider === 'stripe' ? <CreditCard className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
                {provider === 'stripe' ? 'Payer via Stripe' : provider === 'enkap' ? 'Payer par carte' : 'Acheter'} {amount.toLocaleString()} messages - {calculatedPrice?.xaf.toLocaleString()} FCFA
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
