'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  TrendingUp, 
  Users, 
  MessageSquare, 
  Bot, 
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { WhatsAppWidget } from '@/components/dashboard/WhatsAppWidget';
import { useI18n } from '@/providers/I18nProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useSocket } from '@/providers/SocketProvider';
import { apiHelpers } from '@/lib/api';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalConversations: number;
  activeConversations: number;
  totalAgents: number;
  activeAgents: number;
  responseTime: number;
  satisfactionRate: number;
  messagesThisMonth: number;
  conversionRate: number;
}

interface ChartData {
  name: string;
  conversations: number;
  messages: number;
  responseTime: number;
}

interface AgentStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  conversations: number;
  lastActive: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const { t } = useI18n();
  const { user, refreshAuth } = useAuth();
  const socket = useSocket();
  const searchParams = useSearchParams();

  // Handle tokens from URL parameters (from marketing site login)
  useEffect(() => {
    const token = searchParams?.get('token');
    const refreshToken = searchParams?.get('refresh');
    
    if (token && typeof window !== 'undefined') {
      console.log('Dashboard: Setting token from URL params');
      localStorage.setItem('auth-token', token);
      if (refreshToken) {
        localStorage.setItem('refresh-token', refreshToken);
      }
      // Remove tokens from URL for security/cleanliness
      window.history.replaceState(null, '', window.location.pathname);
      // Trigger AuthProvider to re-initialize with new token
      setTimeout(() => {
        console.log('Dashboard: Triggering auth refresh after token set');
        refreshAuth();
      }, 100); // Small delay to ensure localStorage is set
    }
  }, [searchParams, refreshAuth]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (socket) {
      // Listen for real-time updates
      socket.on('stats_updated', (newStats: DashboardStats) => {
        setStats(newStats);
      });

      socket.on('agent_status_changed', (agentStatus: AgentStatus) => {
        setAgentStatuses(prev => 
          prev.map(agent => 
            agent.id === agentStatus.id ? agentStatus : agent
          )
        );
      });

      return () => {
        socket.off('stats_updated');
        socket.off('agent_status_changed');
      };
    }
  }, [socket]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      console.log('🔍 Dashboard: Loading real data from API...');

      const [analyticsRes, agentsRes] = await Promise.all([
        apiHelpers.analytics.getDashboard(),
        apiHelpers.agents.getAll(),
      ]);

      console.log('🔍 Dashboard: Analytics response:', analyticsRes);
      console.log('🔍 Dashboard: Agents response:', agentsRes);

      // Process analytics data
      if (analyticsRes.success && analyticsRes.data) {
        console.log('✅ Dashboard: Setting analytics data from API');
        setStats(analyticsRes.data.stats);
        setChartData(analyticsRes.data.chartData || []);
      }

      // Process real agents data
      const agents = agentsRes?.data || agentsRes || [];
      if (Array.isArray(agents) && agents.length > 0) {
        console.log('✅ Dashboard: Setting real agents data:', agents.length, 'agents');
        const realAgentStatuses: AgentStatus[] = agents.map((agent: any) => ({
          id: agent.id,
          name: agent.name || 'Unnamed Agent',
          status: agent.isActive ? 'online' : 'offline',
          conversations: agent.conversationCount || 0,
          lastActive: agent.updatedAt
            ? formatLastActive(new Date(agent.updatedAt))
            : 'Never',
        }));
        setAgentStatuses(realAgentStatuses);
      } else {
        console.log('ℹ️ Dashboard: No agents found, showing empty state');
        setAgentStatuses([]);
      }
    } catch (error) {
      console.error('❌ Dashboard: Failed to load dashboard data:', error);
      // On error, set empty arrays instead of mock data
      setAgentStatuses([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format last active time
  const formatLastActive = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  // Mock data for development
  const mockStats: DashboardStats = {
    totalConversations: 1247,
    activeConversations: 23,
    totalAgents: 5,
    activeAgents: 4,
    responseTime: 1.2,
    satisfactionRate: 94.5,
    messagesThisMonth: 5678,
    conversionRate: 12.8,
  };

  const mockChartData: ChartData[] = [
    { name: 'Mon', conversations: 42, messages: 156, responseTime: 1.1 },
    { name: 'Tue', conversations: 38, messages: 142, responseTime: 1.3 },
    { name: 'Wed', conversations: 55, messages: 203, responseTime: 0.9 },
    { name: 'Thu', conversations: 49, messages: 187, responseTime: 1.0 },
    { name: 'Fri', conversations: 67, messages: 245, responseTime: 1.2 },
    { name: 'Sat', conversations: 35, messages: 128, responseTime: 1.4 },
    { name: 'Sun', conversations: 29, messages: 98, responseTime: 1.1 },
  ];

  // Use real data or defaults (no more mock agent statuses)
  const currentStats = stats || {
    totalConversations: 0,
    activeConversations: 0,
    totalAgents: agentStatuses.length,
    activeAgents: agentStatuses.filter(a => a.status === 'online').length,
    responseTime: 0,
    satisfactionRate: 0,
    messagesThisMonth: 0,
    conversionRate: 0,
  };
  const currentChartData = (chartData && chartData.length > 0) ? chartData : mockChartData;
  // Use real agents only - no mock fallback
  const currentAgentStatuses = agentStatuses;

  const pieData = [
    { name: 'Resolved', value: 78, color: '#10b981' },
    { name: 'Active', value: 15, color: '#3b82f6' },
    { name: 'Pending', value: 7, color: '#f59e0b' },
  ];

  const StatCard = ({ 
    title, 
    value, 
    change, 
    changeType, 
    icon: Icon, 
    color = 'blue' 
  }: {
    title: string;
    value: string | number;
    change?: string;
    changeType?: 'increase' | 'decrease';
    icon: React.ComponentType<any>;
    color?: string;
  }) => {
    const colorClasses = {
      blue: 'bg-green-500',
      green: 'bg-emerald-500',
      yellow: 'bg-green-600',
      purple: 'bg-emerald-600',
      indigo: 'bg-green-700',
      pink: 'bg-emerald-700',
    };

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 p-6 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-100/50 to-emerald-100/30 dark:from-green-900/30 dark:to-emerald-900/20 rounded-full -translate-y-6 translate-x-6"></div>
        <div className="flex items-center relative">
          <div className={`flex-shrink-0 p-3 rounded-xl shadow-lg ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {title}
            </h3>
            <div className="flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {value}
              </p>
              {change && (
                <span className={`ml-2 flex items-center text-sm font-medium ${
                  changeType === 'increase' 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {changeType === 'increase' ? (
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                  )}
                  {change}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AgentStatusCard = ({ agent }: { agent: AgentStatus }) => {
    const statusColors = {
      online: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      offline: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };

    const statusDots = {
      online: 'bg-green-400',
      offline: 'bg-gray-400',
      error: 'bg-red-400',
    };

    return (
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Bot className="h-8 w-8 text-gray-400" />
            <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white dark:border-gray-800 ${statusDots[agent.status]}`}></div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {agent.conversations} {t('dashboard.active')} • {agent.lastActive}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[agent.status]}`}>
          {t(`dashboard.${agent.status}`)}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('dashboard.welcome', { name: user?.firstName || 'User' })}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard.todayActivity')}
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
            <BarChart3 className="mr-2 h-4 w-4" />
            {t('dashboard.viewFullAnalytics')}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={t('dashboard.totalConversations')}
          value={currentStats.totalConversations.toLocaleString()}
          change="+12%"
          changeType="increase"
          icon={MessageSquare}
          color="blue"
        />
        <StatCard
          title={t('dashboard.activeNow')}
          value={currentStats.activeConversations}
          icon={Users}
          color="green"
        />
        <StatCard
          title={t('dashboard.activeAgents')}
          value={`${currentStats.activeAgents}/${currentStats.totalAgents}`}
          icon={Bot}
          color="purple"
        />
        <StatCard
          title={t('dashboard.avgResponseTime')}
          value={`${currentStats.responseTime}s`}
          change="-8%"
          changeType="increase"
          icon={Zap}
          color="yellow"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversations Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 p-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-100/30 to-emerald-100/20 dark:from-green-900/20 dark:to-emerald-900/10 rounded-full -translate-y-8 translate-x-8"></div>
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {t('dashboard.weeklyActivity')}
            </h3>
            <select className="text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option>{t('dashboard.last7Days')}</option>
              <option>{t('dashboard.last30Days')}</option>
              <option>{t('dashboard.last3Months')}</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentChartData}>
                <defs>
                  <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  className="text-gray-500 text-xs"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  className="text-gray-500 text-xs"
                />
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: 'none', 
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="conversations" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorConversations)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Response Time Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 p-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-100/30 to-green-100/20 dark:from-emerald-900/20 dark:to-green-900/10 rounded-full -translate-y-8 translate-x-8"></div>
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {t('dashboard.responseTimes')}
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentChartData}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  className="text-gray-500 text-xs"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  className="text-gray-500 text-xs"
                  label={{ value: 'Seconds', angle: -90, position: 'insideLeft' }}
                />
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: 'none', 
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="responseTime" 
                  stroke="#059669" 
                  strokeWidth={2}
                  dot={{ fill: '#059669', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Status */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 p-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-green-100/20 to-emerald-100/10 dark:from-green-900/15 dark:to-emerald-900/5 rounded-full -translate-y-10 translate-x-10"></div>
          <div className="flex items-center justify-between mb-4 relative">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {t('dashboard.agentStatus')}
            </h3>
            <button className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 font-medium">
              {t('dashboard.manageAgents')}
            </button>
          </div>
          <div className="space-y-3">
            {currentAgentStatuses.length > 0 ? (
              currentAgentStatuses.map((agent) => (
                <AgentStatusCard key={agent.id} agent={agent} />
              ))
            ) : (
              <div className="text-center py-8">
                <Bot className="mx-auto h-12 w-12 text-gray-400" />
                <h4 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  {t('dashboard.noAgents')}
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('dashboard.createFirstAgent')}
                </p>
                <a
                  href="/agents"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                >
                  {t('dashboard.createAgent')}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Status */}
        <WhatsAppWidget />
      </div>
    </div>
  );
}