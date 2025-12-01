'use client';

import React, { useState, useEffect } from 'react';
import { X, Database, Settings, Tag, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
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

interface CreateKnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (knowledgeBase: Partial<KnowledgeBase>) => void;
  knowledgeBase?: KnowledgeBase | null;
  isLoading?: boolean;
}

export function CreateKnowledgeBaseModal({
  isOpen,
  onClose,
  onSubmit,
  knowledgeBase,
  isLoading = false,
}: CreateKnowledgeBaseModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: [] as string[],
    settings: {
      chunking: {
        strategy: 'recursive' as 'fixed' | 'semantic' | 'recursive',
        chunkSize: 1000,
        overlap: 100,
      },
      embedding: {
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        dimensions: 384,
      },
      search: {
        similarityThreshold: 0.7,
        maxResults: 5,
      },
    },
  });

  const [newTag, setNewTag] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'settings'>('general');

  useEffect(() => {
    if (knowledgeBase) {
      setFormData({
        name: knowledgeBase.name || '',
        description: knowledgeBase.description || '',
        tags: knowledgeBase.tags || [],
        settings: {
          chunking: {
            strategy: (knowledgeBase.settings?.chunking?.strategy as 'recursive') || 'recursive',
            chunkSize: knowledgeBase.settings?.chunking?.chunkSize || 1000,
            overlap: knowledgeBase.settings?.chunking?.overlap || 100,
          },
          embedding: {
            model: knowledgeBase.settings?.embedding?.model || 'sentence-transformers/all-MiniLM-L6-v2',
            dimensions: knowledgeBase.settings?.embedding?.dimensions || 384,
          },
          search: {
            similarityThreshold: knowledgeBase.settings?.search?.similarityThreshold || 0.7,
            maxResults: knowledgeBase.settings?.search?.maxResults || 5,
          },
        },
      });
    } else {
      // Reset form for new knowledge base
      setFormData({
        name: '',
        description: '',
        tags: [],
        settings: {
          chunking: {
            strategy: 'recursive',
            chunkSize: 1000,
            overlap: 100,
          },
          embedding: {
            model: 'sentence-transformers/all-MiniLM-L6-v2',
            dimensions: 384,
          },
          search: {
            similarityThreshold: 0.7,
            maxResults: 5,
          },
        },
      });
    }
    setActiveTab('general');
  }, [knowledgeBase, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      return;
    }

    onSubmit({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      tags: formData.tags.length > 0 ? formData.tags : undefined,
      settings: formData.settings,
    });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Database className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {knowledgeBase ? 'Modifier la base de connaissances' : 'Nouvelle base de connaissances'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs - Fixed */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('general')}
              className={clsx(
                'py-3 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'general'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Général
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={clsx(
                'py-3 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              <Settings className="w-4 h-4 inline-block mr-2" />
              Paramètres
            </button>
          </nav>
        </div>

        {/* Content - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'general' && (
              <>
                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nom de la base de connaissances *
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Support Client, Documentation Produit..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Décrivez le contenu et l'usage de cette base de connaissances..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags
                  </label>
                  <div className="space-y-3">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                        placeholder="Ajouter un tag..."
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                          >
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="ml-2 hover:text-blue-600 dark:hover:text-blue-300"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'settings' && (
              <>
                {/* Chunking Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Paramètres de découpage
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Stratégie de découpage
                    </label>
                    <select
                      value={formData.settings.chunking.strategy}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          chunking: {
                            ...prev.settings.chunking,
                            strategy: e.target.value as 'fixed' | 'semantic' | 'recursive',
                          },
                        },
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="recursive">Récursif (recommandé)</option>
                      <option value="fixed">Fixe</option>
                      <option value="semantic">Sémantique</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Taille des chunks
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="4000"
                        step="100"
                        value={formData.settings.chunking.chunkSize}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            chunking: {
                              ...prev.settings.chunking,
                              chunkSize: parseInt(e.target.value) || 1000,
                            },
                          },
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Chevauchement
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="500"
                        step="10"
                        value={formData.settings.chunking.overlap}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            chunking: {
                              ...prev.settings.chunking,
                              overlap: parseInt(e.target.value) || 100,
                            },
                          },
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Embedding Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Paramètres d'embedding
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Modèle d'embedding
                    </label>
                    <input
                      type="text"
                      value={formData.settings.embedding.model}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          embedding: {
                            ...prev.settings.embedding,
                            model: e.target.value,
                          },
                        },
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Dimensions
                    </label>
                    <input
                      type="number"
                      min="128"
                      max="1536"
                      step="1"
                      value={formData.settings.embedding.dimensions}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          embedding: {
                            ...prev.settings.embedding,
                            dimensions: parseInt(e.target.value) || 384,
                          },
                        },
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Search Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Paramètres de recherche
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Seuil de similarité
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={formData.settings.search.similarityThreshold}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            search: {
                              ...prev.settings.search,
                              similarityThreshold: parseFloat(e.target.value) || 0.7,
                            },
                          },
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Résultats max
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        value={formData.settings.search.maxResults}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            search: {
                              ...prev.settings.search,
                              maxResults: parseInt(e.target.value) || 5,
                            },
                          },
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer - Fixed */}
          <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'En cours...' : (knowledgeBase ? 'Modifier' : 'Créer une base')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}