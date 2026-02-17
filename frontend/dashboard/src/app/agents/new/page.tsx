'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { useI18n } from '@/providers/I18nProvider';
import { apiHelpers } from '@/lib/api';
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

const PERSONALITY_PRESETS = [
  { id: 'professional', name: 'Professional', description: 'Formal, helpful, and business-focused' },
  { id: 'friendly', name: 'Friendly', description: 'Warm, approachable, and conversational' },
  { id: 'casual', name: 'Casual', description: 'Relaxed, informal, and easy-going' },
  { id: 'formal', name: 'Formal', description: 'Respectful, traditional, and polished' },
  { id: 'empathetic', name: 'Empathetic', description: 'Understanding, compassionate, and supportive' },
  { id: 'technical', name: 'Technical', description: 'Precise, detailed, and expert-level' },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
];

export default function NewAgentPage() {
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');

  const router = useRouter();
  const { t } = useI18n();

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
      toast.error('Please enter a name for your agent');
      return;
    }

    if (!formData.systemPrompt.trim()) {
      toast.error('Please enter system instructions for your agent');
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
      toast.success('Agent created successfully!');
      router.push(`/agents/${response.data.id}/edit`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) {
      toast.error('Please enter a test message');
      return;
    }

    setTesting(true);
    try {
      // Preview mode - simulate response based on current configuration
      // This is a preview since the agent hasn't been created yet
      const previewResponse = `[Preview Mode] Based on your ${formData.tone} tone and current configuration, the agent would respond to "${testMessage}". To test the actual agent with real AI responses, please save the agent first.`;

      await new Promise(resolve => setTimeout(resolve, 1000));
      setTestResponse(previewResponse);
      toast.success('This is a preview. Save the agent to test with real AI responses.');
    } catch (error) {
      toast.error('Failed to generate preview');
    } finally {
      setTesting(false);
    }
  };

  const tabs = [
    { id: 'basic', name: 'Basic Info', icon: Bot },
    { id: 'personality', name: 'Tone & Instructions', icon: Brain },
    { id: 'model', name: 'Model Config', icon: Zap },
    { id: 'knowledge', name: 'Knowledge Base', icon: BookOpen },
    { id: 'messages', name: 'Messages', icon: MessageSquare },
    { id: 'advanced', name: 'Advanced', icon: Settings },
    { id: 'test', name: 'Preview', icon: TestTube },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Agent Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                placeholder="e.g., Customer Support Bot"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                placeholder="Brief description of what this agent does..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Primary Language
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
                Avatar URL (optional)
              </label>
              <input
                type="url"
                value={formData.avatarUrl || ''}
                onChange={(e) => updateFormData({ avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.png"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Optional URL to an avatar image for your agent
              </p>
            </div>
          </div>
        );

      case 'personality':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Agent Tone
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
                System Prompt *
              </label>
              <RichTextEditor
                value={formData.systemPrompt}
                onChange={(value) => updateFormData({ systemPrompt: value })}
                placeholder="Detailed instructions on how the agent should behave, respond, and handle different scenarios..."
                height="300px"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This is the core instruction set that defines your agent's behavior and capabilities
              </p>
            </div>
          </div>
        );

      case 'model':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                AI Model Configuration
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                The AI model is automatically selected based on your LLM provider settings. Configure the model parameters below.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Temperature: {formData.temperature}
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
                  <span>Focused (0)</span>
                  <span>Balanced (1)</span>
                  <span>Creative (2)</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Higher values make the output more random and creative
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Tokens
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
                  Maximum number of tokens to generate in responses (1-32000)
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
                Knowledge Base Association
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                To add knowledge to your agent, first create a Knowledge Base in the Knowledge Base section, then associate it with your agent after creation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Knowledge Base IDs (optional)
              </label>
              <textarea
                value={formData.knowledgeBaseIds.join(', ')}
                onChange={(e) => {
                  const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                  updateFormData({ knowledgeBaseIds: ids });
                }}
                placeholder="Enter knowledge base IDs separated by commas (e.g., kb-123, kb-456)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                You can add knowledge base IDs here or associate them after creating the agent
              </p>
            </div>

            {formData.knowledgeBaseIds.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Associated Knowledge Bases ({formData.knowledgeBaseIds.length})
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
                        Remove
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
                Welcome Message
              </label>
              <textarea
                value={formData.welcomeMessage}
                onChange={(e) => updateFormData({ welcomeMessage: e.target.value })}
                placeholder="The first message users see when starting a conversation..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fallback Message
              </label>
              <textarea
                value={formData.fallbackMessage}
                onChange={(e) => updateFormData({ fallbackMessage: e.target.value })}
                placeholder="Message to show when the agent doesn't understand the user..."
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
                Agent Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData({ status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="active">Active - Agent can receive and respond to messages</option>
                <option value="inactive">Inactive - Agent is disabled</option>
                <option value="training">Training - Agent is being trained</option>
                <option value="maintenance">Maintenance - Agent is under maintenance</option>
              </select>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Set the initial status for your agent. You can change this later.
              </p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Additional Settings
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Additional configuration options like usage limits, response timeouts, and rate limiting can be configured after creating the agent in the edit view.
              </p>
            </div>
          </div>
        );

      case 'test':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                Preview Mode
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                This is a configuration preview. To test the agent with real AI responses, please save the agent first, then use the test function from the agent's detail page.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Test Message (Preview)
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter a message to preview configuration..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  onClick={handleTest}
                  disabled={testing || !testMessage.trim()}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {testing ? 'Previewing...' : 'Preview'}
                </button>
              </div>
            </div>

            {testResponse && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Configuration Preview:
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
              Create New Agent
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure your AI agent's personality, knowledge, and behavior
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Agent'}
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