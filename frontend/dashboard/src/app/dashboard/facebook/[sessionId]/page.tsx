'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import {
  Facebook,
  ArrowLeft,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Filter,
  Bot,
  Save,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

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

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
}

export default function FacebookPageDetail() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { user } = useAuth();
  const { t } = useI18n();

  const [page, setPage] = useState<FacebookPage | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [replyDelay, setReplyDelay] = useState(30);
  const [keywordsInput, setKeywordsInput] = useState('');

  useEffect(() => {
    if (sessionId) {
      fetchPageDetails();
      fetchAgents();
    }
  }, [sessionId]);

  const fetchPageDetails = async () => {
    try {
      setLoading(true);
      const response = await api.getFacebookPage(sessionId);

      if (response.success && response.data) {
        const pageData = response.data;
        setPage(pageData);

        // Set form values
        setSelectedAgentId(pageData.agent?.id || '');
        setAutoReplyEnabled(pageData.autoReplyEnabled);
        setReplyDelay(pageData.replyDelay);
        setKeywordsInput(pageData.keywordsFilter?.join(', ') || '');

        analytics.track('facebook_page_detail_viewed', { pageId: sessionId });
      } else {
        toast.error(response.error || 'Failed to load page details');
        router.push('/dashboard/facebook');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching page details:', error);
      }
      toast.error('Failed to load page details');
      router.push('/dashboard/facebook');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await api.getAgents();

      if (response.success && response.data) {
        setAgents(response.data);
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching agents:', error);
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAgentId) {
      toast.error('Please select an AI agent');
      return;
    }

    try {
      setSaving(true);
      toast.loading('Saving settings...', { id: 'fb-save' });

      const keywords = keywordsInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await api.updateFacebookPage(sessionId, {
        agentId: selectedAgentId,
        autoReplyEnabled,
        replyDelay,
        keywordsFilter: keywords.length > 0 ? keywords : [],
      });

      if (response.success) {
        analytics.track('facebook_page_settings_updated', {
          pageId: sessionId,
          autoReplyEnabled,
          hasKeywords: keywords.length > 0,
        });

        toast.success('Settings saved successfully!', { id: 'fb-save' });
        await fetchPageDetails();
      } else {
        throw new Error(response.error || 'Failed to save settings');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error saving settings:', error);
      }
      toast.error(error?.message || 'Failed to save settings', { id: 'fb-save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!page) return;

    const confirmed = window.confirm(
      `Are you sure you want to disconnect "${page.pageName}"? This will stop all auto-replies and remove the page from your account.`
    );

    if (!confirmed) return;

    try {
      toast.loading(`Disconnecting ${page.pageName}...`, { id: 'fb-disconnect' });

      const response = await api.disconnectFacebookPage(sessionId);

      if (response.success) {
        analytics.track('facebook_page_disconnected', { pageId: sessionId });
        toast.success(`${page.pageName} disconnected successfully`, { id: 'fb-disconnect' });
        router.push('/dashboard/facebook');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-lg">Loading page details...</span>
      </div>
    );
  }

  if (!page) {
    return null;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/facebook"
          className="inline-flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Facebook Pages</span>
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Facebook className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {page.pageName}
              </h1>
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

          <button
            onClick={handleDisconnect}
            className="flex items-center space-x-2 px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Page Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Page Information</h2>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Page ID:</span>
            <span className="text-gray-900 dark:text-white font-mono">{page.pageId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Connected:</span>
            <span className="text-gray-900 dark:text-white">
              {new Date(page.createdAt).toLocaleDateString()}
            </span>
          </div>
          {page.lastSyncAt && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Last Sync:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(page.lastSyncAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* AI Agent Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Agent</h2>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4" />
              <span>Select Agent *</span>
            </div>
          </label>

          {agents.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No AI agents found. Please create an agent first.
                  </p>
                  <Link
                    href="/agents/new"
                    className="text-sm text-yellow-600 dark:text-yellow-400 hover:underline mt-1 inline-block"
                  >
                    Create your first agent
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.description && ` - ${agent.description.substring(0, 50)}`}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This AI agent will respond to comments on your Facebook page
              </p>
            </>
          )}
        </div>

        {/* Auto-Reply Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Auto-Reply Settings
          </h2>

          {/* Auto-Reply Toggle */}
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <div className="font-medium text-gray-900 dark:text-white">Enable Auto-Reply</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Automatically respond to comments with AI
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoReplyEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Reply Delay */}
          {autoReplyEnabled && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>Reply Delay (seconds)</span>
                </div>
              </label>
              <input
                type="number"
                value={replyDelay}
                onChange={(e) => setReplyDelay(parseInt(e.target.value) || 0)}
                min="0"
                max="300"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Wait time before replying to comments (0-300 seconds)
              </p>
            </div>
          )}

          {/* Keywords Filter */}
          {autoReplyEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4" />
                  <span>Trigger Keywords (Optional)</span>
                </div>
              </label>
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="help, support, question (comma-separated)"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Only reply to comments containing these keywords. Leave empty to reply to all comments.
              </p>

              {keywordsInput && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {keywordsInput.split(',').map((keyword, idx) => (
                    keyword.trim() && (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded"
                      >
                        {keyword.trim()}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex items-center space-x-4">
          <button
            type="submit"
            disabled={saving || agents.length === 0}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Stats Section (Placeholder) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5" />
          <span>Recent Activity</span>
        </h2>

        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Comment and reply statistics will appear here</p>
        </div>
      </div>
    </div>
  );
}
