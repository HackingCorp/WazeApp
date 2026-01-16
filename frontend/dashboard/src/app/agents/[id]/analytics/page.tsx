'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  MessageSquare,
  Clock,
  ThumbsUp,
  CheckCircle,
  Users,
  TrendingUp,
  Bot,
  Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  conversationsCount?: number;
}

interface ConversationStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  totalMessages: number;
  avgDuration: number;
  avgMessages: number;
  avgResponseTime: number;
  satisfactionScore: number;
  resolutionRate: number;
}

export default function AgentAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params?.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (agentId) {
      loadData();
    }
  }, [agentId]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Load agent info and stats in parallel
      const [agentResponse, statsResponse] = await Promise.all([
        api.get(`/agents/${agentId}`),
        api.getAgentStats(agentId),
      ]);

      setAgent(agentResponse.data || agentResponse);
      setStats(statsResponse.data || statsResponse);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatResponseTime = (seconds: number) => {
    if (seconds < 1) return '< 1s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Agent not found</h2>
          <button
            onClick={() => router.push('/agents')}
            className="text-emerald-600 hover:text-emerald-700"
          >
            Return to agents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/agents')}
          className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Agents
        </button>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {agent.name} - Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {agent.description || 'Performance statistics and metrics'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Conversations */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {stats?.total || 0}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Conversations</p>
        </div>

        {/* Total Messages */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {stats?.totalMessages || 0}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Messages</p>
        </div>

        {/* Avg Response Time */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatResponseTime(stats?.avgResponseTime || 0)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Avg Response Time</p>
        </div>

        {/* Satisfaction Score */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <ThumbsUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {((stats?.satisfactionScore || 0) * 20).toFixed(0)}%
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Satisfaction Score</p>
        </div>
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Avg Messages per Conversation */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(stats?.avgMessages || 0).toFixed(1)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg Messages/Conv</p>
            </div>
          </div>
        </div>

        {/* Avg Duration */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatDuration(stats?.avgDuration || 0)}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg Conversation Duration</p>
            </div>
          </div>
        </div>

        {/* Resolution Rate */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {((stats?.resolutionRate || 0) * 100).toFixed(0)}%
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Resolution Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation Status Breakdown */}
      {stats?.byStatus && Object.keys(stats.byStatus).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Conversations by Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {status.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel Breakdown */}
      {stats?.byChannel && Object.keys(stats.byChannel).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Conversations by Channel
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.byChannel).map(([channel, count]) => (
              <div key={channel} className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {channel.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
