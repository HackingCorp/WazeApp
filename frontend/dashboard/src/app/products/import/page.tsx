'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Store,
  ShoppingCart,
  ExternalLink,
  Loader2,
  Globe,
} from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function ImportProductsPage() {
  const router = useRouter();
  const { t } = useI18n();

  // Shopify state
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [connectingShopify, setConnectingShopify] = useState(false);

  // WooCommerce state
  const [wooUrl, setWooUrl] = useState('');
  const [wooKey, setWooKey] = useState('');
  const [wooSecret, setWooSecret] = useState('');
  const [connectingWoo, setConnectingWoo] = useState(false);

  // E-Market state
  const [eMarketUrl, setEMarketUrl] = useState('');
  const [eMarketAuthMethod, setEMarketAuthMethod] = useState<'api_key' | 'bearer' | 'oauth2'>('api_key');
  const [eMarketApiKey, setEMarketApiKey] = useState('');
  const [eMarketClientId, setEMarketClientId] = useState('');
  const [eMarketClientSecret, setEMarketClientSecret] = useState('');
  const [eMarketTokenUrl, setEMarketTokenUrl] = useState('');
  const [connectingEMarket, setConnectingEMarket] = useState(false);

  const handleConnectShopify = async () => {
    if (!shopifyDomain.trim()) {
      toast.error('Please enter your Shopify store domain');
      return;
    }

    setConnectingShopify(true);
    try {
      const response = await api.connectShopifyStore(shopifyDomain.trim());
      if (response.success && response.data) {
        const authUrl = response.data.data?.authUrl || response.data.authUrl;
        if (authUrl) {
          window.location.href = authUrl;
        } else {
          toast.success(t('products.storeConnected'));
          router.push('/products/stores');
        }
      } else {
        toast.error(response.error || 'Failed to connect Shopify store');
      }
    } catch {
      toast.error('Failed to connect Shopify store');
    } finally {
      setConnectingShopify(false);
    }
  };

  const handleConnectWooCommerce = async () => {
    if (!wooUrl.trim() || !wooKey.trim() || !wooSecret.trim()) {
      toast.error('Please fill in all WooCommerce fields');
      return;
    }

    setConnectingWoo(true);
    try {
      const response = await api.connectWooCommerceStore({
        storeUrl: wooUrl.trim(),
        consumerKey: wooKey.trim(),
        consumerSecret: wooSecret.trim(),
      });
      if (response.success) {
        toast.success(t('products.storeConnected'));
        router.push('/products/stores');
      } else {
        toast.error(response.error || 'Failed to connect WooCommerce store');
      }
    } catch {
      toast.error('Failed to connect WooCommerce store');
    } finally {
      setConnectingWoo(false);
    }
  };

  const handleConnectEMarket = async () => {
    if (!eMarketUrl.trim()) {
      toast.error(t('products.eMarketFillFields') || 'Please fill in all E-Market fields');
      return;
    }

    if (eMarketAuthMethod === 'oauth2') {
      if (!eMarketClientId.trim() || !eMarketClientSecret.trim() || !eMarketTokenUrl.trim()) {
        toast.error('Please fill in Client ID, Client Secret, and Token URL');
        return;
      }
    } else if (!eMarketApiKey.trim()) {
      toast.error(t('products.eMarketFillFields') || 'Please fill in all E-Market fields');
      return;
    }

    setConnectingEMarket(true);
    try {
      const response = await api.connectEMarketStore({
        storeUrl: eMarketUrl.trim(),
        authMethod: eMarketAuthMethod,
        apiKey: eMarketApiKey.trim() || undefined,
        clientId: eMarketClientId.trim() || undefined,
        clientSecret: eMarketClientSecret.trim() || undefined,
        tokenUrl: eMarketTokenUrl.trim() || undefined,
      });
      if (response.success) {
        toast.success(t('products.storeConnected'));
        router.push('/products/stores');
      } else {
        toast.error(response.error || 'Failed to connect E-Market store');
      }
    } catch {
      toast.error('Failed to connect E-Market store');
    } finally {
      setConnectingEMarket(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <button
            onClick={() => router.push('/products')}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('products.import')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('products.connectStore')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Shopify Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('products.connectShopify')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Import products from Shopify
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.shopifyDomain')}
                </label>
                <input
                  type="text"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  placeholder={t('products.shopifyDomainPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <button
                onClick={handleConnectShopify}
                disabled={connectingShopify || !shopifyDomain.trim()}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {connectingShopify ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                {t('products.connectShopify')}
              </button>
            </div>
          </div>

          {/* WooCommerce Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Store className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('products.connectWooCommerce')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Import products from WooCommerce
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.wooCommerceUrl')}
                </label>
                <input
                  type="text"
                  value={wooUrl}
                  onChange={(e) => setWooUrl(e.target.value)}
                  placeholder={t('products.wooCommerceUrlPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.consumerKey')}
                </label>
                <input
                  type="text"
                  value={wooKey}
                  onChange={(e) => setWooKey(e.target.value)}
                  placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.consumerSecret')}
                </label>
                <input
                  type="password"
                  value={wooSecret}
                  onChange={(e) => setWooSecret(e.target.value)}
                  placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <button
                onClick={handleConnectWooCommerce}
                disabled={connectingWoo || !wooUrl.trim() || !wooKey.trim() || !wooSecret.trim()}
                className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {connectingWoo ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Store className="w-4 h-4 mr-2" />
                )}
                {t('products.connectWooCommerce')}
              </button>
            </div>
          </div>

          {/* E-Market Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('products.connectEMarket')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('products.eMarketDescription')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.eMarketUrl')}
                </label>
                <input
                  type="text"
                  value={eMarketUrl}
                  onChange={(e) => setEMarketUrl(e.target.value)}
                  placeholder={t('products.eMarketUrlPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('products.eMarketAuthMethod') || 'Authentication Method'}
                </label>
                <select
                  value={eMarketAuthMethod}
                  onChange={(e) => setEMarketAuthMethod(e.target.value as 'api_key' | 'bearer' | 'oauth2')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="api_key">API Key (X-API-Key)</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="oauth2">OAuth2 (Client Credentials)</option>
                </select>
              </div>

              {eMarketAuthMethod !== 'oauth2' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {eMarketAuthMethod === 'bearer' ? 'Bearer Token' : (t('products.eMarketApiKey') || 'API Key')}
                  </label>
                  <input
                    type="password"
                    value={eMarketApiKey}
                    onChange={(e) => setEMarketApiKey(e.target.value)}
                    placeholder={t('products.eMarketApiKeyPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              )}

              {eMarketAuthMethod === 'oauth2' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Token URL
                    </label>
                    <input
                      type="text"
                      value={eMarketTokenUrl}
                      onChange={(e) => setEMarketTokenUrl(e.target.value)}
                      placeholder="https://auth.example.com/oauth/token"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={eMarketClientId}
                      onChange={(e) => setEMarketClientId(e.target.value)}
                      placeholder="your-client-id"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      value={eMarketClientSecret}
                      onChange={(e) => setEMarketClientSecret(e.target.value)}
                      placeholder="your-client-secret"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </>
              )}

              <button
                onClick={handleConnectEMarket}
                disabled={connectingEMarket || !eMarketUrl.trim() || (eMarketAuthMethod !== 'oauth2' && !eMarketApiKey.trim()) || (eMarketAuthMethod === 'oauth2' && (!eMarketClientId.trim() || !eMarketClientSecret.trim() || !eMarketTokenUrl.trim()))}
                className="w-full flex items-center justify-center px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {connectingEMarket ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4 mr-2" />
                )}
                {t('products.connectEMarket')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
