'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  externalLink?: string;
}

interface OrderTimeline {
  status: string;
  timestamp: string;
  note?: string;
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
  cancellationReason?: string;
  timeline?: OrderTimeline[];
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const orderId = params.id as string;

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getOrder(orderId);
      if (response.success && response.data) {
        setOrder(response.data.data || response.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching order:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusUpdate = async (newStatus: string, reason?: string) => {
    setIsUpdating(true);
    try {
      const response = await api.updateOrderStatus(orderId, newStatus, reason);
      if (response.success) {
        toast.success(`Order ${newStatus}`);
        fetchOrder();
        setShowCancelDialog(false);
        setCancelReason('');
      } else {
        toast.error(response.error || 'Error updating status');
      }
    } catch {
      toast.error('Error updating status');
    } finally {
      setIsUpdating(false);
    }
  };

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
      <span className={clsx('inline-flex items-center px-3 py-1 rounded-full text-sm font-medium', c.bg, c.text)}>
        {c.label}
      </span>
    );
  };

  const getTimelineIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'processing': return <Package className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('orders.statusPending'),
      confirmed: t('orders.statusConfirmed'),
      processing: t('orders.statusProcessing'),
      shipped: t('orders.statusShipped'),
      delivered: t('orders.statusDelivered'),
      cancelled: t('orders.statusCancelled'),
    };
    return labels[status] || status;
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return `${amount.toLocaleString()} ${currency || 'XAF'}`;
  };

  const getActionButtons = () => {
    if (!order) return null;
    const buttons: React.ReactNode[] = [];

    switch (order.status) {
      case 'pending':
        buttons.push(
          <button
            key="confirm"
            onClick={() => handleStatusUpdate('confirmed')}
            disabled={isUpdating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {t('orders.confirmOrder')}
          </button>
        );
        break;
      case 'confirmed':
        buttons.push(
          <button
            key="process"
            onClick={() => handleStatusUpdate('processing')}
            disabled={isUpdating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {t('orders.processOrder')}
          </button>
        );
        break;
      case 'processing':
        buttons.push(
          <button
            key="ship"
            onClick={() => handleStatusUpdate('shipped')}
            disabled={isUpdating}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {t('orders.shipOrder')}
          </button>
        );
        break;
      case 'shipped':
        buttons.push(
          <button
            key="deliver"
            onClick={() => handleStatusUpdate('delivered')}
            disabled={isUpdating}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {t('orders.deliverOrder')}
          </button>
        );
        break;
    }

    if (order.status !== 'cancelled' && order.status !== 'delivered') {
      buttons.push(
        <button
          key="cancel"
          onClick={() => setShowCancelDialog(true)}
          disabled={isUpdating}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {t('orders.cancelOrder')}
        </button>
      );
    }

    return buttons;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Order not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/orders')}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {t('orders.orderNumber')}{order.orderNumber}
                </h1>
                {getStatusBadge(order.status)}
              </div>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {getActionButtons()}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Items + Client */}
          <div className="lg:col-span-2 space-y-6">
            {/* Items Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('orders.items')}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {t('orders.productName')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {t('orders.quantity')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {t('orders.unitPrice')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {t('orders.itemTotal')}
                      </th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.productName}
                            </p>
                            {item.variantName && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {item.variantName}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          {formatCurrency(item.unitPrice, order.currency)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency(item.totalPrice, order.currency)}
                        </td>
                        <td className="px-6 py-4">
                          {item.externalLink && (
                            <a
                              href={item.externalLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white text-right">
                        {t('orders.total')}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">
                        {formatCurrency(order.totalAmount, order.currency)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  {t('orders.notes')}
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Right column: Client info + Timeline */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('orders.client')}
              </h2>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900 dark:text-white">{order.customerName}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900 dark:text-white">{order.customerPhone}</span>
                </div>
                {order.deliveryAddress && (
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm text-gray-900 dark:text-white">{order.deliveryAddress}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('orders.orderTimeline')}
              </h2>
              <div className="space-y-4">
                {order.timeline && order.timeline.length > 0 ? (
                  order.timeline.map((entry, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-0.5 text-gray-400">
                        {getTimelineIcon(entry.status)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getStatusLabel(entry.status)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(entry.timestamp).toLocaleString()}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{entry.note}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5 text-gray-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {getStatusLabel('pending')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cancellation reason */}
            {order.cancellationReason && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{t('orders.cancellationReason')}</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{order.cancellationReason}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('orders.cancelOrder')}
            </h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('orders.cancellationReason')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
              rows={3}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowCancelDialog(false); setCancelReason(''); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('orders.confirmOrder')}
              </button>
              <button
                onClick={() => handleStatusUpdate('cancelled', cancelReason)}
                disabled={isUpdating}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {t('orders.cancelOrder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
