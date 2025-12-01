'use client';

import React, { useState, useRef } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Link,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save,
  X
} from 'lucide-react';

interface RichTextEditorProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onSaveComplete: (document: any) => void;
}

export function RichTextEditor({ 
  isOpen, 
  onClose, 
  knowledgeBaseId, 
  knowledgeBaseName,
  onSaveComplete 
}: RichTextEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      alert('Veuillez saisir un titre et du contenu');
      return;
    }

    setIsSaving(true);
    try {
      // Create a rich text document
      const response = await fetch('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
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
      console.error('Error saving rich text:', error);
      alert('Erreur lors de la sauvegarde du document');
    } finally {
      setIsSaving(false);
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  const handleEditorChange = () => {
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  const insertHTML = (html: string) => {
    document.execCommand('insertHTML', false, html);
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
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

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          {/* Text Formatting */}
          <div className="flex items-center border-r border-gray-300 dark:border-gray-600 pr-2 mr-2">
            <button
              onClick={() => execCommand('bold')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('italic')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('underline')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Underline className="w-4 h-4" />
            </button>
          </div>

          {/* Headings */}
          <div className="flex items-center border-r border-gray-300 dark:border-gray-600 pr-2 mr-2">
            <button
              onClick={() => execCommand('formatBlock', 'h1')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('formatBlock', 'h2')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('formatBlock', 'h3')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Heading3 className="w-4 h-4" />
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center border-r border-gray-300 dark:border-gray-600 pr-2 mr-2">
            <button
              onClick={() => execCommand('insertUnorderedList')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('insertOrderedList')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
          </div>

          {/* Quote and Code */}
          <div className="flex items-center border-r border-gray-300 dark:border-gray-600 pr-2 mr-2">
            <button
              onClick={() => execCommand('formatBlock', 'blockquote')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              onClick={() => insertHTML('<code></code>')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>

          {/* Alignment */}
          <div className="flex items-center">
            <button
              onClick={() => execCommand('justifyLeft')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('justifyCenter')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              onClick={() => execCommand('justifyRight')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <AlignRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleEditorChange}
            className="flex-1 p-6 overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
            style={{
              minHeight: '300px',
              lineHeight: '1.6',
            }}
            suppressContentEditableWarning={true}
            data-placeholder="Commencez à saisir votre texte ici..."
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