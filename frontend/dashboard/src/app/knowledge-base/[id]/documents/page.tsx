'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  FileText, 
  Upload, 
  Trash2, 
  Edit, 
  Download,
  Eye,
  RefreshCw,
  Filter,
  MoreVertical,
  AlertCircle,
  CheckCircle,
  Clock,
  File,
  Image,
  Video,
  Music,
  Link
} from 'lucide-react';
import clsx from 'clsx';
import { UploadDocumentsModal } from '@/components/knowledge-base/UploadDocumentsModal';
import { RichTextEditor } from '@/components/knowledge-base/RichTextEditor';
import UrlScrapingModal from '@/components/knowledge-base/UrlScrapingModal';
import { api } from '@/lib/api';

interface KnowledgeDocument {
  id: string;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  status: 'pending' | 'processing' | 'processed' | 'error';
  charactersCount: number;
  chunksCount: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    pages?: number;
    language?: string;
    processingTime?: number;
    error?: string;
  };
}

interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'processing' | 'error' | 'inactive';
  documentsCount: number;
  charactersCount: number;
}

export default function KnowledgeBaseDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRichTextEditor, setShowRichTextEditor] = useState(false);
  const [showUrlScrapingModal, setShowUrlScrapingModal] = useState(false);

  // Load knowledge base and documents data
  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load knowledge base info
        const kbResponse = await api.getKnowledgeBase(id);
        console.log('🔍 FRONTEND KB Documents Page - API Response:', kbResponse.data);
        if (kbResponse.success) {
          // Calculate actual counts from the documents data
          const actualDocumentsCount = kbResponse.data.documents?.length || 0;
          const actualCharactersCount = kbResponse.data.documents?.reduce(
            (sum: number, doc: any) => sum + (doc.characterCount || 0), 
            0
          ) || 0;
          
          const kbData = {
            id: kbResponse.data.id,
            name: kbResponse.data.name,
            description: kbResponse.data.description,
            status: kbResponse.data.status || 'active',
            // Use the totalCharacters and documentCount from the API response
            documentsCount: kbResponse.data.documentCount || actualDocumentsCount,
            charactersCount: kbResponse.data.totalCharacters || actualCharactersCount,
          };
          
          console.log('🔍 FRONTEND KB Documents Page - Setting KB data:', kbData);
          setKnowledgeBase(kbData);
        }

        // Load documents
        const docsResponse = await api.get(`/documents?knowledgeBaseId=${id}`);
        if (docsResponse.success && docsResponse.data?.data) {
          const formattedDocs = docsResponse.data.data.map((doc: any) => ({
            id: doc.id,
            title: doc.title || doc.filename,
            filename: doc.filename,
            contentType: doc.mimeType || 'application/octet-stream',
            size: doc.fileSize || 0,
            status: doc.status || 'pending',
            charactersCount: doc.characterCount || 0,
            chunksCount: doc.chunks?.length || 0,
            createdAt: new Date(doc.createdAt),
            updatedAt: new Date(doc.updatedAt),
            metadata: doc.metadata || {},
          }));
          setDocuments(formattedDocs);
        }
      } catch (error) {
        console.error('Error loading knowledge base data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || doc.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-gray-400" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processed': return 'Traité';
      case 'processing': return 'En cours';
      case 'error': return 'Erreur';
      case 'pending': return 'En attente';
      default: return 'Inconnu';
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
    if (contentType.startsWith('video/')) return <Video className="w-5 h-5 text-purple-500" />;
    if (contentType.startsWith('audio/')) return <Music className="w-5 h-5 text-orange-500" />;
    if (contentType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSelectDocument = (docId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedDocuments.map(docId => api.deleteDocument(docId)));
      // Refresh documents list
      const docsResponse = await api.get(`/documents?knowledgeBaseId=${id}`);
      if (docsResponse.success && docsResponse.data?.data) {
        const formattedDocs = docsResponse.data.data.map((doc: any) => ({
          id: doc.id,
          title: doc.title || doc.filename,
          filename: doc.filename,
          contentType: doc.mimeType || 'application/octet-stream',
          size: doc.fileSize || 0,
          status: doc.status || 'pending',
          charactersCount: doc.characterCount || 0,
          chunksCount: doc.chunks?.length || 0,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
          metadata: doc.metadata || {},
        }));
        setDocuments(formattedDocs);
      }
      setSelectedDocuments([]);
    } catch (error) {
      console.error('Error deleting documents:', error);
    }
  };

  const handleReprocess = async (docId: string) => {
    try {
      await api.reprocessDocument(docId);
      // Refresh documents list
      const docsResponse = await api.get(`/documents?knowledgeBaseId=${id}`);
      if (docsResponse.success && docsResponse.data?.data) {
        const formattedDocs = docsResponse.data.data.map((doc: any) => ({
          id: doc.id,
          title: doc.title || doc.filename,
          filename: doc.filename,
          contentType: doc.mimeType || 'application/octet-stream',
          size: doc.fileSize || 0,
          status: doc.status || 'pending',
          charactersCount: doc.characterCount || 0,
          chunksCount: doc.chunks?.length || 0,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
          metadata: doc.metadata || {},
        }));
        setDocuments(formattedDocs);
      }
    } catch (error) {
      console.error('Error reprocessing document:', error);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await api.deleteDocument(docId);
      // Remove document from local state
      setDocuments(docs => docs.filter(doc => doc.id !== docId));
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const handleUploadComplete = async (uploadedFiles: any[]) => {
    console.log('[DocumentsPage] handleUploadComplete called with:', uploadedFiles);
    console.log('[DocumentsPage] This should NOT close the modal - only refresh documents');
    // Refresh documents list
    const docsResponse = await api.get(`/documents?knowledgeBaseId=${id}`);
    if (docsResponse.success && docsResponse.data?.data) {
      const formattedDocs = docsResponse.data.data.map((doc: any) => ({
        id: doc.id,
        title: doc.title || doc.filename,
        filename: doc.filename,
        contentType: doc.mimeType || 'application/octet-stream',
        size: doc.fileSize || 0,
        status: doc.status || 'pending',
        charactersCount: doc.characterCount || 0,
        chunksCount: doc.chunks?.length || 0,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
        metadata: doc.metadata || {},
      }));
      setDocuments(formattedDocs);
      console.log('[DocumentsPage] Documents refreshed successfully');
    }
  };

  const handleRichTextSave = async (document: any) => {
    console.log('Rich text document saved:', document);
    // Refresh documents list
    const docsResponse = await api.get(`/documents?knowledgeBaseId=${id}`);
    if (docsResponse.success && docsResponse.data?.data) {
      const formattedDocs = docsResponse.data.data.map((doc: any) => ({
        id: doc.id,
        title: doc.title || doc.filename,
        filename: doc.filename,
        contentType: doc.mimeType || 'application/octet-stream',
        size: doc.fileSize || 0,
        status: doc.status || 'pending',
        charactersCount: doc.characterCount || 0,
        chunksCount: doc.chunks?.length || 0,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
        metadata: doc.metadata || {},
      }));
      setDocuments(formattedDocs);
    }
  };

  const handleViewDocument = async (docId: string) => {
    try {
      const response = await api.get(`/documents/${docId}`);
      if (response.success && response.data) {
        // Create a modal or popup to show document content
        alert(`Contenu du document:\n\n${response.data.content || 'Aucun contenu disponible'}`);
      }
    } catch (error) {
      console.error('Error viewing document:', error);
      alert('Erreur lors de l\'affichage du document');
    }
  };

  const handleDownloadDocument = async (docId: string, filename: string) => {
    try {
      // For now, just show an alert since download implementation depends on backend
      alert(`Téléchargement de ${filename} sera implémenté prochainement`);
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Erreur lors du téléchargement');
    }
  };

  if (!knowledgeBase) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <button
            onClick={() => router.push('/knowledge-base')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {knowledgeBase.name}
              </h1>
              <div className="flex items-center space-x-1">
                {getStatusIcon(knowledgeBase.status)}
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {getStatusText(knowledgeBase.status)}
                </span>
              </div>
            </div>
            {knowledgeBase.description && (
              <p className="text-gray-600 dark:text-gray-400">{knowledgeBase.description}</p>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowRichTextEditor(true)}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Créer du texte</span>
            </button>
            <button
              onClick={() => setShowUrlScrapingModal(true)}
              className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Link className="w-4 h-4" />
              <span>URL</span>
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload fichiers</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Documents</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{knowledgeBase.documentsCount}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Caractères</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {knowledgeBase?.charactersCount 
                    ? `${(knowledgeBase.charactersCount / 1000).toFixed(1)}k`
                    : '0k'}
                </p>
              </div>
              <FileText className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Traités</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {documents.filter(d => d.status === 'processed').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-4 lg:space-y-0">
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 flex-1">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un document..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="sm:w-48">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="processed">Traités</option>
                  <option value="processing">En cours</option>
                  <option value="pending">En attente</option>
                  <option value="error">Erreur</option>
                </select>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedDocuments.length > 0 && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedDocuments.length} sélectionné(s)
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-1 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Supprimer</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Documents List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Chargement des documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Aucun document trouvé
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery ? 'Aucun résultat pour votre recherche.' : 'Commencez par ajouter vos premiers documents.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Ajouter des documents
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedDocuments.length === filteredDocuments.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Document
                  </span>
                </div>
              </div>

              {/* Documents */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDocuments.map((document) => (
                  <div key={document.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex items-start space-x-4">
                      <input
                        type="checkbox"
                        checked={selectedDocuments.includes(document.id)}
                        onChange={() => handleSelectDocument(document.id)}
                        className="mt-1 rounded border-gray-300 dark:border-gray-600"
                      />
                      
                      <div className="flex-shrink-0 mt-1">
                        {getFileIcon(document.contentType)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                              {document.title}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                              {document.filename} • {formatFileSize(document.size)}
                            </p>
                            
                            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                              <div className="flex items-center space-x-1">
                                {getStatusIcon(document.status)}
                                <span>{getStatusText(document.status)}</span>
                              </div>
                              
                              {document.status === 'processed' && (
                                <>
                                  <div>
                                    {document.charactersCount.toLocaleString()} caractères
                                  </div>
                                  <div>
                                    {document.chunksCount} chunks
                                  </div>
                                </>
                              )}
                              
                              {document.metadata?.pages && (
                                <div>
                                  {document.metadata.pages} pages
                                </div>
                              )}
                              
                              <div>
                                {document.createdAt.toLocaleDateString('fr-FR')}
                              </div>
                            </div>
                            
                            {document.status === 'error' && document.metadata?.error && (
                              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                                Erreur: {document.metadata.error}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            {document.status === 'processed' && (
                              <button
                                onClick={() => handleViewDocument(document.id)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                                title="Voir le contenu"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleDownloadDocument(document.id, document.filename)}
                              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                              title="Télécharger"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            
                            {(document.status === 'error' || document.status === 'processed') && (
                              <button
                                onClick={() => handleReprocess(document.id)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                                title="Retraiter"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleDelete(document.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rich Text Editor */}
      <RichTextEditor
        isOpen={showRichTextEditor}
        onClose={() => setShowRichTextEditor(false)}
        knowledgeBaseId={id}
        knowledgeBaseName={knowledgeBase.name}
        onSaveComplete={handleRichTextSave}
      />

      {/* URL Scraping Modal */}
      <UrlScrapingModal
        isOpen={showUrlScrapingModal}
        onClose={() => {
          console.log('[DocumentsPage] Modal onClose called - User triggered close or external trigger');
          setShowUrlScrapingModal(false);
        }}
        knowledgeBaseId={id}
        knowledgeBaseName={knowledgeBase.name}
        onUploadComplete={() => handleUploadComplete([])}
      />

      {/* Upload Modal */}
      <UploadDocumentsModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        knowledgeBaseId={id}
        knowledgeBaseName={knowledgeBase.name}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}