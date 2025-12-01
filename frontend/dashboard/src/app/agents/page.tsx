'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiHelpers } from '@/lib/api';
import clsx from 'clsx';

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

  const router = useRouter();

  useEffect(() => {
    loadAgents();
  }, []);

  // Socket functionality removed for now to avoid provider issues

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await apiHelpers.agents.getAll();
      setAgents(response.data || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]); // Ensure agents is always an array
    } finally {
      setLoading(false);
    }
  };

  // Mock data for development
  const mockAgents: Agent[] = [
    {
      id: '1',
      name: 'Customer Support Bot',
      description: 'Handles general customer inquiries and support tickets',
      status: 'active',
      model: 'GPT-4',
      language: 'English',
      personality: 'Helpful and Professional',
      conversationsCount: 342,
      averageResponseTime: 1.2,
      satisfactionRate: 94.5,
      createdAt: '2024-01-15T10:30:00Z',
      lastActive: '2 minutes ago',
    },
    {
      id: '2',
      name: 'Sales Assistant',
      description: 'Qualifies leads and provides product information',
      status: 'active',
      model: 'Claude-3.5',
      language: 'English',
      personality: 'Enthusiastic and Persuasive',
      conversationsCount: 156,
      averageResponseTime: 0.8,
      satisfactionRate: 92.1,
      createdAt: '2024-02-01T14:20:00Z',
      lastActive: '5 minutes ago',
    },
    {
      id: '3',
      name: 'Technical Support',
      description: 'Provides technical assistance and troubleshooting',
      status: 'inactive',
      model: 'GPT-4',
      language: 'English',
      personality: 'Patient and Technical',
      conversationsCount: 89,
      averageResponseTime: 2.1,
      satisfactionRate: 96.8,
      createdAt: '2024-01-20T09:15:00Z',
      lastActive: '2 hours ago',
    },
    {
      id: '4',
      name: 'Onboarding Guide',
      description: 'Helps new users get started with the platform',
      status: 'training',
      model: 'Claude-3.5',
      language: 'English',
      personality: 'Friendly and Encouraging',
      conversationsCount: 23,
      averageResponseTime: 1.5,
      satisfactionRate: 89.2,
      createdAt: '2024-02-10T16:45:00Z',
      lastActive: '1 hour ago',
    },
    {
      id: '5',
      name: 'FAQ Bot',
      description: 'Answers frequently asked questions',
      status: 'error',
      model: 'GPT-3.5',
      language: 'English',
      personality: 'Concise and Direct',
      conversationsCount: 67,
      averageResponseTime: 0.5,
      satisfactionRate: 87.3,
      createdAt: '2024-01-10T11:00:00Z',
      lastActive: '3 hours ago',
    },
  ];

  const currentAgents = agents || [];

  const filteredAgents = currentAgents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleAgentStatus = async (agentId: string, currentStatus: string) => {
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
    } catch (error) {
      console.error('Failed to toggle agent status:', error);
    }
  };

  const duplicateAgent = async (agentId: string) => {
    try {
      const agent = currentAgents.find(a => a.id === agentId);
      if (!agent) return;

      const duplicatedAgent = {
        ...agent,
        name: `${agent.name} (Copy)`,
        status: 'inactive' as const,
      };

      const response = await apiHelpers.agents.create(duplicatedAgent);
      setAgents(prev => [...prev, response.data]);
    } catch (error) {
      console.error('Failed to duplicate agent:', error);
    }
  };

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      await apiHelpers.agents.delete(agentId);
      setAgents(prev => prev.filter(agent => agent.id !== agentId));
    } catch (error) {
      console.error('Failed to delete agent:', error);
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
            Agents
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your AI agents and their configurations
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            onClick={() => router.push('/agents/new')}
            className="inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search agents..."
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
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="training">Training</option>
            <option value="error">Error</option>
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
                <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
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
                  Conversations
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {agent.averageResponseTime}s
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Response Time
                </div>
              </div>
            </div>

            {/* Satisfaction Rate */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">Satisfaction</span>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* Toggle Status */}
                <button
                  onClick={() => toggleAgentStatus(agent.id, agent.status)}
                  className={clsx(
                    'p-2 rounded-lg transition-colors',
                    agent.status === 'active'
                      ? 'text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/20'
                      : 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20'
                  )}
                  title={agent.status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  {agent.status === 'active' ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>

                {/* Edit */}
                <button
                  onClick={() => router.push(`/agents/${agent.id}/edit`)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>

                {/* Duplicate */}
                <button
                  onClick={() => duplicateAgent(agent.id)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 rounded-lg transition-colors"
                  title="Duplicate"
                >
                  <Copy className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteAgent(agent.id)}
                  className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Stats button */}
              <button
                onClick={() => router.push(`/agents/${agent.id}/analytics`)}
                className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Stats</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <div className="text-center py-12">
          <Bot className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No agents found
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? 'Try adjusting your search or filters' : 'Get started by creating your first AI agent'}
          </p>
          {!searchQuery && (
            <div className="mt-6">
              <button
                onClick={() => router.push('/agents/new')}
                className="inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors duration-200"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}