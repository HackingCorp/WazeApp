'use client';

import React, { useMemo, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Table,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Type,
  Palette,
  FileText,
  Eye,
  Save,
  Loader2,
} from 'lucide-react';
import { FileUpload } from './FileUpload';
import clsx from 'clsx';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { 
  ssr: false,
  loading: () => <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
});

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: string;
  showToolbar?: boolean;
  showPreview?: boolean;
  onSave?: (content: string) => Promise<void>;
  className?: string;
}

const TOOLBAR_CONFIG = [
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
  [{ 'font': [] }],
  [{ 'size': ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ 'color': [] }, { 'background': [] }],
  [{ 'script': 'sub' }, { 'script': 'super' }],
  [{ 'list': 'ordered' }, { 'list': 'bullet' }],
  [{ 'indent': '-1' }, { 'indent': '+1' }],
  [{ 'direction': 'rtl' }],
  [{ 'align': [] }],
  ['blockquote', 'code-block'],
  ['link', 'image', 'video'],
  ['clean'],
];

export function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Start writing...',
  readOnly = false,
  height = '400px',
  showToolbar = true,
  showPreview = false,
  onSave,
  className = '',
}: RichTextEditorProps) {
  const [content, setContent] = useState(value);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  // const quillRef = useRef<any>(null); // Removed for build compatibility

  const modules = useMemo(() => ({
    toolbar: {
      container: showToolbar ? TOOLBAR_CONFIG : false,
      handlers: {
        image: () => setShowImageUpload(true),
      },
    },
    history: {
      delay: 1000,
      maxStack: 500,
      userOnly: true,
    },
    clipboard: {
      matchVisual: false,
    },
  }), [showToolbar]);

  const formats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'link', 'image', 'video',
    'color', 'background',
    'align', 'script',
    'code-block', 'direction',
  ];

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    onChange?.(newContent);
  }, [onChange]);

  const handleSave = async () => {
    if (!onSave) return;
    
    setSaving(true);
    try {
      await onSave(content);
    } catch (error) {
      console.error('Failed to save content:', error);
    } finally {
      setSaving(false);
    }
  };

  const insertImage = useCallback((imageUrl: string) => {
    // For now, we'll append the image to the content
    // In a full implementation, you'd get the quill instance differently
    handleChange(content + `<img src="${imageUrl}" alt="Uploaded image" />`);
    setShowImageUpload(false);
  }, [content, handleChange]);

  const handleImageUpload = (files: any[]) => {
    if (files.length > 0 && files[0].url) {
      insertImage(files[0].url);
    }
  };

  const CustomToolbar = () => (
    <div className="flex flex-wrap items-center gap-1 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      {/* Format buttons */}
      <div className="flex items-center gap-1 mr-2">
        <select className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          <option value="">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      {/* Text formatting */}
      <div className="flex items-center gap-1 mr-2">
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Bold className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Italic className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Underline className="w-4 h-4" />
        </button>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1 mr-2">
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <List className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <ListOrdered className="w-4 h-4" />
        </button>
      </div>

      {/* Alignment */}
      <div className="flex items-center gap-1 mr-2">
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <AlignCenter className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <AlignRight className="w-4 h-4" />
        </button>
      </div>

      {/* Insert */}
      <div className="flex items-center gap-1 mr-2">
        <button 
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={() => setShowImageUpload(true)}
        >
          <Image className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Link className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Quote className="w-4 h-4" />
        </button>
        <button className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
          <Code className="w-4 h-4" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-auto">
        {showPreview && (
          <button
            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
            className={clsx(
              'flex items-center px-3 py-2 rounded text-sm font-medium transition-colors',
              mode === 'preview'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {mode === 'edit' ? <Eye className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </button>
        )}
        
        {onSave && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );

  const PreviewContent = () => (
    <div 
      className="prose prose-sm max-w-none dark:prose-invert p-6 min-h-[400px]"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );

  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}>
      {showToolbar && <CustomToolbar />}
      
      {mode === 'edit' ? (
        <div className="relative">
          <ReactQuill
            theme="snow"
            value={content}
            onChange={handleChange}
            readOnly={readOnly}
            placeholder={placeholder}
            modules={modules}
            formats={formats}
            style={{ height }}
            className="bg-white dark:bg-gray-900"
          />
          
          {/* Image upload modal */}
          {showImageUpload && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Upload Image
                  </h3>
                  <button
                    onClick={() => setShowImageUpload(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    ×
                  </button>
                </div>
                
                <FileUpload
                  accept="image/*"
                  multiple={false}
                  onUpload={handleImageUpload}
                  maxFiles={1}
                />
                
                <div className="mt-4 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowImageUpload(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <PreviewContent />
      )}
    </div>
  );
}

// Custom styles for the editor
export const richTextEditorStyles = `
  .ql-toolbar {
    border: none !important;
    border-bottom: 1px solid #e5e7eb !important;
  }
  
  .ql-container {
    border: none !important;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif !important;
  }
  
  .ql-editor {
    padding: 1.5rem !important;
    min-height: 300px !important;
  }
  
  .ql-editor.ql-blank::before {
    font-style: normal !important;
    color: #9ca3af !important;
  }
  
  /* Dark mode support */
  .dark .ql-toolbar {
    background-color: #1f2937 !important;
    border-bottom-color: #374151 !important;
  }
  
  .dark .ql-container {
    background-color: #111827 !important;
  }
  
  .dark .ql-editor {
    color: #f9fafb !important;
  }
  
  .dark .ql-picker {
    color: #f9fafb !important;
  }
  
  .dark .ql-stroke {
    stroke: #9ca3af !important;
  }
  
  .dark .ql-fill {
    fill: #9ca3af !important;
  }
`;