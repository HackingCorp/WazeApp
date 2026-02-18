'use client';

import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';

interface RichTextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onSaveComplete: (document: any) => void;
}

export function RichTextEditorModal({
  isOpen,
  onClose,
  knowledgeBaseId,
  knowledgeBaseName,
  onSaveComplete
}: RichTextEditorModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      alert('Veuillez saisir un titre et du contenu');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`,
        },
        body: JSON.stringify({
          knowledgeBaseId,
          title,
          content,
          type: 'rich_text',
          filename: `${title.replace(/[^a-zA-Z0-9]/g, '_')}.html`,
          mimeType: 'text/html',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onSaveComplete(result.data);
        setTitle('');
        setContent('');
        onClose();
        alert('Document texte riche créé avec succès!');
      } else {
        throw new Error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error saving rich text:', error);
      }
      alert('Erreur lors de la sauvegarde du document');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Créer un document texte
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Base de connaissances: {knowledgeBaseName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title Input */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Titre du document..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-6">
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Commencez à saisir votre texte ici..."
            height="100%"
            showToolbar={true}
            showPreview={false}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {content.replace(/<[^>]*>/g, '').length} caractères
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim() || !content.trim()}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
