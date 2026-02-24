'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Store,
  ShoppingCart,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
  Loader2,
  Unplug,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface EcommerceStore {
  id: string;
  name: string;
  platform: 'shopify' | 'woocommerce';
  storeUrl: string;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  productCount: number;
  lastSyncAt?: string;
  createdAt: string;
}

export default function StoresPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [stores, setStores] = useState<EcommerceStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      const response = await api.getEcommerceStores();
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setStores(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching stores:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleSync = async (storeId: string) => {
    setSyncingStoreId(storeId);
    try {
      const response = await api.syncStore(storeId);
      if (response.success) {
        toast.success('Sync started');
        // Poll for sync status
        const pollInterval = setInterval(async () => {
          const statusRes = await api.getStoreSyncStatus(storeId);
          if (statusRes.success) {
            const syncData = statusRes.data.data || statusRes.data;
            if (syncData.status !== 'syncing') {
              clearInterval(pollInterval);
              setSyncingStoreId(null);
              fetchStores();
              if (syncData.status === 'completed') {
                toast.success(`Sync complete: ${syncData.productsImported || 0} ${t('products.productsImported')}`);
              }
            }
          } else {
            clearInterval(pollInterval);
            setSyncingStoreId(null);
          }
        }, 3000);

        // Safety timeout
        setTimeout(() => {
          clearInterval(pollInterval);
          setSyncingStoreId(null);
        }, 120000);
      } else {
        toast.error(response.error || 'Sync failed');
        setSyncingStoreId(null);
      }
    } catch {
      toast.error('Sync failed');
      setSyncingStoreId(null);
    }
  };

  const handleDisconnect = async (storeId: string) => {
    if (!window.confirm('Are you sure you want to disconnect this store?')) return;
    try {
      const response = await api.disconnectStore(storeId);
      if (response.success) {
        toast.success(t('products.storeDisconnected'));
        fetchStores();
      } else {
        toast.error(response.error || 'Failed to disconnect');
      }
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t('products.connected')}
          </span>
        );
      case 'syncing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {t('products.syncing')}
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            {t('products.error')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            <Clock className="w-3 h-3 mr-1" />
            {t('products.disconnected')}
          </span>
        );
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'shopify':
        return <ShoppingCart className="w-6 h-6 text-green-600" />;
      case 'woocommerce':
        return <Store className="w-6 h-6 text-purple-600" />;
      default:
        return <Store className="w-6 h-6 text-gray-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/products')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('products.stores')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('products.manageStores')}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/products/import')}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('products.connectStore')}
          </button>
        </div>

        {/* Stores List */}
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="text-gray-500 dark:text-gray-400 mt-4">Loading stores...</p>
          </div>
        ) : stores.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center">
            <Store className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No stores connected
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Connect your Shopify or WooCommerce store to import products.
            </p>
            <button
              onClick={() => router.push('/products/import')}
              className="flex items-center mx-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('products.connectStore')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => (
              <div
                key={store.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                      {getPlatformIcon(store.platform)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {store.name}
                        </h3>
                        {getStatusBadge(store.status)}
                      </div>
                      <div className="flex items-center space-x-4 mt-1">
                        <a
                          href={store.storeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
                        >
                          {store.storeUrl}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {store.productCount} {t('products.productsImported')}
                        </span>
                        {store.lastSyncAt && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {t('products.lastSync')}: {new Date(store.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSync(store.id)}
                      disabled={syncingStoreId === store.id || store.status === 'disconnected'}
                      className={clsx(
                        'flex items-center px-3 py-2 text-sm rounded-lg transition-colors',
                        syncingStoreId === store.id
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                        (store.status === 'disconnected') && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <RefreshCw className={clsx('w-4 h-4 mr-1', syncingStoreId === store.id && 'animate-spin')} />
                      {syncingStoreId === store.id ? t('products.syncing') : t('products.syncNow')}
                    </button>
                    <button
                      onClick={() => handleDisconnect(store.id)}
                      className="flex items-center px-3 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                    >
                      <Unplug className="w-4 h-4 mr-1" />
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
