'use client';

import React from 'react';
import { X, AlertTriangle, Database, FileText } from 'lucide-react';

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalCharacters: number;
}

interface DeleteKnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  knowledgeBase: KnowledgeBase | null;
  isLoading?: boolean;
}

export function DeleteKnowledgeBaseModal({
  isOpen,
  onClose,
  onConfirm,
  knowledgeBase,
  isLoading = false,
}: DeleteKnowledgeBaseModalProps) {
  if (!isOpen || !knowledgeBase) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Supprimer la base de connaissances
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Êtes-vous sûr de vouloir supprimer la base de connaissances{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                "{knowledgeBase.name}"
              </span>
              ?
            </p>
            
            {knowledgeBase.description && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {knowledgeBase.description}
                </p>
              </div>
            )}

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-red-800 dark:text-red-200 font-medium mb-2">
                    Cette action est irréversible
                  </p>
                  <p className="text-red-700 dark:text-red-300 mb-3">
                    Toutes les données suivantes seront définitivement supprimées :
                  </p>
                  <ul className="space-y-1 text-red-700 dark:text-red-300">
                    <li className="flex items-center space-x-2">
                      <FileText className="w-4 h-4" />
                      <span>{knowledgeBase.documentCount} documents</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Database className="w-4 h-4" />
                      <span>{(knowledgeBase.totalCharacters / 1000).toFixed(0)}k caractères de contenu</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Database className="w-4 h-4" />
                      <span>Tous les embeddings et index de recherche</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pour confirmer, tapez le nom de la base de connaissances ci-dessous :
            </p>
          </div>

          <div className="mb-6">
            <input
              type="text"
              placeholder={knowledgeBase.name}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Suppression...' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}