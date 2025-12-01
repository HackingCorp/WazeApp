'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, File, AlertCircle, CheckCircle, Trash2, Plus, FileText, Image, Video, Music, Link } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/api';

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
}

interface UrlUpload {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

type TabType = 'files' | 'url';

interface UploadDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onUploadComplete?: (uploadedFiles: UploadedFile[]) => void;
}

export function UploadDocumentsModal({
  isOpen,
  onClose,
  knowledgeBaseId,
  knowledgeBaseName,
  onUploadComplete,
}: UploadDocumentsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('url');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [urls, setUrls] = useState<UrlUpload[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supported file types
  const supportedTypes = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'text/plain': 'TXT',
    'text/markdown': 'MD',
    'text/csv': 'CSV',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WEBP',
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'video/mp4': 'MP4',
    'video/webm': 'WEBM',
  };

  const maxFileSize = 50 * 1024 * 1024; // 50MB
  const maxFiles = 10;

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
    if (file.type.startsWith('video/')) return <Video className="w-5 h-5 text-purple-500" />;
    if (file.type.startsWith('audio/')) return <Music className="w-5 h-5 text-orange-500" />;
    if (file.type.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `Le fichier dépasse la taille limite de ${formatFileSize(maxFileSize)}`;
    }

    if (!Object.keys(supportedTypes).includes(file.type)) {
      return 'Type de fichier non supporté';
    }

    return null;
  };

  const handleFiles = (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    Array.from(fileList).forEach((file) => {
      const error = validateFile(file);
      
      if (error) {
        errors.push(`${file.name}: ${error}`);
        return;
      }

      // Check if file already exists
      const exists = files.some(f => f.file.name === file.name && f.file.size === file.size);
      if (exists) {
        errors.push(`${file.name}: Fichier déjà ajouté`);
        return;
      }

      newFiles.push({
        id: generateId(),
        file,
        status: 'pending',
        progress: 0,
      });
    });

    if (files.length + newFiles.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} fichiers autorisés`);
      return;
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      handleFiles(selectedFiles);
    }
    // Reset input
    e.target.value = '';
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // URL handling functions
  const addUrl = () => {
    if (!urlInput.trim() || !urlTitle.trim()) return;
    
    const newUrl: UrlUpload = {
      id: generateId(),
      url: urlInput.trim(),
      title: urlTitle.trim(),
      status: 'pending'
    };
    
    setUrls([...urls, newUrl]);
    setUrlInput('');
    setUrlTitle('');
  };

  const removeUrl = (id: string) => {
    setUrls(urls.filter(u => u.id !== id));
  };

  const resetUrls = () => {
    setUrls([]);
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const uploadFileToServer = async (uploadedFile: UploadedFile): Promise<void> => {
    try {
      // Start with some progress
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id 
          ? { ...f, progress: 10 }
          : f
      ));

      // Call the real API
      const response = await api.uploadDocument(
        uploadedFile.file,
        knowledgeBaseId,
        uploadedFile.file.name
      );

      if (response.success) {
        // Success - mark as uploaded
        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id 
            ? { ...f, status: 'uploaded', progress: 100 }
            : f
        ));
      } else {
        // API returned error
        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id 
            ? { 
                ...f, 
                status: 'error', 
                error: response.error || 'Erreur lors du téléversement'
              }
            : f
        ));
        throw new Error(response.error || 'Upload failed');
      }
    } catch (error) {
      // Network or other error
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id 
          ? { 
              ...f, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Erreur réseau'
            }
          : f
      ));
      throw error;
    }
  };

  const uploadUrlToServer = async (urlUpload: UrlUpload): Promise<void> => {
    try {
      setUrls(prev => prev.map(u => 
        u.id === urlUpload.id 
          ? { ...u, status: 'uploading' }
          : u
      ));

      const response = await api.uploadFromUrl({
        url: urlUpload.url,
        title: urlUpload.title,
        knowledgeBaseId
      });

      if (response.success) {
        setUrls(prev => prev.map(u => 
          u.id === urlUpload.id 
            ? { ...u, status: 'uploaded' }
            : u
        ));
      } else {
        setUrls(prev => prev.map(u => 
          u.id === urlUpload.id 
            ? { 
                ...u, 
                status: 'error', 
                error: response.error || 'Upload failed'
              }
            : u
        ));
        throw new Error(response.error || 'Upload failed');
      }
    } catch (error) {
      console.error('URL upload error:', error);
      setUrls(prev => prev.map(u => 
        u.id === urlUpload.id 
          ? { 
              ...u, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Erreur réseau'
            }
          : u
      ));
      throw error;
    }
  };

  const handleUpload = async () => {
    setIsUploading(true);
    
    const pendingFiles = files.filter(f => f.status === 'pending');
    const pendingUrls = urls.filter(u => u.status === 'pending');
    
    // Mark all files and URLs as uploading
    setFiles(prev => prev.map(f => 
      f.status === 'pending' ? { ...f, status: 'uploading' } : f
    ));
    setUrls(prev => prev.map(u => 
      u.status === 'pending' ? { ...u, status: 'uploading' } : u
    ));

    // Upload files and URLs concurrently
    try {
      await Promise.allSettled([
        ...pendingFiles.map(file => uploadFileToServer(file)),
        ...pendingUrls.map(url => uploadUrlToServer(url))
      ]);

      // Wait a moment to show completion and check for successful uploads
      setTimeout(() => {
        const currentFiles = files;
        const currentUrls = urls;
        const uploadedFiles = currentFiles.filter(f => f.status === 'uploaded');
        const uploadedUrls = currentUrls.filter(u => u.status === 'uploaded');
        const hasErrors = currentFiles.some(f => f.status === 'error') || currentUrls.some(u => u.status === 'error');
        
        if (uploadedFiles.length > 0 || uploadedUrls.length > 0) {
          onUploadComplete?.(uploadedFiles);
        }
        
        // Only close modal if all uploads were successful or user wants to retry
        if (!hasErrors || uploadedFiles.length > 0 || uploadedUrls.length > 0) {
          setFiles([]);
          setUrls([]);
          setIsUploading(false);
          onClose();
        } else {
          setIsUploading(false);
        }
      }, 1000);

    } catch (error) {
      console.error('Upload process error:', error);
      setIsUploading(false);
    }
  };

  const canUpload = (files.some(f => f.status === 'pending') || urls.some(u => u.status === 'pending')) && !isUploading;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl h-[80vh] overflow-hidden flex flex-col">
        {/* Header with Upload Button */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Ajouter des documents
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Base de connaissances: {knowledgeBaseName}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isUploading}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-4">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'files'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Upload className="w-4 h-4 mr-2" />
              Fichiers
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'url'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Link className="w-4 h-4 mr-2" />
              URL
            </button>
          </div>
          
          {/* Upload Button and Status - Always visible */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {(files.length > 0 || urls.length > 0) && (
                <>
                  {files.filter(f => f.status === 'uploaded').length + urls.filter(u => u.status === 'uploaded').length} téléversé(s) • 
                  {files.filter(f => f.status === 'error').length + urls.filter(u => u.status === 'error').length} erreur(s) • 
                  {files.filter(f => f.status === 'pending').length + urls.filter(u => u.status === 'pending').length} en attente
                </>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              {!isUploading && (
                <button
                  onClick={handleUpload}
                  disabled={!canUpload}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    canUpload 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                  }`}
                >
                  {(files.length > 0 || urls.length > 0)
                    ? `Téléverser ${files.filter(f => f.status === 'pending').length + urls.filter(u => u.status === 'pending').length} élément(s)`
                    : 'Téléverser les éléments'
                  }
                </button>
              )}
              
              {isUploading && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Téléversement...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area - Force scroll visibility */}
        <div className="flex-1 overflow-y-scroll" style={{overscrollBehavior: 'contain'}}>
          <div className="p-6">
            {/* Files Tab */}
            {activeTab === 'files' && (
              <>
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={clsx(
                    'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                    isDragActive
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  )}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Glissez-déposez vos fichiers ici
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    ou cliquez pour sélectionner des fichiers
                  </p>
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Sélectionner des fichiers
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={Object.keys(supportedTypes).join(',')}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    Formats supportés: {Object.values(supportedTypes).join(', ')}<br />
                    Taille max: {formatFileSize(maxFileSize)} • Max {maxFiles} fichiers
                  </p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                      Fichiers sélectionnés ({files.length})
                    </h4>
                    
                    <div className="space-y-3">
                      {files.map((uploadedFile) => (
                        <div
                          key={uploadedFile.id}
                          className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <div className="flex-shrink-0">
                            {getFileIcon(uploadedFile.file)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {uploadedFile.file.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(uploadedFile.file.size)} • {supportedTypes[uploadedFile.file.type as keyof typeof supportedTypes] || uploadedFile.file.type}
                            </p>
                            
                            {/* Progress bar */}
                            {uploadedFile.status === 'uploading' && (
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                  <div 
                                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                                    style={{ width: `${uploadedFile.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* Error message */}
                            {uploadedFile.status === 'error' && uploadedFile.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {uploadedFile.error}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0">
                            {uploadedFile.status === 'pending' && (
                              <button
                                onClick={() => removeFile(uploadedFile.id)}
                                disabled={isUploading}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            
                            {uploadedFile.status === 'uploading' && (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                            )}
                            
                            {uploadedFile.status === 'uploaded' && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                            
                            {uploadedFile.status === 'error' && (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* URL Tab */}
            {activeTab === 'url' && (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        URL du site web
                      </label>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        disabled={isUploading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Titre du document
                      </label>
                      <input
                        type="text"
                        value={urlTitle}
                        onChange={(e) => setUrlTitle(e.target.value)}
                        placeholder="Mon document"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        disabled={isUploading}
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={addUrl}
                    disabled={!urlInput.trim() || !urlTitle.trim() || !validateUrl(urlInput) || isUploading}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter l'URL
                  </button>
                  
                  {urlInput && !validateUrl(urlInput) && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Veuillez saisir une URL valide
                    </p>
                  )}
                </div>

                {/* URL List */}
                {urls.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                      URLs ajoutées ({urls.length})
                    </h4>
                    
                    <div className="space-y-3">
                      {urls.map((urlUpload) => (
                        <div
                          key={urlUpload.id}
                          className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <div className="flex-shrink-0">
                            <Link className="w-5 h-5 text-blue-500" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {urlUpload.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {urlUpload.url}
                            </p>
                            
                            {/* Error message */}
                            {urlUpload.status === 'error' && urlUpload.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {urlUpload.error}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0">
                            {urlUpload.status === 'pending' && (
                              <button
                                onClick={() => removeUrl(urlUpload.id)}
                                disabled={isUploading}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            
                            {urlUpload.status === 'uploading' && (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                            )}
                            
                            {urlUpload.status === 'uploaded' && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                            
                            {urlUpload.status === 'error' && (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}