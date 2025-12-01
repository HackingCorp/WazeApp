'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Bot,
  Brain,
  MessageSquare,
  Settings,
  Save,
  Play,
  ArrowLeft,
  Upload,
  Zap,
  Clock,
  Globe,
  Palette,
  BookOpen,
  TestTube,
  Database,
  FileText,
  UploadCloud,
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Agent {
  id: string;
  name: string;
  description?: string;
  primaryLanguage: string;
  tone: string;
  systemPrompt: string;
  status: 'active' | 'inactive';
  knowledgeBases?: any[];
}

interface AgentFormData {
  name: string;
  description: string;
  primaryLanguage: string;
  tone: string;
  systemPrompt: string;
}

const TONES = [
  { value: 'professional', label: 'Professionnel' },
  { value: 'friendly', label: 'Amical' },
  { value: 'casual', label: 'Décontracté' },
  { value: 'formal', label: 'Formel' },
  { value: 'empathetic', label: 'Empathique' },
  { value: 'technical', label: 'Technique' },
];

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espagnol' },
  { value: 'ar', label: 'Arabe' },
];

export default function EditAgentPage() {
  const [activeTab, setActiveTab] = useState('basic');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const router = useRouter();
  const params = useParams();
  const agentId = params?.id as string;

  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    primaryLanguage: 'fr',
    tone: 'friendly',
    systemPrompt: '',
  });

  // Charger l'agent au montage
  useEffect(() => {
    const loadAgent = async () => {
      try {
        const response = await api.get(`/agents/${agentId}`);
        if (response.success && response.data) {
          const agentData = response.data;
          setAgent(agentData);
          setFormData({
            name: agentData.name || '',
            description: agentData.description || '',
            primaryLanguage: agentData.primaryLanguage || 'fr',
            tone: agentData.tone || 'friendly',
            systemPrompt: agentData.systemPrompt || '',
          });
        } else {
          toast.error('Agent introuvable');
          router.push('/agents');
        }
      } catch (error) {
        console.error('Error loading agent:', error);
        toast.error('Erreur lors du chargement de l\'agent');
        router.push('/agents');
      } finally {
        setLoading(false);
      }
    };

    if (agentId) {
      loadAgent();
    }
  }, [agentId, router]);

  const updateFormData = (updates: Partial<AgentFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Veuillez entrer un nom pour votre agent');
      return;
    }

    setSaving(true);
    try {
      const response = await api.patch(`/agents/${agentId}`, formData);
      if (response.success) {
        toast.success('Agent mis à jour avec succès !');
        router.push('/agents');
      } else {
        toast.error(response.error || 'Erreur lors de la mise à jour');
      }
    } catch (error: any) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.message || 'Erreur lors de la mise à jour de l\'agent');
    } finally {
      setSaving(false);
    }
  };

  // Fonction pour créer une base de connaissances
  const handleCreateKnowledgeBase = async () => {
    if (!agent) return;
    
    try {
      // Créer une base de connaissances pour cet agent
      const kbData = {
        name: `Base de connaissances - ${agent.name}`,
        description: `Base de connaissances spécialisée pour l'agent ${agent.name}`,
        agentId: agent.id,
      };

      const response = await api.post('/knowledge-bases', kbData);
      if (response.success) {
        toast.success('Base de connaissances créée avec succès !');
        // Recharger l'agent pour voir la nouvelle KB
        window.location.reload();
      } else {
        toast.error('Erreur lors de la création de la base de connaissances');
      }
    } catch (error) {
      console.error('Error creating knowledge base:', error);
      toast.error('Erreur lors de la création de la base de connaissances');
    }
  };

  // Fonction pour uploader des documents
  const handleDocumentUpload = async (files: FileList) => {
    if (!files || files.length === 0 || !agent?.knowledgeBases?.[0]) {
      toast.error('Veuillez créer d\'abord une base de connaissances');
      return;
    }

    setUploadingDocs(true);
    
    try {
      const knowledgeBaseId = agent.knowledgeBases[0].id;
      
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('knowledgeBaseId', knowledgeBaseId);
        formData.append('title', file.name);
        
        // Determine file type based on extension
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        let fileType = 'txt'; // default
        if (fileExt === 'pdf') fileType = 'pdf';
        else if (fileExt === 'docx' || fileExt === 'doc') fileType = 'docx';
        else if (fileExt === 'md') fileType = 'md';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt || '')) fileType = 'image';
        else if (['mp4', 'avi', 'mov', 'mkv'].includes(fileExt || '')) fileType = 'video';
        else if (['mp3', 'wav', 'm4a', 'ogg'].includes(fileExt || '')) fileType = 'audio';
        
        formData.append('type', fileType);
        
        const response = await api.post('/documents/upload', formData);
        if (response.success) {
          toast.success(`Document "${file.name}" uploadé avec succès`);
        } else {
          toast.error(`Erreur lors de l'upload de "${file.name}"`);
        }
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Erreur lors de l\'upload des documents');
    } finally {
      setUploadingDocs(false);
    }
  };

  const tabs = [
    { id: 'basic', name: 'Informations de base', icon: Bot },
    { id: 'knowledge', name: 'Base de connaissances', icon: Database },
    { id: 'advanced', name: 'Paramètres avancés', icon: Settings },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nom de l'agent *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                placeholder="Ex: Agent Support Client"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                placeholder="Description de ce que fait cet agent..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Langue principale
                </label>
                <select
                  value={formData.primaryLanguage}
                  onChange={(e) => updateFormData({ primaryLanguage: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ton de communication
                </label>
                <select
                  value={formData.tone}
                  onChange={(e) => updateFormData({ tone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {TONES.map(tone => (
                    <option key={tone.value} value={tone.value}>{tone.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Prompt système
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) => updateFormData({ systemPrompt: e.target.value })}
                placeholder="Instructions détaillées pour l'agent..."
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 'knowledge':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Gestion de la base de connaissances
              </h3>
              
              {agent?.knowledgeBases && agent.knowledgeBases.length > 0 ? (
                <div className="space-y-4">
                  {/* Base de connaissances existante */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-3">
                      <Database className="w-5 h-5 text-blue-500" />
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {agent.knowledgeBases[0].name || 'Base de connaissances'}
                      </h4>
                    </div>
                    
                    {/* Upload de documents */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Ajouter des documents
                      </label>
                      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
                        <div className="space-y-1 text-center">
                          <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                          <div className="flex text-sm text-gray-600 dark:text-gray-400">
                            <label htmlFor="file-upload" className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                              <span>Choisir des fichiers</span>
                              <input
                                id="file-upload"
                                name="file-upload"
                                type="file"
                                className="sr-only"
                                multiple
                                accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png"
                                onChange={(e) => e.target.files && handleDocumentUpload(e.target.files)}
                                disabled={uploadingDocs}
                              />
                            </label>
                            <p className="pl-1">ou glisser-déposer</p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            PDF, TXT, MD, DOC, DOCX, JPG, PNG jusqu'à 10MB
                          </p>
                        </div>
                      </div>
                      
                      {uploadingDocs && (
                        <div className="mt-2 text-sm text-blue-600">
                          Upload en cours...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Pas de base de connaissances */
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Aucune base de connaissances
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Créez une base de connaissances pour permettre à votre agent d'accéder à des informations spécialisées.
                  </p>
                  <button
                    onClick={handleCreateKnowledgeBase}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Créer une base de connaissances
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Paramètres avancés
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Statut de l'agent
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Statut actuel: <span className="capitalize font-medium">{agent?.status}</span>
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ID de l'agent
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {agent?.id}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/agents')}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Modifier l'agent: {agent?.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configurez votre agent IA et sa base de connaissances
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation */}
        <div className="lg:col-span-1">
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors',
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  <span className="font-medium">{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}