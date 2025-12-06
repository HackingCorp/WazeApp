'use client';

import React, { useState, useEffect } from 'react';
import { X, Smartphone, CreditCard, Loader2, CheckCircle, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import clsx from 'clsx';

interface Plan {
  id: string;
  name: string;
  price: number;
  priceFCFA: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: Plan | null;
  onSuccess: () => void;
  customerName: string;
  customerEmail: string;
  dynamicPrice?: number; // Prix dynamique de l'API
  currency?: string; // Devise sélectionnée
}

type PaymentMethod = 'mobile' | 'card' | null;
type MobileProvider = 'mtn' | 'orange';
type PaymentStatus = 'idle' | 'processing' | 'pending' | 'success' | 'failed' | 'redirecting';

export function PaymentModal({
  isOpen,
  onClose,
  plan,
  onSuccess,
  customerName,
  customerEmail,
  dynamicPrice,
  currency = 'XAF',
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mobileProvider, setMobileProvider] = useState<MobileProvider | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [ptn, setPtn] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(null);
      setPhoneNumber('');
      setMobileProvider(null);
      setStatus('idle');
      setError(null);
      setTransactionRef(null);
      setPtn(null);
      setPaymentUrl(null);
    }
  }, [isOpen]);

  // Detect provider from phone number
  const detectProvider = (phone: string): MobileProvider | null => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 2) {
      const prefix = cleanPhone.startsWith('237') ? cleanPhone.substring(3, 5) : cleanPhone.substring(0, 2);
      // MTN prefixes: 67, 68, 650-654
      if (['67', '68'].includes(prefix) || (prefix.startsWith('65') && parseInt(prefix) <= 54)) {
        return 'mtn';
      }
      // Orange prefixes: 69, 655-659, 55-59
      else if (['69'].includes(prefix) || (prefix.startsWith('65') && parseInt(prefix) >= 55) || ['55', '56', '57', '58', '59'].includes(prefix)) {
        return 'orange';
      }
    }
    return null;
  };

  // Auto-detect and auto-select provider from phone number
  useEffect(() => {
    const detected = detectProvider(phoneNumber);
    if (detected) {
      setMobileProvider(detected);
    }
  }, [phoneNumber]);

  // Check if provider matches phone number
  const detectedProvider = detectProvider(phoneNumber);
  const providerMismatch = detectedProvider && mobileProvider && detectedProvider !== mobileProvider;

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

  // ============================================
  // S3P MOBILE MONEY PAYMENT
  // ============================================
  const handleMobilePayment = async () => {
    if (!plan || !mobileProvider || !phoneNumber) return;

    setStatus('processing');
    setError(null);

    try {
      const amount = dynamicPrice || Math.round(plan.price * 655);
      const cleanPhone = getCleanPhoneNumber();

      console.log('=== S3P PAYMENT DEBUG (Frontend) ===');
      console.log('Phone entered:', phoneNumber);
      console.log('Phone sent to API:', cleanPhone);
      console.log('Provider:', mobileProvider);
      console.log('Amount:', amount, 'FCFA');
      console.log('Plan:', plan.id);

      const response = await api.initiateS3PPayment({
        amount,
        customerPhone: cleanPhone,
        paymentType: mobileProvider,
        customerName: customerName || 'Client WazeApp',
        description: `Abonnement WazeApp - Plan ${plan.name}`,
      });

      console.log('S3P API Response:', response);

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
          pollMobilePaymentStatus(data.ptn, data.transactionId);
        } else {
          setStatus('failed');
          setError(data.message || 'Le paiement a echoue');
        }
      } else {
        setStatus('failed');
        setError(response.error || 'Erreur lors de l\'initiation du paiement');
      }
    } catch (err) {
      console.error('Mobile payment error:', err);
      setStatus('failed');
      setError('Une erreur est survenue. Veuillez reessayer.');
    }
  };

  const pollMobilePaymentStatus = async (paymentPtn: string, transId: string) => {
    let attempts = 0;
    const maxAttempts = 12;

    const checkStatus = async () => {
      attempts++;

      try {
        const response = await api.verifyPayment({ ptn: paymentPtn, transactionId: transId });

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

        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 10000);
        } else {
          setStatus('pending');
          setError('Le paiement est toujours en attente. Verifiez votre telephone.');
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 10000);
        }
      }
    };

    setTimeout(checkStatus, 10000);
  };

  // ============================================
  // E-NKAP CARD PAYMENT (VISA/MASTERCARD/PAYPAL)
  // ============================================
  const handleCardPayment = async () => {
    if (!plan) return;

    setStatus('processing');
    setError(null);

    try {
      const amount = dynamicPrice || Math.round(plan.price * 655);
      const merchantRef = `WAZEAPP-${plan.id.toUpperCase()}-${Date.now()}`;

      const response = await api.initiateEnkapPayment({
        merchantReference: merchantRef,
        customerName: customerName || 'Client WazeApp',
        customerEmail: customerEmail || 'client@wazeapp.xyz',
        customerPhone: getCleanPhoneNumber() || '237600000000',
        totalAmount: amount,
        currency: 'XAF',
        description: `Abonnement WazeApp - Plan ${plan.name}`,
        items: [{
          id: plan.id,
          name: `Plan ${plan.name}`,
          quantity: 1,
          price: amount,
        }],
        returnUrl: `${window.location.origin}/billing?payment=success&plan=${plan.id}`,
        notificationUrl: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.wazeapp.xyz'}/api/v1/payments/enkap/webhook`,
      });

      if (response.success && response.data) {
        const data = response.data;
        setTransactionRef(data.txid);

        if (data.paymentUrl) {
          setPaymentUrl(data.paymentUrl);
          setStatus('redirecting');
          // Redirect to E-nkap payment page
          setTimeout(() => {
            window.location.href = data.paymentUrl;
          }, 2000);
        } else {
          setStatus('failed');
          setError('URL de paiement non disponible');
        }
      } else {
        setStatus('failed');
        setError(response.error || 'Erreur lors de l\'initiation du paiement');
      }
    } catch (err) {
      console.error('Card payment error:', err);
      setStatus('failed');
      setError('Une erreur est survenue. Veuillez reessayer.');
    }
  };

  const handleBack = () => {
    setPaymentMethod(null);
    setStatus('idle');
    setError(null);
  };

  if (!isOpen || !plan) return null;

  const displayPrice = dynamicPrice || Math.round(plan.price * 655);
  const displayCurrency = currency || 'XAF';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {paymentMethod && status === 'idle' && (
              <button onClick={handleBack} className="text-white/80 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-xl font-bold text-white">
              {!paymentMethod ? 'Choisir le mode de paiement' :
               paymentMethod === 'mobile' ? 'Paiement Mobile Money' : 'Paiement par Carte'}
            </h2>
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
          {/* Status Displays */}
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

          {status === 'redirecting' && (
            <div className="text-center py-8">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Redirection vers la page de paiement...
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Vous allez etre redirige vers E-nkap pour finaliser votre paiement
              </p>
            </div>
          )}

          {status === 'pending' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Confirmez sur votre telephone
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Un message de confirmation a ete envoye au <strong>{phoneNumber}</strong>
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Entrez votre code PIN {mobileProvider === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'} pour confirmer
              </p>
              {ptn && (
                <p className="mt-4 text-xs text-gray-400">Reference: {ptn}</p>
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
                Paiement reussi !
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
                Paiement echoue
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {error || 'Une erreur est survenue lors du paiement'}
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Reessayer
              </button>
            </div>
          )}

          {/* Payment Method Selection */}
          {status === 'idle' && !paymentMethod && (
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
                    {displayPrice.toLocaleString()} {displayCurrency}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {/* Mobile Money Option */}
                <button
                  onClick={() => setPaymentMethod('mobile')}
                  className="w-full p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-yellow-400 dark:hover:border-yellow-500 transition-all flex items-center gap-4 group"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400">
                      Mobile Money
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      MTN MoMo, Orange Money
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">MTN</span>
                    </div>
                    <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">OM</span>
                    </div>
                  </div>
                </button>

                {/* Card Payment Option */}
                <button
                  onClick={() => setPaymentMethod('card')}
                  className="w-full p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-all flex items-center gap-4 group"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      Carte Bancaire
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Visa, Mastercard, PayPal
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-10 h-6 bg-blue-700 rounded flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold italic">VISA</span>
                    </div>
                    <div className="w-10 h-6 bg-red-500 rounded flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">MC</span>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Mobile Money Form */}
          {status === 'idle' && paymentMethod === 'mobile' && (
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
                    {displayPrice.toLocaleString()} {displayCurrency}
                  </span>
                </div>
              </div>

              {/* Provider Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Choisissez votre operateur
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMobileProvider('mtn')}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      mobileProvider === 'mtn'
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-yellow-300'
                    )}
                  >
                    <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">MTN</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">MTN MoMo</span>
                  </button>
                  <button
                    onClick={() => setMobileProvider('orange')}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2',
                      mobileProvider === 'orange'
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-orange-300'
                    )}
                  >
                    <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-xs">Orange</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Orange Money</span>
                  </button>
                </div>
              </div>

              {/* Phone Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Numero de telephone
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
                {mobileProvider && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Operateur detecte: <span className={mobileProvider === 'mtn' ? 'text-yellow-600' : 'text-orange-600'}>
                      {mobileProvider === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'}
                    </span>
                  </p>
                )}
              </div>

              {/* Provider Mismatch Warning */}
              {providerMismatch && (
                <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl mb-4">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Le numero commence par {detectedProvider === 'orange' ? '69 (Orange)' : '67/68 (MTN)'}.
                    Veuillez selectionner le bon operateur.
                  </p>
                </div>
              )}

              {/* Info Message */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-6">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Vous recevrez une demande de confirmation sur votre telephone.
                  Assurez-vous d'avoir suffisamment de solde.
                </p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleMobilePayment}
                disabled={!mobileProvider || phoneNumber.replace(/\D/g, '').length < 9 || !!providerMismatch}
                className={clsx(
                  'w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
                  mobileProvider && phoneNumber.replace(/\D/g, '').length >= 9 && !providerMismatch
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                )}
              >
                <Smartphone className="w-5 h-5" />
                Payer {displayPrice.toLocaleString()} {displayCurrency}
              </button>
            </>
          )}

          {/* Card Payment Form */}
          {status === 'idle' && paymentMethod === 'card' && (
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
                    {displayPrice.toLocaleString()} {displayCurrency}
                  </span>
                </div>
              </div>

              {/* Payment Methods Display */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Methodes de paiement acceptees
                </label>
                <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-9 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center">
                      <span className="text-white text-sm font-bold italic">VISA</span>
                    </div>
                    <span className="text-xs text-gray-500">Visa</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-9 bg-gradient-to-r from-red-500 to-orange-500 rounded flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Mastercard</span>
                    </div>
                    <span className="text-xs text-gray-500">Mastercard</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-9 bg-gradient-to-r from-blue-500 to-blue-700 rounded flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">PayPal</span>
                    </div>
                    <span className="text-xs text-gray-500">PayPal</span>
                  </div>
                </div>
              </div>

              {/* Info Message */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl mb-6">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Vous serez redirige vers la plateforme securisee E-nkap pour finaliser votre paiement.
                </p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleCardPayment}
                className="w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25"
              >
                <CreditCard className="w-5 h-5" />
                Payer {displayPrice.toLocaleString()} {displayCurrency}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
