'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Brain,
  MessageSquare,
  Settings,
  Save,
  ArrowLeft,
  Zap,
  BookOpen,
  TestTube,
  AlertTriangle,
} from 'lucide-react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { useI18n } from '@/providers/I18nProvider';
import { apiHelpers, api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface AgentFormData {
  name: string;
  description: string;
  tone: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  primaryLanguage: string;
  knowledgeBaseIds: string[];
  welcomeMessage: string;
  fallbackMessage: string;
  avatarUrl?: string;
  status: string;
}

export default function NewAgentPage() {
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [quotaReached, setQuotaReached] = useState(false);
  const [agentLimit, setAgentLimit] = useState(0);

  const router = useRouter();
  const { t } = useI18n();

  // Preventive quota guard: check whether the plan's agent limit is reached
  // before letting the user fill out the whole form for a 403 at the end.
  // Any API failure is treated as "quota unknown" -> do NOT block (backend still enforces).
  useEffect(() => {
    let cancelled = false;

    const checkQuota = async () => {
      try {
        const [agentsRes, usageRes] = await Promise.all([
          api.getAgents().catch(() => null),
          api.getSubscriptionUsage().catch(() => null),
        ]);

        if (cancelled) return;

        // maxAgents from usage summary (endpoint returns usage.agents.limit;
        // fall back to limits.maxAgents if the shape ever differs).
        const usageData: any = (usageRes as any)?.data ?? usageRes;
        const maxAgents = Number(
          usageData?.usage?.agents?.limit ??
            usageData?.limits?.maxAgents ??
            0,
        );

        // Current agent count: only agents that occupy a slot count.
        // An inactive agent can be deactivated to free a slot, so it is excluded
        // (mirrors the backend checkAgentLimit which ignores inactive agents).
        const agentsData: any = (agentsRes as any)?.data;
        const currentAgentCount = Array.isArray(agentsData)
          ? agentsData.filter((a: any) => a?.status !== 'inactive').length
          : Number(usageData?.usage?.agents?.current ?? 0);

        // maxAgents <= 0 means unlimited -> never block.
        if (maxAgents > 0 && currentAgentCount >= maxAgents) {
          setAgentLimit(maxAgents);
          setQuotaReached(true);
        } else {
          setQuotaReached(false);
        }
      } catch {
        // Quota unknown: never block the form on our side.
        if (!cancelled) setQuotaReached(false);
      }
    };

    checkQuota();
    return () => {
      cancelled = true;
    };
  }, []);

  const PERSONALITY_PRESETS = [
    { id: 'professional', name: t('agentForm.toneProfessional'), description: t('agentForm.toneProfessionalDesc') },
    { id: 'friendly', name: t('agentForm.toneFriendly'), description: t('agentForm.toneFriendlyDesc') },
    { id: 'casual', name: t('agentForm.toneCasual'), description: t('agentForm.toneCasualDesc') },
    { id: 'formal', name: t('agentForm.toneFormal'), description: t('agentForm.toneFormalDesc') },
    { id: 'empathetic', name: t('agentForm.toneEmpathetic'), description: t('agentForm.toneEmpatheticDesc') },
    { id: 'technical', name: t('agentForm.toneTechnical'), description: t('agentForm.toneTechnicalDesc') },
  ];

  const LANGUAGES = [
    { code: 'en', name: t('agentForm.langEnglish') },
    { code: 'fr', name: t('agentForm.langFrench') },
    { code: 'es', name: t('agentForm.langSpanish') },
    { code: 'de', name: t('agentForm.langGerman') },
    { code: 'it', name: t('agentForm.langItalian') },
    { code: 'pt', name: t('agentForm.langPortuguese') },
    { code: 'zh', name: t('agentForm.langChinese') },
    { code: 'ja', name: t('agentForm.langJapanese') },
    { code: 'ar', name: t('agentForm.langArabic') },
  ];

  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    tone: 'professional',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 2000,
    primaryLanguage: 'en',
    knowledgeBaseIds: [],
    welcomeMessage: 'Hello! How can I help you today?',
    fallbackMessage: "I'm sorry, I didn't understand that. Could you please rephrase your question?",
    status: 'inactive',
  });

  const updateFormData = (updates: Partial<AgentFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(t('agentForm.errNameRequired'));
      return;
    }

    if (!formData.systemPrompt.trim()) {
      toast.error(t('agentForm.errPromptRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        primaryLanguage: formData.primaryLanguage,
        tone: formData.tone,
        welcomeMessage: formData.welcomeMessage,
        fallbackMessage: formData.fallbackMessage,
        config: {
          temperature: formData.temperature,
          maxTokens: formData.maxTokens,
        },
        knowledgeBaseIds: formData.knowledgeBaseIds,
        avatarUrl: formData.avatarUrl,
      };

      const response = await apiHelpers.agents.create(payload);
      analytics.track('agent_created', { agentId: response.data.id, name: payload.name });
      toast.success(t('agentForm.createdSuccess'));
      router.push(`/agents/${response.data.id}/edit`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('agentForm.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) {
      toast.error(t('agentForm.errTestMessageRequired'));
      return;
    }

    setTesting(true);
    try {
      // Preview mode - simulate response based on current configuration
      // This is a preview since the agent hasn't been created yet
      const previewResponse = t('agentForm.previewResponse')
        .replace('{tone}', formData.tone)
        .replace('{message}', testMessage);

      await new Promise(resolve => setTimeout(resolve, 1000));
      setTestResponse(previewResponse);
      toast.success(t('agentForm.previewToast'));
    } catch (error) {
      toast.error(t('agentForm.previewFailed'));
    } finally {
      setTesting(false);
    }
  };

  const tabs = [
    { id: 'basic', name: t('agentForm.tabBasic'), icon: Bot },
    { id: 'personality', name: t('agentForm.tabPersonality'), icon: Brain },
    { id: 'model', name: t('agentForm.tabModel'), icon: Zap },
    { id: 'knowledge', name: t('agentForm.tabKnowledge'), icon: BookOpen },
    { id: 'messages', name: t('agentForm.tabMessages'), icon: MessageSquare },
    { id: 'advanced', name: t('agentForm.tabAdvanced'), icon: Settings },
    { id: 'test', name: t('agentForm.tabPreview'), icon: TestTube },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.agentName')} *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                placeholder={t('agentForm.agentNamePlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.descriptionLabel')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                placeholder={t('agentForm.descriptionPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.primaryLanguage')}
              </label>
              <select
                value={formData.primaryLanguage}
                onChange={(e) => updateFormData({ primaryLanguage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.avatarUrl')}
              </label>
              <input
                type="url"
                value={formData.avatarUrl || ''}
                onChange={(e) => updateFormData({ avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.png"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('agentForm.avatarUrlHelp')}
              </p>
            </div>
          </div>
        );

      case 'personality':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {t('agentForm.agentTone')}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PERSONALITY_PRESETS.map(preset => (
                  <label
                    key={preset.id}
                    className={clsx(
                      'relative cursor-pointer rounded-lg border p-4 transition-all hover:bg-gray-50 dark:hover:bg-gray-800',
                      formData.tone === preset.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    <input
                      type="radio"
                      name="tone"
                      value={preset.id}
                      checked={formData.tone === preset.id}
                      onChange={(e) => updateFormData({ tone: e.target.value })}
                      className="sr-only"
                    />
                    <div className="font-medium text-gray-900 dark:text-white">
                      {preset.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {preset.description}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.systemPrompt')} *
              </label>
              <RichTextEditor
                value={formData.systemPrompt}
                onChange={(value) => updateFormData({ systemPrompt: value })}
                placeholder={t('agentForm.systemPromptPlaceholder')}
                height="300px"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('agentForm.systemPromptHelp')}
              </p>
            </div>
          </div>
        );

      case 'model':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                {t('agentForm.modelConfigTitle')}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                {t('agentForm.modelConfigDesc')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('agentForm.temperature')}: {formData.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => updateFormData({ temperature: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>{t('agentForm.tempFocused')}</span>
                  <span>{t('agentForm.tempBalanced')}</span>
                  <span>{t('agentForm.tempCreative')}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('agentForm.temperatureHelp')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('agentForm.maxTokens')}
                </label>
                <input
                  type="number"
                  min="100"
                  max="32000"
                  value={formData.maxTokens}
                  onChange={(e) => updateFormData({ maxTokens: parseInt(e.target.value) || 2000 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('agentForm.maxTokensHelp')}
                </p>
              </div>
            </div>
          </div>
        );

      case 'knowledge':
        return (
          <div className="space-y-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-300 mb-1">
                {t('agentForm.kbAssocTitle')}
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                {t('agentForm.kbAssocDesc')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {t('agentForm.kbIdsLabel')}
              </label>
              <textarea
                value={formData.knowledgeBaseIds.join(', ')}
                onChange={(e) => {
                  const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                  updateFormData({ knowledgeBaseIds: ids });
                }}
                placeholder={t('agentForm.kbIdsPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('agentForm.kbIdsHelp')}
              </p>
            </div>

            {formData.knowledgeBaseIds.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('agentForm.kbAssociated')} ({formData.knowledgeBaseIds.length})
                </h4>
                <div className="space-y-2">
                  {formData.knowledgeBaseIds.map((kbId, index) => (
                    <div
                      key={kbId}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {kbId}
                      </span>
                      <button
                        onClick={() => {
                          const newIds = formData.knowledgeBaseIds.filter(id => id !== kbId);
                          updateFormData({ knowledgeBaseIds: newIds });
                        }}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        {t('agentForm.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'messages':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.welcomeMessage')}
              </label>
              <textarea
                value={formData.welcomeMessage}
                onChange={(e) => updateFormData({ welcomeMessage: e.target.value })}
                placeholder={t('agentForm.welcomeMessagePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.fallbackMessage')}
              </label>
              <textarea
                value={formData.fallbackMessage}
                onChange={(e) => updateFormData({ fallbackMessage: e.target.value })}
                placeholder={t('agentForm.fallbackMessagePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.agentStatus')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData({ status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="active">{t('agentForm.statusActive')}</option>
                <option value="inactive">{t('agentForm.statusInactive')}</option>
                <option value="training">{t('agentForm.statusTraining')}</option>
                <option value="maintenance">{t('agentForm.statusMaintenance')}</option>
              </select>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('agentForm.agentStatusHelp')}
              </p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.additionalSettings')}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('agentForm.additionalSettingsDesc')}
              </p>
            </div>
          </div>
        );

      case 'test':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                {t('agentForm.previewModeTitle')}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                {t('agentForm.previewModeDesc')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('agentForm.testMessageLabel')}
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder={t('agentForm.testMessagePlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  onClick={handleTest}
                  disabled={testing || !testMessage.trim()}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {testing ? t('agentForm.previewing') : t('agentForm.previewButton')}
                </button>
              </div>
            </div>

            {testResponse && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('agentForm.configPreview')}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {testResponse}
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

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
              {t('agentForm.createTitle')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('agentForm.createSubtitle')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={quotaReached || saving}
            className={clsx(
              'flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors',
              quotaReached && 'cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? t('agentForm.saving') : t('agentForm.saveAgent')}
          </button>
        </div>
      </div>

      {/* Quota reached banner */}
      {quotaReached && (
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t('agentForm.quotaReachedBanner').replace('{{limit}}', String(agentLimit))}
            </p>
          </div>
          <button
            onClick={() => router.push('/billing')}
            className="flex-shrink-0 inline-flex items-center justify-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('agentForm.upgradePlan')}
          </button>
        </div>
      )}

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
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
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