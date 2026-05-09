'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import {
  Facebook,
  Plus,
  RefreshCw,
  Settings,
  MessageSquare,
  Users,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Crown,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

interface FacebookPage {
  id: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  autoReplyEnabled: boolean;
  replyDelay: number;
  keywordsFilter: string[];
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
  agent?: {
    id: string;
    name: string;
    status: string;
  };
}

interface PageStats {
  totalComments: number;
  totalReplies: number;
  commentsToday: number;
  repliesToday: number;
}

const PLAN_LIMITS = {
  free: 1,
  standard: 1,
  pro: 2,
  enterprise: 5
};

export default function FacebookDashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{[key: string]: PageStats}>({});
  const [userPlan, setUserPlan] = useState<'free' | 'standard' | 'pro' | 'enterprise'>('free');
  const [planLimits, setPlanLimits] = useState({ current: 0, max: 1 });

  useEffect(() => {
    if (user) {
      fetchPages();
      fetchUserPlan();
    }
  }, [user]);

  useEffect(() => {
    setPlanLimits(prev => ({ ...prev, current: pages.length }));
  }, [pages.length]);

  const fetchUserPlan = async () => {
    try {
      const response = await api.get('/subscriptions/usage-summary');

      if (response.success && response.data) {
        const planData = response.data;
        const plan = planData.plan as 'free' | 'standard' | 'pro' | 'enterprise';
        const maxPages = PLAN_LIMITS[plan] || 1;

        setUserPlan(plan);
        setPlanLimits(prev => ({ ...prev, max: maxPages }));
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching user plan:', error);
      }
      // Default to free plan
      setUserPlan('free');
      setPlanLimits({ current: pages.length, max: 1 });
    }
  };

  const fetchPages = async () => {
    try {
      setLoading(true);
      const response = await api.getFacebookPages();

      if (response.success && response.data) {
        setPages(response.data);
        analytics.track('facebook_pages_viewed', { count: response.data.length });
      } else {
        toast.error(response.error || 'Failed to load Facebook pages');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching Facebook pages:', error);
      }
      toast.error('Failed to load Facebook pages');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (pageId: string) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    const confirmed = window.confirm(
      `Are you sure you want to disconnect "${page.pageName}"? This will stop all auto-replies.`
    );

    if (!confirmed) return;

    try {
      toast.loading(`Disconnecting ${page.pageName}...`, { id: 'fb-disconnect' });

      const response = await api.disconnectFacebookPage(pageId);

      if (response.success) {
        await fetchPages();
        analytics.track('facebook_page_disconnected', { pageId });
        toast.success(`${page.pageName} disconnected successfully`, { id: 'fb-disconnect' });
      } else {
        throw new Error(response.error || 'Failed to disconnect page');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error disconnecting page:', error);
      }
      toast.error(error?.message || 'Failed to disconnect page', { id: 'fb-disconnect' });
    }
  };

  const toggleAutoReply = async (pageId: string, currentState: boolean) => {
    const page = pages.find(p => p.id === pageId);
    if (!page) return;

    try {
      const response = await api.updateFacebookPage(pageId, {
        autoReplyEnabled: !currentState
      });

      if (response.success) {
        await fetchPages();
        toast.success(
          !currentState
            ? `Auto-reply enabled for ${page.pageName}`
            : `Auto-reply disabled for ${page.pageName}`
        );
        analytics.track('facebook_auto_reply_toggled', {
          pageId,
          enabled: !currentState
        });
      } else {
        throw new Error(response.error || 'Failed to update settings');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error toggling auto-reply:', error);
      }
      toast.error('Failed to update auto-reply settings');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-lg">Loading Facebook pages...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            <Facebook className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Facebook Pages</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage AI auto-replies for your Facebook page comments
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Current Plan: {userPlan.charAt(0).toUpperCase() + userPlan.slice(1)}
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {planLimits.current} / {planLimits.max} pages connected
            </div>
          </div>

          {pages.length < planLimits.max && (
            <Link
              href="/dashboard/facebook/connect"
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Page</span>
            </Link>
          )}

          {pages.length >= planLimits.max && (
            <div className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-lg">
              <Crown className="w-4 h-4" />
              <span>Upgrade Plan</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Upgrade Banner */}
      {pages.length >= planLimits.max && userPlan !== 'enterprise' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div>
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                  Upgrade to connect more Facebook pages
                </h3>
                <p className="text-purple-700 dark:text-purple-300 text-sm">
                  {userPlan === 'free' && 'Upgrade to Standard for 1 page, Pro for 2 pages, or Enterprise for 5 pages'}
                  {userPlan === 'standard' && 'Upgrade to Pro for 2 pages or Enterprise for 5 pages'}
                  {userPlan === 'pro' && 'Upgrade to Enterprise for up to 5 Facebook pages'}
                </p>
              </div>
            </div>
            <Link
              href="/billing"
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Upgrade Now
            </Link>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {pages.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Facebook className="w-12 h-12 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            No Facebook Pages Connected
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Connect your Facebook page to automatically respond to comments using AI.
            Your AI agent will help engage with your audience 24/7.
          </p>
          <Link
            href="/dashboard/facebook/connect"
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Connect Your First Page</span>
          </Link>
        </div>
      )}

      {/* Pages Grid */}
      {pages.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pages.map((page) => (
            <motion.div
              key={page.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              {/* Page Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <Facebook className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {page.pageName}
                    </h3>
                    <div className="flex items-center space-x-2 mt-1">
                      {page.isActive ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span className={`text-sm ${page.isActive ? 'text-green-600' : 'text-red-600'}`}>
                        {page.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/dashboard/facebook/${page.id}`}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </Link>
              </div>

              {/* Agent Info */}
              {page.agent && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Agent: {page.agent.name}
                    </span>
                  </div>
                </div>
              )}

              {/* Auto-Reply Toggle */}
              <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Auto-Reply</span>
                </div>
                <button
                  onClick={() => toggleAutoReply(page.id, page.autoReplyEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    page.autoReplyEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      page.autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Reply Delay */}
              {page.autoReplyEnabled && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Reply delay: {page.replyDelay}s
                    </span>
                  </div>
                </div>
              )}

              {/* Keywords Filter */}
              {page.keywordsFilter && page.keywordsFilter.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Trigger keywords:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {page.keywordsFilter.slice(0, 3).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                    {page.keywordsFilter.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded">
                        +{page.keywordsFilter.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Last Sync */}
              {page.lastSyncAt && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Last sync: {new Date(page.lastSyncAt).toLocaleString()}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link
                  href={`/dashboard/facebook/${page.id}`}
                  className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Manage</span>
                </Link>
                <button
                  onClick={() => handleDisconnect(page.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Disconnect page"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
