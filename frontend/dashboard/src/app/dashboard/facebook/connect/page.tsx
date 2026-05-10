'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import {
  Facebook,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Info,
  Clock,
  Filter,
  Bot,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
}

export default function ConnectFacebookPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [pageAccessToken, setPageAccessToken] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [replyDelay, setReplyDelay] = useState(30);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const response = await api.getAgents();

      if (response.success && response.data) {
        setAgents(response.data);
        if (response.data.length > 0) {
          setSelectedAgentId(response.data[0].id);
        }
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching agents:', error);
      }
      toast.error('Failed to load agents');
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pageAccessToken.trim()) {
      toast.error('Please enter a Page Access Token');
      return;
    }

    if (!selectedAgentId) {
      toast.error('Please select an AI agent');
      return;
    }

    try {
      setLoading(true);
      toast.loading('Connecting Facebook page...', { id: 'fb-connect' });

      const keywords = keywordsInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await api.connectFacebookPage({
        pageAccessToken: pageAccessToken.trim(),
        agentId: selectedAgentId,
        autoReplyEnabled,
        replyDelay,
        keywordsFilter: keywords.length > 0 ? keywords : undefined,
      });

      if (response.success) {
        analytics.track('facebook_page_connected', {
          agentId: selectedAgentId,
          autoReplyEnabled,
          hasKeywords: keywords.length > 0,
        });

        toast.success('Facebook page connected successfully!', { id: 'fb-connect' });
        router.push('/dashboard/facebook');
      } else {
        throw new Error(response.error || 'Failed to connect page');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error connecting Facebook page:', error);
      }

      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to connect page';
      toast.error(errorMessage, { id: 'fb-connect', duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

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

        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            <Facebook className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Connect Facebook Page
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Connect your Facebook page to enable AI auto-replies on comments
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              How to get your Page Access Token
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li>
                Go to{' '}
                <a
                  href="https://developers.facebook.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-600 inline-flex items-center"
                >
                  Facebook Developers
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </li>
              <li>Create a new app or select an existing app</li>
              <li>Add the "Facebook Login" product to your app</li>
              <li>Go to Tools &gt; Graph API Explorer</li>
              <li>Select your app and page from the dropdowns</li>
              <li>
                Add these permissions: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pages_read_engagement</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pages_manage_metadata</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pages_show_list</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pages_messaging</code>
              </li>
              <li>Click "Generate Access Token" and copy the token</li>
              <li>Paste the token below</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Connection Form */}
      <form onSubmit={handleConnect} className="space-y-6">
        {/* Page Access Token */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Page Access Token *
          </label>
          <input
            type="text"
            value={pageAccessToken}
            onChange={(e) => setPageAccessToken(e.target.value)}
            placeholder="EAAxxxxxxxxxx..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Your Page Access Token from Facebook Developer Console
          </p>
        </div>

        {/* Select AI Agent */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4" />
              <span>AI Agent *</span>
            </div>
          </label>

          {loadingAgents ? (
            <div className="text-gray-500 dark:text-gray-400">Loading agents...</div>
          ) : agents.length === 0 ? (
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
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                  {agent.description && ` - ${agent.description.substring(0, 50)}`}
                </option>
              ))}
            </select>
          )}
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This AI agent will respond to comments on your Facebook page
          </p>
        </div>

        {/* Auto-Reply Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Auto-Reply Settings
          </h3>

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
                Wait time before replying to comments (0-300 seconds). Recommended: 30s for natural interaction.
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
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex items-center space-x-4">
          <button
            type="submit"
            disabled={loading || agents.length === 0}
            className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Connect Facebook Page</span>
              </>
            )}
          </button>

          <Link
            href="/dashboard/facebook"
            className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
