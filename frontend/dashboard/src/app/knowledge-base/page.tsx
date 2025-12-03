'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Settings, 
  Trash2, 
  Edit, 
  Eye, 
  RefreshCw,
  Database,
  Upload,
  MoreVertical,
  AlertCircle,
  CheckCircle,
  Clock,
  Tag
} from 'lucide-react';
import clsx from 'clsx';
import { CreateKnowledgeBaseModal } from '@/components/knowledge-base/CreateKnowledgeBaseModal';
import { DeleteKnowledgeBaseModal } from '@/components/knowledge-base/DeleteKnowledgeBaseModal';
import { api } from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'training';
  language: string;
  createdAt: Date;
  knowledgeBase?: KnowledgeBase;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'processing' | 'error' | 'inactive';
  documentCount: number;
  totalCharacters: number;
  tags?: string[];
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
  settings?: {
    chunking?: {
      strategy: 'fixed' | 'semantic' | 'recursive';
      chunkSize: number;
      overlap: number;
    };
    embedding?: {
      model: string;
      dimensions: number;
    };
    search?: {
      similarityThreshold: number;
      maxResults: number;
    };
  };
}

interface KnowledgeBaseStats {
  total: number;
  active: number;
  processing: number;
  totalDocuments: number;
  totalCharacters: number;
  characterUsage: {
    used: number;
    limit: number;
    percentage: number;
  };
}

export default function KnowledgeBasePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Charger les données depuis l'API
  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/agents');

      console.log('🔍 FRONTEND: Raw API response from /agents:', response);

      if (response.success && response.data) {
        const agentsWithKnowledgeBase = response.data.data?.map((agent: any) => ({
          ...agent,
          language: agent.primaryLanguage || 'French',
          createdAt: new Date(agent.createdAt),
          knowledgeBase: agent.knowledgeBases?.[0] ? {
            ...agent.knowledgeBases[0],
            createdAt: new Date(agent.knowledgeBases[0].createdAt),
            updatedAt: new Date(agent.knowledgeBases[0].updatedAt),
          } : undefined,
        })) || [];

        console.log('🔍 FRONTEND: Processed agents data:', agentsWithKnowledgeBase);
        setAgents(agentsWithKnowledgeBase);

        // Calculer les stats
        const agentsWithKB = agentsWithKnowledgeBase.filter((a: Agent) => a.knowledgeBase);
        const activeKB = agentsWithKB.filter((a: Agent) => a.knowledgeBase?.status === 'active').length;
        const processingKB = agentsWithKB.filter((a: Agent) => a.knowledgeBase?.status === 'processing').length;
        const totalDocs = agentsWithKB.reduce((sum: number, a: Agent) => sum + (a.knowledgeBase?.documentCount || 0), 0);
        const totalChars = agentsWithKB.reduce((sum: number, a: Agent) => sum + (a.knowledgeBase?.totalCharacters || 0), 0);
        
        console.log('🔍 FRONTEND: Stats calculation:', {
          agentsWithKB: agentsWithKB.length,
          totalDocs,
          totalChars,
          charactersFromEachKB: agentsWithKB.map((a: any) => ({
            name: a.knowledgeBase?.name,
            totalCharacters: a.knowledgeBase?.totalCharacters,
            documentCount: a.knowledgeBase?.documentCount
          }))
        });
        
        setStats({
          total: agentsWithKB.length,
          active: activeKB,
          processing: processingKB,
          totalDocuments: totalDocs,
          totalCharacters: totalChars,
          characterUsage: {
            used: totalChars,
            limit: 1000000, // TODO: Get from subscription
            percentage: (totalChars / 1000000) * 100,
          }
        });
      } else {
        console.error('Failed to fetch agents', response.error);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.knowledgeBase?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.knowledgeBase?.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || 
                         (agent.knowledgeBase ? agent.knowledgeBase.status === selectedStatus : selectedStatus === 'none');
    
    const matchesTags = selectedTags.length === 0 || 
                       (agent.knowledgeBase && selectedTags.some(tag => agent.knowledgeBase?.tags?.includes(tag)));
    
    return matchesSearch && matchesStatus && matchesTags;
  });

  const allTags = Array.from(new Set(agents.flatMap(agent => agent.knowledgeBase?.tags || [])));

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Actif';
      case 'processing': return 'En cours';
      case 'error': return 'Erreur';
      default: return 'Inactif';
    }
  };

  const handleCreateForAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setSelectedKnowledgeBase(null);
    setShowCreateModal(true);
  };

  const handleEdit = (agent: Agent, kb: KnowledgeBase) => {
    setSelectedAgent(agent);
    setSelectedKnowledgeBase(kb);
    setShowCreateModal(true);
  };

  const handleDelete = (agent: Agent, kb: KnowledgeBase) => {
    setSelectedAgent(agent);
    setSelectedKnowledgeBase(kb);
    setShowDeleteModal(true);
  };

  const handleRebuild = async (kb: KnowledgeBase) => {
    // TODO: Implement rebuild logic
    console.log('Rebuilding knowledge base:', kb.id);
  };

  const handleCreateSubmit = (data: Partial<KnowledgeBase>) => {
    console.log('Creating/updating knowledge base:', data);
    // TODO: Implement API call
    setShowCreateModal(false);
  };

  const handleDeleteConfirm = () => {
    console.log('Deleting knowledge base:', selectedKnowledgeBase?.id);
    // TODO: Implement API call
    setShowDeleteModal(false);
    setSelectedKnowledgeBase(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Bases de Connaissances par Agent IA
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Gérez les bases de connaissances spécialisées pour chaque agent IA
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Agents IA</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{agents.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {agents.filter(a => a.knowledgeBase).length} avec base de connaissances
                  </p>
                </div>
                <Database className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Bases Actives</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Documents</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalDocuments}</p>
                </div>
                <FileText className="w-8 h-8 text-purple-500" />
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Utilisation</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.characterUsage.percentage.toFixed(1)}%
                  </p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all" 
                      style={{ width: `${Math.min(stats.characterUsage.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-6">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un agent ou sa base de connaissances..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="lg:w-48">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">Tous les statuts</option>
                <option value="active">Base active</option>
                <option value="processing">En cours de traitement</option>
                <option value="error">Erreur</option>
                <option value="none">Sans base de connaissances</option>
              </select>
            </div>

            {/* Tags Filter */}
            <div className="lg:w-64">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !selectedTags.includes(e.target.value)) {
                    setSelectedTags([...selectedTags, e.target.value]);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Filtrer par tag...</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                    >
                      {tag}
                      <button
                        onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                        className="ml-1 hover:text-blue-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Agents and Knowledge Bases List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Chargement des agents IA...</p>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="p-12 text-center">
              <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Aucun agent trouvé
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery ? 'Aucun résultat pour votre recherche.' : 'Créez d\'abord vos agents IA dans la section Agents.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAgents.map((agent) => (
                <div key={agent.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Agent Header */}
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="flex items-center space-x-2">
                          <div className={clsx(
                            "w-3 h-3 rounded-full",
                            agent.status === 'active' ? "bg-green-500" : 
                            agent.status === 'training' ? "bg-yellow-500" : "bg-gray-400"
                          )} />
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {agent.name}
                          </h3>
                        </div>
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                          {agent.language}
                        </span>
                      </div>
                      
                      {agent.description && (
                        <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">
                          {agent.description}
                        </p>
                      )}

                      {/* Knowledge Base Section */}
                      {agent.knowledgeBase ? (
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Database className="w-4 h-4 text-blue-500" />
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {agent.knowledgeBase.name}
                              </h4>
                              <div className="flex items-center space-x-1">
                                {getStatusIcon(agent.knowledgeBase.status)}
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {getStatusText(agent.knowledgeBase.status)}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {agent.knowledgeBase.description && (
                            <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">
                              {agent.knowledgeBase.description}
                            </p>
                          )}
                          
                          <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400 mb-3">
                            <div className="flex items-center space-x-1">
                              <FileText className="w-4 h-4" />
                              <span>{agent.knowledgeBase.documentCount} documents</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Database className="w-4 h-4" />
                              <span>
                                {(() => {
                                  const chars = agent.knowledgeBase.totalCharacters;
                                  const display = `${(chars / 1000).toFixed(0)}k caractères`;
                                  console.log('🔍 FRONTEND: Displaying characters for KB', agent.knowledgeBase.name, '- Raw:', chars, 'Display:', display);
                                  return display;
                                })()}
                              </span>
                            </div>
                            <div>
                              Modifié {agent.knowledgeBase.updatedAt.toLocaleDateString('fr-FR')}
                            </div>
                          </div>
                          
                          {agent.knowledgeBase.tags && agent.knowledgeBase.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {agent.knowledgeBase.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                                >
                                  <Tag className="w-3 h-3 mr-1" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => window.location.href = `/knowledge-base/${agent.knowledgeBase?.id}/documents`}
                              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              Gérer les documents
                            </button>
                            <button
                              onClick={() => agent.knowledgeBase && handleEdit(agent, agent.knowledgeBase)}
                              className="text-xs px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => agent.knowledgeBase && handleRebuild(agent.knowledgeBase)}
                              disabled={agent.knowledgeBase?.status === 'processing'}
                              className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                            >
                              {agent.knowledgeBase?.status === 'processing' ? 'En cours...' : 'Reconstruire'}
                            </button>
                            <button
                              onClick={() => agent.knowledgeBase && handleDelete(agent, agent.knowledgeBase)}
                              className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                              <span className="text-sm text-yellow-800 dark:text-yellow-200">
                                Aucune base de connaissances configurée
                              </span>
                            </div>
                            <button
                              onClick={() => handleCreateForAgent(agent)}
                              className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                            >
                              Créer une base
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateKnowledgeBaseModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
        knowledgeBase={selectedKnowledgeBase}
      />

      <DeleteKnowledgeBaseModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        knowledgeBase={selectedKnowledgeBase}
      />
    </div>
  );
}