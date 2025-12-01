'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { FileUpload } from '@/components/ui/FileUpload';
import { useI18n } from '@/providers/I18nProvider';
import { apiHelpers } from '@/lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface AgentFormData {
  name: string;
  description: string;
  personality: string;
  instructions: string;
  model: string;
  temperature: number;
  maxTokens: number;
  language: string;
  knowledgeBase: string[];
  welcomeMessage: string;
  fallbackMessage: string;
  avatar?: string;
  color: string;
  enabled: boolean;
}

const AVAILABLE_MODELS = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', description: 'Most capable model' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI', description: 'Fast and efficient' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Latest Claude model' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', description: 'Fastest Claude model' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', description: 'Cost-effective option' },
];

const PERSONALITY_PRESETS = [
  { id: 'professional', name: 'Professional', description: 'Formal, helpful, and business-focused' },
  { id: 'friendly', name: 'Friendly', description: 'Warm, approachable, and conversational' },
  { id: 'technical', name: 'Technical', description: 'Precise, detailed, and expert-level' },
  { id: 'creative', name: 'Creative', description: 'Imaginative, inspiring, and innovative' },
  { id: 'supportive', name: 'Supportive', description: 'Empathetic, patient, and encouraging' },
  { id: 'concise', name: 'Concise', description: 'Brief, direct, and to-the-point' },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
];

const COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
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
    personality: 'professional',
    instructions: '',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    language: 'en',
    knowledgeBase: [],
    welcomeMessage: 'Hello! How can I help you today?',
    fallbackMessage: "I'm sorry, I didn't understand that. Could you please rephrase your question?",
    color: '#3b82f6',
    enabled: false,
  });

  const updateFormData = (updates: Partial<AgentFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name for your agent');
      return;
    }

    setSaving(true);
    try {
      const response = await apiHelpers.agents.create(formData);
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
      // For now, simulate a response - in real app, this would test against the agent
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const responses = [
        "Hello! I'm here to help you with any questions you might have.",
        "Thank you for your message. How can I assist you today?",
        "I understand you're looking for information. Let me help you with that.",
        "That's a great question! Based on my knowledge, I can provide you with the following information...",
      ];
      
      setTestResponse(responses[Math.floor(Math.random() * responses.length)]);
    } catch (error) {
      toast.error('Failed to test agent');
    } finally {
      setTesting(false);
    }
  };

  const tabs = [
    { id: 'basic', name: 'Basic Info', icon: Bot },
    { id: 'personality', name: 'Personality', icon: Brain },
    { id: 'model', name: 'AI Model', icon: Zap },
    { id: 'knowledge', name: 'Knowledge', icon: BookOpen },
    { id: 'messages', name: 'Messages', icon: MessageSquare },
    { id: 'advanced', name: 'Advanced', icon: Settings },
    { id: 'test', name: 'Test', icon: TestTube },
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
                Language
              </label>
              <select
                value={formData.language}
                onChange={(e) => updateFormData({ language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Avatar & Color
              </label>
              <div className="flex items-center space-x-4">
                <div 
                  className="w-16 h-16 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: formData.color }}
                >
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => updateFormData({ color })}
                      className={clsx(
                        'w-8 h-8 rounded-full border-2 transition-all',
                        formData.color === color
                          ? 'border-gray-900 dark:border-white scale-110'
                          : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'personality':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Personality Preset
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PERSONALITY_PRESETS.map(preset => (
                  <label
                    key={preset.id}
                    className={clsx(
                      'relative cursor-pointer rounded-lg border p-4 transition-all hover:bg-gray-50 dark:hover:bg-gray-800',
                      formData.personality === preset.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    <input
                      type="radio"
                      name="personality"
                      value={preset.id}
                      checked={formData.personality === preset.id}
                      onChange={(e) => updateFormData({ personality: e.target.value })}
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
                Custom Instructions
              </label>
              <RichTextEditor
                value={formData.instructions}
                onChange={(value) => updateFormData({ instructions: value })}
                placeholder="Detailed instructions on how the agent should behave, respond, and handle different scenarios..."
                height="300px"
              />
            </div>
          </div>
        );

      case 'model':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                AI Model
              </label>
              <div className="space-y-3">
                {AVAILABLE_MODELS.map(model => (
                  <label
                    key={model.id}
                    className={clsx(
                      'relative cursor-pointer rounded-lg border p-4 transition-all hover:bg-gray-50 dark:hover:bg-gray-800 flex items-start',
                      formData.model === model.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={model.id}
                      checked={formData.model === model.id}
                      onChange={(e) => updateFormData({ model: e.target.value })}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {model.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {model.provider}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {model.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Temperature: {formData.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => updateFormData({ temperature: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Focused</span>
                  <span>Creative</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="100"
                  max="4000"
                  value={formData.maxTokens}
                  onChange={(e) => updateFormData({ maxTokens: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          </div>
        );

      case 'knowledge':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Upload Knowledge Base Files
              </label>
              <FileUpload
                accept=".pdf,.txt,.md,.doc,.docx"
                multiple={true}
                onUpload={(files) => {
                  const fileIds = files.map(f => f.id);
                  updateFormData({ knowledgeBase: [...formData.knowledgeBase, ...fileIds] });
                }}
              />
            </div>

            {formData.knowledgeBase.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Uploaded Files ({formData.knowledgeBase.length})
                </h4>
                <div className="space-y-2">
                  {formData.knowledgeBase.map((fileId, index) => (
                    <div
                      key={fileId}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Knowledge file {index + 1}
                      </span>
                      <button
                        onClick={() => {
                          const newFiles = formData.knowledgeBase.filter(id => id !== fileId);
                          updateFormData({ knowledgeBase: newFiles });
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
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enable Agent
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  When enabled, this agent can receive and respond to messages
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => updateFormData({ enabled: e.target.checked })}
                  className="sr-only"
                />
                <div className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out',
                  formData.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                )}>
                  <div className={clsx(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ease-in-out',
                    formData.enabled ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </div>
              </label>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Usage Limits
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Max conversations per day
                  </label>
                  <input
                    type="number"
                    defaultValue={100}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Response timeout (seconds)
                  </label>
                  <input
                    type="number"
                    defaultValue={30}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'test':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Test Message
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter a message to test your agent..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  onClick={handleTest}
                  disabled={testing || !testMessage.trim()}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              </div>
            </div>

            {testResponse && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Agent Response:
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