'use client';

import React, { useState, useEffect } from 'react';
import { NoAgentsIllustration } from '@/components/illustrations/EmptyStateIllustrations';
import {
  Plus,
  Bot,
  Settings,
  Play,
  Pause,
  Trash2,
  Copy,
  Edit,
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
  Users,
  Search,
  Filter,
  MoreVertical,
  TestTube,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiHelpers, api } from '@/lib/api';
import { useI18n } from '@/providers/I18nProvider';
import { AgentTestModal } from '@/components/agents/AgentTestModal';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface Agent {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'training' | 'error';
  model: string;
  language: string;
  personality: string;
  conversationsCount: number;
  averageResponseTime: number;
  satisfactionRate: number;
  createdAt: string;
  lastActive: string;
  avatar?: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingAgent, setTestingAgent] = useState<Agent | null>(null);
  const [agentLimit, setAgentLimit] = useState(0);

  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    loadAgents();
    loadAgentLimit();
  }, []);

  // Fetch the plan's max agents limit (0 / <=0 means unlimited).
  // Failures are swallowed: agentLimit stays 0 -> never blocks.
  const loadAgentLimit = async () => {
    try {
      const usageRes = await api.getSubscriptionUsage();
      const usageData: any = (usageRes as any)?.data ?? usageRes;
      const maxAgents = Number(
        usageData?.usage?.agents?.limit ?? usageData?.limits?.maxAgents ?? 0,
      );
      setAgentLimit(Number.isFinite(maxAgents) ? maxAgents : 0);
    } catch {
      setAgentLimit(0);
    }
  };

  // Socket functionality removed for now to avoid provider issues

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await apiHelpers.agents.getAll();
      if (response.success) {
        setAgents(response.data || []);
      } else {
        setAgents([]);
        toast.error(response.error || 'Erreur lors du chargement des agents');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load agents:', error);
      }
      setAgents([]); // Ensure agents is always an array
      toast.error('Erreur lors du chargement des agents');
    } finally {
      setLoading(false);
    }
  };


  const currentAgents = agents || [];

  // Only block when the plan has a finite limit and it's reached.
  const quotaReached = agentLimit > 0 && currentAgents.length >= agentLimit;

  const filteredAgents = currentAgents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleAgentStatus = async (agentId: string, currentStatus: string) => {
    // Don't toggle if agent is in training or error status
    if (currentStatus === 'training') {
      toast.error('Impossible de changer le statut: l\'agent est en formation');
      return;
    }
    if (currentStatus === 'error') {
      toast.error('Impossible de changer le statut: l\'agent est en erreur');
      return;
    }

    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await apiHelpers.agents.update(agentId, { status: newStatus });

      setAgents(prev =>
        prev.map(agent =>
          agent.id === agentId
            ? { ...agent, status: newStatus as Agent['status'] }
            : agent
        )
      );

      toast.success(`Agent ${newStatus === 'active' ? 'activé' : 'désactivé'} avec succès`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to toggle agent status:', error);
      }
      toast.error('Erreur lors du changement de statut');
    }
  };

  const duplicateAgent = async (agentId: string) => {
    const agent = currentAgents.find(a => a.id === agentId);
    if (!agent) return;

    try {
      const response = await api.cloneAgent(agentId, `${agent.name} (Copy)`);
      if (response.success) {
        toast.success('Agent dupliqué avec succès');
        loadAgents(); // Refresh the list to show the cloned agent
      } else {
        toast.error('Erreur lors de la duplication');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error cloning agent:', error);
      }
      toast.error('Erreur lors de la duplication');
    }
  };

  const deleteAgent = async (agentId: string) => {
    setDeleteConfirm(agentId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await apiHelpers.agents.delete(deleteConfirm);
      setAgents(prev => prev.filter(agent => agent.id !== deleteConfirm));
      toast.success('Agent supprimé avec succès');
      setDeleteConfirm(null);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to delete agent:', error);
      }
      if (error?.response?.status === 400) {
        toast.error('Impossible de supprimer: l\'agent a des conversations actives');
      } else {
        toast.error('Erreur lors de la suppression');
      }
      setDeleteConfirm(null);
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'training':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return <div className="w-2 h-2 bg-green-400 rounded-full"></div>;
      case 'inactive':
        return <div className="w-2 h-2 bg-gray-400 rounded-full"></div>;
      case 'training':
        return <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>;
      case 'error':
        return <div className="w-2 h-2 bg-red-400 rounded-full"></div>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('agents.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('agents.subtitle')}
          </p>
        </div>
        <div className="mt-4 flex flex-col items-start md:mt-0 md:ml-4 md:items-end">
          <button
            onClick={() => router.push('/agents/new')}
            disabled={quotaReached}
            className={clsx(
              'inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors duration-200',
              quotaReached && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('agents.create')}
          </button>
          {quotaReached && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              {t('agentForm.quotaReachedShort').replace('{{limit}}', String(agentLimit))}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder={t('agents.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none"
          >
            <option value="all">{t('agents.allStatus')}</option>
            <option value="active">{t('agents.statusActive')}</option>
            <option value="inactive">{t('agents.statusInactive')}</option>
            <option value="training">{t('agents.statusTraining')}</option>
            <option value="error">{t('agents.statusError')}</option>
          </select>
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => (
          <div key={agent.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
            {/* Agent Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                    {agent.name}
                  </h3>
                  <div className="flex items-center space-x-2 mt-1">
                    {getStatusIcon(agent.status)}
                    <span className={clsx(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
                      getStatusColor(agent.status)
                    )}>
                      {agent.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions dropdown */}
              <div className="relative">
                <button
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {/* Dropdown would go here */}
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {agent.description}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {agent.conversationsCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('agents.conversations')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {agent.averageResponseTime > 1000
                    ? `${(agent.averageResponseTime / 1000).toFixed(1)}s`
                    : agent.averageResponseTime > 0
                      ? `${Math.round(agent.averageResponseTime)}ms`
                      : '—'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('agents.responseTime')}
                </div>
              </div>
            </div>

            {/* Satisfaction Rate */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">{t('agents.satisfaction')}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {agent.satisfactionRate}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full"
                  style={{ width: `${agent.satisfactionRate}%` }}
                ></div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Toggle Status */}
              <button
                onClick={() => toggleAgentStatus(agent.id, agent.status)}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
                  agent.status === 'active'
                    ? 'text-orange-700 bg-orange-50 hover:bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20 dark:hover:bg-orange-900/40'
                    : 'text-green-700 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/20 dark:hover:bg-green-900/40'
                )}
              >
                {agent.status === 'active' ? (
                  <><Pause className="w-3.5 h-3.5" />{t('agents.deactivate')}</>
                ) : (
                  <><Play className="w-3.5 h-3.5" />{t('agents.activate')}</>
                )}
              </button>

              {/* Test */}
              <button
                onClick={() => setTestingAgent(agent)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 transition-colors"
              >
                <TestTube className="w-3.5 h-3.5" />
                {t('agents.test')}
              </button>

              {/* Edit */}
              <button
                onClick={() => router.push(`/agents/${agent.id}/edit`)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-gray-50 hover:bg-gray-100 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                {t('agents.edit')}
              </button>

              {/* Duplicate */}
              <button
                onClick={() => duplicateAgent(agent.id)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-gray-50 hover:bg-gray-100 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('agents.duplicate')}
              </button>

              {/* Delete */}
              <button
                onClick={() => deleteAgent(agent.id)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('agents.delete')}
              </button>

              {/* Stats */}
              <button
                onClick={() => router.push(`/agents/${agent.id}/analytics`)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 dark:text-primary-400 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 transition-colors ml-auto"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                {t('agents.stats')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <div className="text-center py-12">
          <NoAgentsIllustration className="mb-2" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {t('agents.noAgentsFound')}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? t('agents.adjustSearch') : t('agents.getStarted')}
          </p>
          {!searchQuery && (
            <div className="mt-6">
              <button
                onClick={() => router.push('/agents/new')}
                disabled={quotaReached}
                className={clsx(
                  'inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors duration-200',
                  quotaReached && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('agents.create')}
              </button>
              {quotaReached && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {t('agentForm.quotaReachedShort').replace('{{limit}}', String(agentLimit))}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('agents.confirmDelete')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir supprimer cet agent ? Cette action est irréversible.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Test Modal */}
      {testingAgent && (
        <AgentTestModal
          isOpen={!!testingAgent}
          onClose={() => setTestingAgent(null)}
          agent={{
            id: testingAgent.id,
            name: testingAgent.name,
            avatarUrl: testingAgent.avatar,
          }}
        />
      )}
    </div>
  );
}