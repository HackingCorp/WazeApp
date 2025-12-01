'use client';

import React, { useState, useEffect } from 'react';
import { X, Bot, Plus, Database, CheckCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  primaryLanguage: string;
  hasKnowledgeBase: boolean;
}

interface AssignAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssignAgent: (agentId: string, createKnowledgeBase: boolean) => void;
  onAgentCreated?: () => void;
  sessionName: string;
}

export function AssignAgentModal({
  isOpen,
  onClose,
  onAssignAgent,
  onAgentCreated,
  sessionName,
}: AssignAgentModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [createKnowledgeBase, setCreateKnowledgeBase] = useState(true);
  const [newAgentData, setNewAgentData] = useState({
    name: '',
    description: '',
    primaryLanguage: 'fr',
    tone: 'friendly',
  });

  // Charger les agents depuis l'API
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await api.get('/agents');

        if (response.success && response.data) {
          const agentsWithKnowledgeBase = response.data.data?.map((agent: any) => ({
            ...agent,
            hasKnowledgeBase: agent.knowledgeBases && agent.knowledgeBases.length > 0,
          })) || [];
          setAgents(agentsWithKnowledgeBase);
        } else {
          console.error('Failed to fetch agents', response.error);
          // Fallback aux données mock en cas d'erreur
          setAgents([
            {
              id: 'agent-1',
              name: 'Support Client',
              description: 'Agent spécialisé pour le support et SAV',
              status: 'active',
              primaryLanguage: 'fr',
              hasKnowledgeBase: true,
            },
          ]);
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
        // Fallback aux données mock en cas d'erreur
        setAgents([
          {
            id: 'agent-1',
            name: 'Support Client',
            description: 'Agent spécialisé pour le support et SAV',
            status: 'active',
            primaryLanguage: 'fr',
            hasKnowledgeBase: true,
          },
        ]);
      }
    };

    if (isOpen) {
      fetchAgents();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (showCreateAgent) {
      try {
        // Créer nouvel agent via API
        const response = await api.post('/agents', {
          name: newAgentData.name,
          description: newAgentData.description,
          primaryLanguage: newAgentData.primaryLanguage,
          tone: newAgentData.tone,
          systemPrompt: `Tu es un assistant IA spécialisé nommé ${newAgentData.name}. ${newAgentData.description || 'Tu aides les utilisateurs avec leurs questions de manière professionnelle et utile.'}`,
        });

        if (response.success && response.data) {
          console.log('Agent created successfully:', response.data);
          
          // Rafraîchir la liste des agents dans le parent
          if (onAgentCreated) {
            onAgentCreated();
          }
          
          onAssignAgent(response.data.id, createKnowledgeBase);
        } else {
          console.error('Failed to create agent:', response.error);
          alert('Erreur lors de la création de l\'agent: ' + response.error);
        }
      } catch (error) {
        console.error('Error creating agent:', error);
        const errorMessage = (error as any)?.response?.data?.message || (error as any)?.message || 'Erreur inconnue';
        if (errorMessage.includes('limit')) {
          alert('Limite d\'agents atteinte pour votre abonnement. Utilisez un agent existant ou mettez à niveau votre abonnement pour créer plus d\'agents.');
          setShowCreateAgent(false); // Retourner à la liste des agents existants
        } else {
          alert('Erreur lors de la création de l\'agent: ' + errorMessage);
        }
      }
    } else if (selectedAgentId) {
      onAssignAgent(selectedAgentId, createKnowledgeBase);
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Assigner un Agent IA
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Session WhatsApp: <span className="font-medium">{sessionName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {!showCreateAgent ? (
            <>
              {/* Agents existants */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Choisir un agent existant
                  </h3>
                  <button
                    onClick={() => setShowCreateAgent(true)}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Créer un nouvel agent</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={clsx(
                        'p-4 border rounded-lg cursor-pointer transition-all',
                        selectedAgentId === agent.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={clsx(
                          "w-3 h-3 rounded-full",
                          agent.status === 'active' ? "bg-green-500" : "bg-gray-400"
                        )} />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {agent.name}
                            </h4>
                            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                              {agent.primaryLanguage}
                            </span>
                            {agent.hasKnowledgeBase && (
                              <span title="A une base de connaissances">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </span>
                            )}
                          </div>
                          {agent.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {agent.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option base de connaissances */}
              {selectedAgent && !selectedAgent.hasKnowledgeBase && (
                <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                        Cet agent n'a pas de base de connaissances
                      </h4>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={createKnowledgeBase}
                          onChange={(e) => setCreateKnowledgeBase(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-yellow-700 dark:text-yellow-300">
                          Créer une base de connaissances pour cet agent
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Créer nouvel agent */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Créer un nouvel agent
                  </h3>
                  <button
                    onClick={() => setShowCreateAgent(false)}
                    className="text-gray-600 hover:text-gray-700 text-sm"
                  >
                    ← Retour aux agents existants
                  </button>
                </div>

                {/* Plan limit warning */}
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      <p className="font-medium">Limite d'agents</p>
                      <p className="mt-1">Si vous avez atteint votre limite d'agents IA, utilisez un agent existant ou mettez à niveau votre abonnement pour créer plus d'agents.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nom de l'agent *
                    </label>
                    <input
                      type="text"
                      value={newAgentData.name}
                      onChange={(e) => setNewAgentData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Support E-commerce, Agent Technique..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={newAgentData.description}
                      onChange={(e) => setNewAgentData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Décrivez le rôle et les compétences de cet agent..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Langue principale
                    </label>
                    <select
                      value={newAgentData.primaryLanguage}
                      onChange={(e) => setNewAgentData(prev => ({ ...prev, primaryLanguage: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="fr">Français</option>
                      <option value="en">Anglais</option>
                      <option value="es">Espagnol</option>
                      <option value="ar">Arabe</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ton de communication
                    </label>
                    <select
                      value={newAgentData.tone}
                      onChange={(e) => setNewAgentData(prev => ({ ...prev, tone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="professional">Professionnel</option>
                      <option value="friendly">Amical</option>
                      <option value="casual">Décontracté</option>
                      <option value="formal">Formel</option>
                      <option value="empathetic">Empathique</option>
                      <option value="technical">Technique</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                        Base de connaissances
                      </h4>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={createKnowledgeBase}
                          onChange={(e) => setCreateKnowledgeBase(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          Créer une base de connaissances spécialisée pour cet agent
                        </span>
                      </label>
                      {createKnowledgeBase && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Vous pourrez ajouter des documents après la création
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedAgentId && (!showCreateAgent || !newAgentData.name.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {showCreateAgent ? 'Créer et Assigner' : 'Assigner Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}