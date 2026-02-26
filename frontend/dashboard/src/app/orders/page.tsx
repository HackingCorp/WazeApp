'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ClipboardList,
  Package,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Clock,
  TrendingUp,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';

interface OrderItem {
  id: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  externalLink?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  source: 'whatsapp' | 'dashboard' | 'api';
  notes?: string;
  deliveryAddress?: string;
  createdAt: string;
}

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  todayRevenue: number;
  monthlyRevenue: number;
  currency: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getOrders({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      });
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setOrders(Array.isArray(data) ? data : data.orders || data.items || []);
        const total = data.total || data.totalPages || 0;
        setTotalPages(data.totalPages || Math.ceil(total / limit) || 1);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching orders:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.getOrderStats();
      if (response.success && response.data) {
        setStats(response.data.data || response.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching order stats:', error);
      }
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200', label: t('orders.statusPending') },
      confirmed: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200', label: t('orders.statusConfirmed') },
      processing: { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-800 dark:text-indigo-200', label: t('orders.statusProcessing') },
      shipped: { bg: 'bg-violet-100 dark:bg-violet-900', text: 'text-violet-800 dark:text-violet-200', label: t('orders.statusShipped') },
      delivered: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', label: t('orders.statusDelivered') },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200', label: t('orders.statusCancelled') },
    };
    const c = config[status] || config.pending;
    return (
      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', c.bg, c.text)}>
        {c.label}
      </span>
    );
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'whatsapp': return t('orders.sourceWhatsapp');
      case 'dashboard': return t('orders.sourceDashboard');
      case 'api': return t('orders.sourceApi');
      default: return source;
    }
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return `${amount.toLocaleString()} ${currency || 'XAF'}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('orders.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {t('orders.subtitle')}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('orders.totalOrders')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalOrders}</p>
                </div>
                <ClipboardList className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('orders.pendingOrders')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingOrders}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('orders.todayRevenue')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.todayRevenue, stats.currency)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('orders.monthlyRevenue')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.monthlyRevenue, stats.currency)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-500" />
              </div>
            </div>
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
                  placeholder={t('orders.searchOrders')}
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
                <option value="">{t('orders.allStatuses')}</option>
                <option value="pending">{t('orders.statusPending')}</option>
                <option value="confirmed">{t('orders.statusConfirmed')}</option>
                <option value="processing">{t('orders.statusProcessing')}</option>
                <option value="shipped">{t('orders.statusShipped')}</option>
                <option value="delivered">{t('orders.statusDelivered')}</option>
                <option value="cancelled">{t('orders.statusCancelled')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Loading...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('orders.noOrders')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                {t('orders.noOrdersDesc')}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.orderNumber')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.client')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.items')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.total')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.status')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.source')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('orders.date')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">
                            {order.orderNumber}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {order.customerName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {order.customerPhone}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center">
                            <Package className="w-4 h-4 text-gray-400 mr-1" />
                            <span className="text-sm text-gray-900 dark:text-white">
                              {order.items?.length || 0}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatCurrency(order.totalAmount, order.currency)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {getSourceLabel(order.source)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>
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
