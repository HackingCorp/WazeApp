'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { analytics } from '@/lib/analytics';
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
  History,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/providers/I18nProvider';
import { AgentTestModal } from '@/components/agents/AgentTestModal';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Agent {
  id: string;
  name: string;
  description?: string;
  primaryLanguage: string;
  supportedLanguages?: string[];
  tone: string;
  systemPrompt: string;
  status: 'active' | 'inactive' | 'training' | 'maintenance';
  knowledgeBases?: any[];
  responseLength?: string;
  verbosity?: string;
  useEmojis?: boolean;
  maxResponseChars?: number;
  welcomeMessage?: string;
  fallbackMessage?: string;
  tags?: string[];
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    avoidRepetition?: boolean;
    useListsWhenAppropriate?: boolean;
    includeGreetings?: boolean;
    signOffStyle?: string;
  };
  ecommerceEnabled?: boolean;
  catalogs?: { id: string; name: string; platform: string }[];
  escalationConfig?: {
    enabled?: boolean;
    keywords?: string[];
    escalationMessage?: string;
  };
}

interface CatalogStore {
  id: string;
  name: string;
  platform: string;
}

interface AgentFormData {
  name: string;
  description: string;
  primaryLanguage: string;
  supportedLanguages?: string[];
  tone: string;
  systemPrompt: string;
  status?: 'active' | 'inactive' | 'training' | 'maintenance';
  responseLength: string;
  verbosity: string;
  useEmojis: boolean;
  maxResponseChars: number;
  welcomeMessage?: string;
  fallbackMessage?: string;
  tags?: string[];
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    avoidRepetition?: boolean;
    useListsWhenAppropriate?: boolean;
    includeGreetings?: boolean;
    signOffStyle?: string;
  };
  ecommerceEnabled?: boolean;
  catalogIds?: string[];
  escalationConfig?: {
    enabled?: boolean;
    keywords?: string[];
    escalationMessage?: string;
  };
}

export default function EditAgentPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('basic');

  const TONES = [
    { value: 'professional', label: t('agentForm.toneProfessional') },
    { value: 'friendly', label: t('agentForm.toneFriendly') },
    { value: 'casual', label: t('agentForm.toneCasual') },
    { value: 'formal', label: t('agentForm.toneFormal') },
    { value: 'empathetic', label: t('agentForm.toneEmpathetic') },
    { value: 'technical', label: t('agentForm.toneTechnical') },
  ];

  const LANGUAGES = [
    { value: 'en', label: t('agentForm.langEnglish') },
    { value: 'fr', label: t('agentForm.langFrench') },
    { value: 'es', label: t('agentForm.langSpanish') },
    { value: 'de', label: t('agentForm.langGerman') },
    { value: 'it', label: t('agentForm.langItalian') },
    { value: 'pt', label: t('agentForm.langPortuguese') },
    { value: 'zh', label: t('agentForm.langChinese') },
    { value: 'ja', label: t('agentForm.langJapanese') },
    { value: 'ar', label: t('agentForm.langArabic') },
  ];

  const RESPONSE_LENGTHS = [
    { value: 'very_short', label: t('agentForm.lengthVeryShort') },
    { value: 'short', label: t('agentForm.lengthShort') },
    { value: 'medium', label: t('agentForm.lengthMedium') },
    { value: 'detailed', label: t('agentForm.lengthDetailed') },
  ];

  const VERBOSITY_LEVELS = [
    { value: 'minimal', label: t('agentForm.verbosityMinimal') },
    { value: 'concise', label: t('agentForm.verbosityConcise') },
    { value: 'balanced', label: t('agentForm.verbosityBalanced') },
    { value: 'verbose', label: t('agentForm.verbosityVerbose') },
  ];
  const [agent, setAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [availableCatalogs, setAvailableCatalogs] = useState<CatalogStore[]>([]);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  const router = useRouter();
  const params = useParams();
  const agentId = params?.id as string;

  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    primaryLanguage: 'fr',
    supportedLanguages: [],
    tone: 'friendly',
    systemPrompt: '',
    status: 'active',
    responseLength: 'medium',
    verbosity: 'balanced',
    useEmojis: false,
    maxResponseChars: 0,
    welcomeMessage: '',
    fallbackMessage: '',
    tags: [],
    config: {
      temperature: 0.7,
      maxTokens: 2000,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      avoidRepetition: false,
      useListsWhenAppropriate: false,
      includeGreetings: true,
      signOffStyle: 'none',
    },
    ecommerceEnabled: false,
    catalogIds: [],
    escalationConfig: {
      enabled: false,
      keywords: [],
      escalationMessage: '',
    },
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
            supportedLanguages: agentData.supportedLanguages || [agentData.primaryLanguage || 'fr'],
            tone: agentData.tone || 'friendly',
            systemPrompt: agentData.systemPrompt || '',
            status: agentData.status || 'active',
            responseLength: agentData.responseLength || 'medium',
            verbosity: agentData.verbosity || 'balanced',
            useEmojis: agentData.useEmojis || false,
            maxResponseChars: agentData.maxResponseChars || 0,
            welcomeMessage: agentData.welcomeMessage || '',
            fallbackMessage: agentData.fallbackMessage || '',
            tags: agentData.tags || [],
            config: {
              ...agentData.config,
              temperature: agentData.config?.temperature ?? 0.7,
              maxTokens: agentData.config?.maxTokens ?? 2000,
              topP: agentData.config?.topP ?? 0.9,
              frequencyPenalty: agentData.config?.frequencyPenalty ?? 0,
              presencePenalty: agentData.config?.presencePenalty ?? 0,
              avoidRepetition: agentData.config?.avoidRepetition ?? false,
              useListsWhenAppropriate: agentData.config?.useListsWhenAppropriate ?? false,
              includeGreetings: agentData.config?.includeGreetings ?? true,
              signOffStyle: agentData.config?.signOffStyle ?? 'none',
            },
            ecommerceEnabled: agentData.ecommerceEnabled ?? false,
            catalogIds: agentData.catalogs?.map((c: any) => c.id) || [],
            escalationConfig: {
              enabled: agentData.escalationConfig?.enabled ?? false,
              keywords: agentData.escalationConfig?.keywords ?? [],
              escalationMessage: agentData.escalationConfig?.escalationMessage ?? '',
            },
          });
        } else {
          toast.error('Agent introuvable');
          router.push('/agents');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error loading agent:', error);
        }
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

  // Load available catalogs
  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        const response = await api.getEcommerceStores();
        if (response.success && response.data) {
          const data = response.data.data || response.data;
          setAvailableCatalogs(Array.isArray(data) ? data : []);
        }
      } catch { /* optional */ }
    };
    fetchCatalogs();
  }, []);

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
      // Strip deprecated config properties that may exist in database
      const validConfigKeys = [
        'maxTokens', 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty',
        'avoidRepetition', 'useListsWhenAppropriate', 'includeGreetings', 'signOffStyle',
      ];
      const mergedConfig = { ...agent?.config, ...formData.config };
      const cleanConfig: Record<string, any> = {};
      for (const key of validConfigKeys) {
        if (key in mergedConfig) cleanConfig[key] = (mergedConfig as any)[key];
      }
      const payload = {
        ...formData,
        config: cleanConfig,
      };
      const response = await api.patch(`/agents/${agentId}`, payload);
      if (response.success) {
        analytics.track('agent_updated', { agentId, name: formData.name });
        toast.success('Agent mis à jour avec succès !');
        router.push('/agents');
      } else {
        toast.error(response.error || 'Erreur lors de la mise à jour');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update error:', error);
      }
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
        analytics.track('kb_created_from_agent', { agentId: agent.id });
        toast.success('Base de connaissances créée avec succès !');
        // Recharger l'agent pour voir la nouvelle KB
        window.location.reload();
      } else {
        toast.error('Erreur lors de la création de la base de connaissances');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating knowledge base:', error);
      }
      toast.error('Erreur lors de la création de la base de connaissances');
    }
  };

  // Fonction pour charger l'historique des prompts
  const loadPromptHistory = async () => {
    if (!agentId) return;

    setLoadingHistory(true);
    try {
      const response = await api.getPromptHistory(agentId);
      if (response.success && response.data) {
        setPromptHistory(response.data);
      } else {
        toast.error('Erreur lors du chargement de l\'historique');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading prompt history:', error);
      }
      toast.error('Erreur lors du chargement de l\'historique');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fonction pour restaurer un prompt
  const handleRestorePrompt = async (version: number) => {
    if (!agentId) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir restaurer la version ${version} ? Cela remplacera le prompt actuel.`
    );

    if (!confirmed) return;

    try {
      const response = await api.rollbackPrompt(agentId, version);
      if (response.success) {
        toast.success('Prompt restauré avec succès !');
        // Recharger l'agent pour obtenir le prompt restauré
        window.location.reload();
      } else {
        toast.error('Erreur lors de la restauration du prompt');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error restoring prompt:', error);
      }
      toast.error('Erreur lors de la restauration du prompt');
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Error uploading documents:', error);
      }
      toast.error('Erreur lors de l\'upload des documents');
    } finally {
      setUploadingDocs(false);
    }
  };

  const tabs = [
    { id: 'basic', name: 'Informations de base', icon: Bot },
    { id: 'knowledge', name: 'Base de connaissances', icon: Database },
    { id: 'advanced', name: 'Paramètres avancés', icon: Settings },
    { id: 'escalation', name: 'Escalade', icon: AlertTriangle },
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Statut de l'agent
              </label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData({ status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="training">En formation</option>
                <option value="maintenance">Maintenance</option>
              </select>
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
                Langues supportées
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                {LANGUAGES.map(lang => (
                  <label key={lang.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.supportedLanguages?.includes(lang.value) || false}
                      onChange={(e) => {
                        const currentLangs = formData.supportedLanguages || [];
                        if (e.target.checked) {
                          updateFormData({ supportedLanguages: [...currentLangs, lang.value] });
                        } else {
                          updateFormData({
                            supportedLanguages: currentLangs.filter(l => l !== lang.value)
                          });
                        }
                      }}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{lang.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Sélectionnez toutes les langues que l'agent peut comprendre et répondre
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags
              </label>
              <input
                type="text"
                value={formData.tags?.join(', ') || ''}
                onChange={(e) => {
                  const tagsString = e.target.value;
                  const tagsArray = tagsString.split(',').map(t => t.trim()).filter(t => t);
                  updateFormData({ tags: tagsArray });
                }}
                placeholder="Ex: support, ventes, technique"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Séparez les tags par des virgules
              </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message de bienvenue
              </label>
              <textarea
                value={formData.welcomeMessage || ''}
                onChange={(e) => updateFormData({ welcomeMessage: e.target.value })}
                placeholder="Message envoyé automatiquement au début de chaque nouvelle conversation..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Envoyé automatiquement quand un utilisateur commence une conversation
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message par défaut (fallback)
              </label>
              <textarea
                value={formData.fallbackMessage || ''}
                onChange={(e) => updateFormData({ fallbackMessage: e.target.value })}
                placeholder="Message utilisé quand l'agent ne trouve pas de réponse dans la base de connaissances..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Utilisé quand aucune information pertinente n'est trouvée dans la base de connaissances
              </p>
            </div>

            {/* Prompt History Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Historique des prompts
                </h3>
                <button
                  onClick={() => {
                    setShowPromptHistory(!showPromptHistory);
                    if (!showPromptHistory && promptHistory.length === 0) {
                      loadPromptHistory();
                    }
                  }}
                  className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {showPromptHistory ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" />
                      Masquer
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" />
                      Afficher
                    </>
                  )}
                </button>
              </div>

              {showPromptHistory && (
                <div className="space-y-3">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : promptHistory.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                      Aucun historique de prompt disponible
                    </div>
                  ) : (
                    promptHistory.map((item) => (
                      <div
                        key={item.version}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium text-gray-900 dark:text-white">
                              Version {item.version}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {item.updatedBy && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                par {item.updatedBy}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                setExpandedVersion(
                                  expandedVersion === item.version ? null : item.version
                                )
                              }
                              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            >
                              {expandedVersion === item.version ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleRestorePrompt(item.version)}
                              className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restaurer
                            </button>
                          </div>
                        </div>

                        {expandedVersion === item.version && item.prompt && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                              {item.prompt}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
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
            {/* LLM Parameters */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Paramètres du modèle IA
              </h3>
              <div className="space-y-4">
                {/* Temperature slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Température <span className="text-gray-400">({formData.config?.temperature ?? 0.7})</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.config?.temperature ?? 0.7}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, temperature: parseFloat(e.target.value) },
                      }))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Précis (0)</span>
                    <span>Créatif (2)</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tokens maximum
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="32000"
                    value={formData.config?.maxTokens ?? 2000}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, maxTokens: parseInt(e.target.value) || 2000 },
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Limite la longueur des réponses (100-32000)
                  </p>
                </div>

                {/* Top P slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Top P <span className="text-gray-400">({formData.config?.topP ?? 0.9})</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={formData.config?.topP ?? 0.9}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, topP: parseFloat(e.target.value) },
                      }))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>

                {/* Frequency/Presence Penalty */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Pénalité de fréquence
                    </label>
                    <input
                      type="number"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={formData.config?.frequencyPenalty ?? 0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          config: {
                            ...prev.config,
                            frequencyPenalty: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Pénalité de présence
                    </label>
                    <input
                      type="number"
                      min="-2"
                      max="2"
                      step="0.1"
                      value={formData.config?.presencePenalty ?? 0}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          config: {
                            ...prev.config,
                            presencePenalty: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* E-commerce Catalogs */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('products.assignCatalogs')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('products.assignCatalogsDescription')}
              </p>
              {availableCatalogs.length > 0 ? (
                <div className="space-y-2">
                  {availableCatalogs.map(catalog => (
                    <label
                      key={catalog.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.catalogIds?.includes(catalog.id) ?? false}
                        onChange={(e) => {
                          const current = formData.catalogIds || [];
                          const updated = e.target.checked
                            ? [...current, catalog.id]
                            : current.filter(id => id !== catalog.id);
                          updateFormData({
                            catalogIds: updated,
                            ecommerceEnabled: updated.length > 0,
                          });
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {catalog.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          ({catalog.platform})
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {t('products.noCatalogs')}
                </p>
              )}
            </div>

            {/* Response Style Options */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Style de réponse avancé
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.config?.avoidRepetition ?? false}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, avoidRepetition: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Éviter les répétitions</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.config?.useListsWhenAppropriate ?? false}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, useListsWhenAppropriate: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Utiliser des listes quand approprié</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.config?.includeGreetings ?? true}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, includeGreetings: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Inclure des salutations</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Style de signature
                  </label>
                  <select
                    value={formData.config?.signOffStyle ?? 'none'}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, signOffStyle: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="none">Aucune</option>
                    <option value="simple">Simple</option>
                    <option value="formal">Formelle</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Style des réponses */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Style des réponses
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Longueur des réponses
                  </label>
                  <select
                    value={formData.responseLength}
                    onChange={(e) => updateFormData({ responseLength: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {RESPONSE_LENGTHS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Contrôle la longueur maximale des réponses de l'agent
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Niveau de détail
                  </label>
                  <select
                    value={formData.verbosity}
                    onChange={(e) => updateFormData({ verbosity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {VERBOSITY_LEVELS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Contrôle le niveau de détail dans les explications
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Limite de caractères
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={formData.maxResponseChars}
                    onChange={(e) => updateFormData({ maxResponseChars: parseInt(e.target.value) || 0 })}
                    placeholder="0 = illimité"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    0 = pas de limite. Maximum: 10000 caractères
                  </p>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.useEmojis}
                      onChange={(e) => updateFormData({ useEmojis: e.target.checked })}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Utiliser des emojis dans les réponses
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Informations système */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Informations système
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

      case 'escalation':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Configuration de l'escalade
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Configurez quand et comment les conversations doivent être transférées à un agent humain.
              </p>

              <div className="space-y-6">
                {/* Enable Escalation Toggle */}
                <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900 dark:text-white">
                      Activer l'escalade humaine
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Permet aux conversations d'être transférées à un opérateur humain
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.escalationConfig?.enabled ?? false}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          escalationConfig: {
                            ...prev.escalationConfig,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Keywords */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mots-clés de déclenchement
                  </label>
                  <input
                    type="text"
                    value={formData.escalationConfig?.keywords?.join(', ') || ''}
                    onChange={(e) => {
                      const keywordsString = e.target.value;
                      const keywordsArray = keywordsString.split(',').map(k => k.trim()).filter(k => k);
                      setFormData((prev) => ({
                        ...prev,
                        escalationConfig: {
                          ...prev.escalationConfig,
                          keywords: keywordsArray,
                        },
                      }));
                    }}
                    placeholder="Ex: parler à un humain, agent humain, opérateur"
                    disabled={!formData.escalationConfig?.enabled}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Séparez les mots-clés par des virgules. Quand un utilisateur envoie un message contenant ces mots-clés, la conversation sera escaladée.
                  </p>
                </div>

                {/* Escalation Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message d'escalade
                  </label>
                  <textarea
                    value={formData.escalationConfig?.escalationMessage || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        escalationConfig: {
                          ...prev.escalationConfig,
                          escalationMessage: e.target.value,
                        },
                      }))
                    }
                    placeholder="Ex: Votre conversation a été transférée à un agent humain. Veuillez patienter..."
                    rows={3}
                    disabled={!formData.escalationConfig?.enabled}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Message envoyé à l'utilisateur quand sa conversation est transférée à un agent humain
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
            onClick={() => setIsTestModalOpen(true)}
            className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <TestTube className="w-4 h-4 mr-2" />
            Tester en live
          </button>
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

      {/* Agent Test Modal */}
      {agent && (
        <AgentTestModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          agent={{
            id: agent.id,
            name: agent.name,
            welcomeMessage: formData.welcomeMessage,
            systemPrompt: formData.systemPrompt,
            primaryLanguage: formData.primaryLanguage,
          }}
          systemPromptOverride={formData.systemPrompt}
        />
      )}
    </div>
  );
}