'use client';

import React, { useState, useEffect } from 'react';
import { Gift, Clock, ShoppingCart, Sparkles, AlertTriangle } from 'lucide-react';
import { apiHelpers } from '@/lib/api';
import dynamic from 'next/dynamic';

const MessageCreditsPurchaseModal = dynamic(() => import('./MessageCreditsPurchaseModal').then(mod => mod.MessageCreditsPurchaseModal), { ssr: false });

interface CreditsSummary {
  totalAvailable: number;
  totalUsed: number;
  activeCredits: Array<{
    id: string;
    remaining: number;
    expiresAt: string;
    purchasedAt: string;
  }>;
  expiredCredits: number;
  nextExpiration?: {
    amount: number;
    date: string;
  };
}

interface BonusCreditsWidgetProps {
  variant?: 'compact' | 'full';
  onRefresh?: () => void;
  // Optional: Pre-loaded bonus credits data from parent (e.g., from quota API)
  preloadedCredits?: {
    available: number;
    used: number;
  };
}

export function BonusCreditsWidget({ variant = 'full', onRefresh, preloadedCredits }: BonusCreditsWidgetProps) {
  // Initialize with preloaded data if available, otherwise default values
  const [credits, setCredits] = useState<CreditsSummary>(() => {
    if (preloadedCredits) {
      return {
        totalAvailable: preloadedCredits.available,
        totalUsed: preloadedCredits.used,
        activeCredits: [],
        expiredCredits: 0,
      };
    }
    return {
      totalAvailable: 0,
      totalUsed: 0,
      activeCredits: [],
      expiredCredits: 0,
    };
  });
  const [loading, setLoading] = useState(!preloadedCredits);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Update credits when preloadedCredits changes
  useEffect(() => {
    if (preloadedCredits) {
      setCredits(prev => ({
        ...prev,
        totalAvailable: preloadedCredits.available,
        totalUsed: preloadedCredits.used,
      }));
      setLoading(false);
    }
  }, [preloadedCredits]);

  useEffect(() => {
    // Only load from API if no preloaded data
    if (!preloadedCredits) {
      loadCredits();
    }
  }, [preloadedCredits]);

  const loadCredits = async () => {
    try {
      setLoading(true);
      const response = await apiHelpers.messageCredits.getSummary();
      if (response.success && response.data) {
        setCredits(response.data);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load bonus credits:', err);
      }
      // Keep default values on error - don't crash the component
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseSuccess = () => {
    loadCredits();
    onRefresh?.();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getDaysUntilExpiration = (dateStr: string) => {
    const expDate = new Date(dateStr);
    const now = new Date();
    const diffTime = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  // Compact version - just shows available credits and buy button
  if (variant === 'compact') {
    return (
      <>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
            <Gift className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
              {(credits.totalAvailable ?? 0).toLocaleString()} bonus
            </span>
          </div>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-medium rounded-full hover:from-emerald-600 hover:to-green-600 transition-colors flex items-center gap-1"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Acheter
          </button>
        </div>

        <MessageCreditsPurchaseModal
          isOpen={showPurchaseModal}
          onClose={() => setShowPurchaseModal(false)}
          onSuccess={handlePurchaseSuccess}
        />
      </>
    );
  }

  // Full version - shows complete bonus credits info
  return (
    <>
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl shadow-lg border border-purple-200 dark:border-purple-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Gift className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Messages Bonus
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Utilisés en priorité
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-medium rounded-lg hover:from-emerald-600 hover:to-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/25"
          >
            <ShoppingCart className="w-4 h-4" />
            Acheter
          </button>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Disponibles</span>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {(credits.totalAvailable ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Utilises</span>
            </div>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {(credits.totalUsed ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Next Expiration Warning */}
        {credits.nextExpiration && getDaysUntilExpiration(credits.nextExpiration.date) <= 7 && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Expiration proche
              </p>
              <p className="text-amber-600 dark:text-amber-400">
                {credits.nextExpiration.amount.toLocaleString()} messages expirent le {formatDate(credits.nextExpiration.date)}
              </p>
            </div>
          </div>
        )}

        {/* Active Credits List */}
        {credits.activeCredits && credits.activeCredits.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Packs actifs
            </p>
            {credits.activeCredits.slice(0, 3).map((credit) => {
              const daysLeft = getDaysUntilExpiration(credit.expiresAt);
              return (
                <div
                  key={credit.id}
                  className="flex items-center justify-between p-2 bg-white/40 dark:bg-gray-800/40 rounded-lg"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {credit.remaining.toLocaleString()} messages
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    daysLeft <= 3
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : daysLeft <= 7
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {daysLeft > 0 ? `${daysLeft}j restants` : 'Expire bientot'}
                  </span>
                </div>
              );
            })}
            {credits.activeCredits.length > 3 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                +{credits.activeCredits.length - 3} autres packs
              </p>
            )}
          </div>
        )}

        {/* No credits message */}
        {(!credits.activeCredits || credits.activeCredits.length === 0) && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Aucun message bonus disponible
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Achetez des messages supplementaires pour eviter de depasser votre quota mensuel
            </p>
          </div>
        )}
      </div>

      <MessageCreditsPurchaseModal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onSuccess={handlePurchaseSuccess}
      />
    </>
  );
}
