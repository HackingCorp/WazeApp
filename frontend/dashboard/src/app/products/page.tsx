'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  ShoppingCart,
  Package,
  Trash2,
  Edit,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Store,
  Upload,
  CheckCircle,
  AlertCircle,
  Archive,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  sku?: string;
  stockQuantity: number;
  inStock: boolean;
  status: 'active' | 'draft' | 'archived';
  type?: 'product' | 'service';
  source: 'manual' | 'shopify' | 'woocommerce' | 'emarket';
  images?: { url: string; isPrimary: boolean }[];
  categories?: { id: string; name: string }[];
  createdAt: string;
}

interface ProductStats {
  total: number;
  active: number;
  fromShopify: number;
  fromWooCommerce: number;
  fromEmarket: number;
}

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [stores, setStores] = useState<{id: string; name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showActions, setShowActions] = useState<string | null>(null);
  const limit = 20;

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getProducts({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        type: typeFilter || undefined,
        storeId: storeFilter || undefined,
        page,
        limit,
      });
      if (response.success && response.data) {
        const data = response.data;
        const items = Array.isArray(data) ? data : (data.data || data.items || []);
        // Use pagination metadata from API response (preserved from backend { data, total, page, limit })
        const total = response.total || (Array.isArray(data) ? data.length : (data.total || items.length || 0));
        setProducts(items);
        setTotalPages(Math.ceil(total / limit) || 1);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching products:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, sourceFilter, typeFilter, storeFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.getProductStats();
      if (response.success && response.data) {
        const raw = response.data.data || response.data;
        // Map bySource to expected fields
        const bySource = raw.bySource || {};
        setStats({
          total: raw.total || 0,
          active: raw.active || 0,
          fromShopify: bySource.shopify || raw.fromShopify || 0,
          fromWooCommerce: bySource.woocommerce || raw.fromWooCommerce || 0,
          fromEmarket: bySource.emarket || raw.fromEmarket || 0,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching stats:', error);
      }
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await api.getEcommerceStores();
        if (res.success && res.data) {
          const data = res.data.data || res.data;
          setStores(Array.isArray(data) ? data : []);
        }
      } catch {}
    };
    fetchStores();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('products.confirmDelete'))) return;
    try {
      const response = await api.deleteProduct(id);
      if (response.success) {
        toast.success(t('products.productDeleted'));
        fetchProducts();
        fetchStats();
      } else {
        toast.error(response.error || 'Error');
      }
    } catch {
      toast.error('Error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('products.confirmDelete'))) return;
    try {
      const response = await api.bulkDeleteProducts(selectedIds);
      if (response.success) {
        toast.success(t('products.productDeleted'));
        setSelectedIds([]);
        fetchProducts();
        fetchStats();
      }
    } catch {
      toast.error('Error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            {t('products.active')}
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            {t('products.draft')}
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            <Archive className="w-3 h-3 mr-1" />
            {t('products.archived')}
          </span>
        );
      default:
        return null;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'shopify':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            {t('products.shopify')}
          </span>
        );
      case 'woocommerce':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {t('products.woocommerce')}
          </span>
        );
      case 'emarket':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            E-Market
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            {t('products.manual')}
          </span>
        );
    }
  };

  const getTypeBadge = (type?: string) => {
    if (type === 'service') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          {t('products.productTypeService')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">
        {t('products.productTypeProduct')}
      </span>
    );
  };

  const getPrimaryImage = (product: Product) => {
    const primary = product.images?.find(img => img.isPrimary);
    return primary?.url || product.images?.[0]?.url;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('products.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {t('products.subtitle')}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push('/products/stores')}
              className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Store className="w-4 h-4 mr-2" />
              {t('products.manageStores')}
            </button>
            <button
              onClick={() => router.push('/products/import')}
              className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              {t('products.import')}
            </button>
            <button
              onClick={() => router.push('/products/new')}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('products.create')}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('products.totalProducts')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('products.activeProducts')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('products.fromShopify')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.fromShopify}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-purple-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('products.fromWooCommerce')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.fromWooCommerce}</p>
                </div>
                <Store className="w-8 h-8 text-indigo-500" />
              </div>
            </div>
            {(stats.fromEmarket > 0) && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Depuis E-Market</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.fromEmarket}</p>
                  </div>
                  <ShoppingCart className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('products.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="lg:w-48">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('products.allStatus')}</option>
                <option value="active">{t('products.active')}</option>
                <option value="draft">{t('products.draft')}</option>
                <option value="archived">{t('products.archived')}</option>
              </select>
            </div>
            <div className="lg:w-48">
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('products.allSources')}</option>
                <option value="manual">{t('products.manual')}</option>
                <option value="shopify">{t('products.shopify')}</option>
                <option value="woocommerce">{t('products.woocommerce')}</option>
                <option value="emarket">E-Market</option>
              </select>
            </div>
            <div className="lg:w-48">
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('products.allTypes')}</option>
                <option value="product">{t('products.productTypeProduct')}</option>
                <option value="service">{t('products.productTypeService')}</option>
              </select>
            </div>
            <div className="lg:w-48">
              <select
                value={storeFilter}
                onChange={(e) => { setStoreFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">{t('products.allCatalogs')}</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 flex items-center justify-between">
            <span className="text-sm text-blue-800 dark:text-blue-200">
              {selectedIds.length} {t('products.selected')}
            </span>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBulkDelete}
                className="flex items-center px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {t('products.bulkDelete')}
              </button>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Loading...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('products.noProductsYet')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                {t('products.getStarted')}
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={() => router.push('/products/new')}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('products.create')}
                </button>
                <button
                  onClick={() => router.push('/products/import')}
                  className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t('products.import')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === products.length && products.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.name')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.productType')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.price')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.stock')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.source')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('products.status')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                              {getPrimaryImage(product) ? (
                                <img
                                  src={getPrimaryImage(product)}
                                  alt={product.name}
                                  className="w-10 h-10 object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 flex items-center justify-center">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {product.name}
                              </p>
                              {product.sku && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  SKU: {product.sku}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getTypeBadge(product.type)}
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {product.price.toLocaleString()} {product.currency}
                            </p>
                            {product.compareAtPrice && product.compareAtPrice > product.price && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-through">
                                {product.compareAtPrice.toLocaleString()} {product.currency}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={clsx(
                            'text-sm font-medium',
                            product.inStock ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          )}>
                            {product.inStock ? `${product.stockQuantity} ${t('products.inStock').toLowerCase()}` : t('products.outOfStock')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {getSourceBadge(product.source)}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(product.status)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() => setShowActions(showActions === product.id ? null : product.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {showActions === product.id && (
                              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                                <button
                                  onClick={() => { router.push(`/products/${product.id}/edit`); setShowActions(null); }}
                                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t('products.edit')}
                                </button>
                                <button
                                  onClick={() => { handleDelete(product.id); setShowActions(null); }}
                                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('products.delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Page {page} / {totalPages}
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
