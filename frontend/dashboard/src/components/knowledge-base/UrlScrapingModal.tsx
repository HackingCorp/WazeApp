'use client';

import React, { useState } from 'react';
import { 
  X, 
  Link, 
  Globe, 
  Image, 
  Video, 
  FileText, 
  Music, 
  Download,
  Loader,
  Check,
  AlertTriangle,
  Play,
  Pause,
  Eye,
  Brain,
  Database,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';

interface UrlScrapingModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onUploadComplete?: () => void;
}

interface ScrapedContent {
  text: string;
  images: Array<{ url: string; alt: string; size?: number }>;
  videos: Array<{ url: string; title: string; duration?: string }>;
  links: Array<{ url: string; text: string }>;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    author?: string;
    publishDate?: string;
    wordCount: number;
    language?: string;
  };
}

interface Step {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

export default function UrlScrapingModal({
  isOpen,
  onClose,
  knowledgeBaseId,
  knowledgeBaseName,
  onUploadComplete
}: UrlScrapingModalProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [scrapedContent, setScrapedContent] = useState<ScrapedContent | null>(null);
  const [aiSynthesis, setAiSynthesis] = useState('');

  const initialSteps: Step[] = [
    {
      id: 'fetch',
      name: 'Récupération',
      description: 'Téléchargement du contenu web',
      icon: <Globe className="w-5 h-5" />,
      status: 'pending',
      progress: 0
    },
    {
      id: 'parse',
      name: 'Analyse',
      description: 'Extraction du texte et des métadonnées',
      icon: <FileText className="w-5 h-5" />,
      status: 'pending',
      progress: 0
    },
    {
      id: 'media',
      name: 'Médias',
      description: 'Traitement des images et vidéos',
      icon: <Image className="w-5 h-5" />,
      status: 'pending',
      progress: 0
    },
    {
      id: 'synthesis',
      name: 'Synthèse IA',
      description: 'Génération du résumé intelligent',
      icon: <Brain className="w-5 h-5" />,
      status: 'pending',
      progress: 0
    },
    {
      id: 'save',
      name: 'Sauvegarde',
      description: 'Enregistrement en base de données',
      icon: <Database className="w-5 h-5" />,
      status: 'pending',
      progress: 0
    }
  ];

  const [steps, setSteps] = useState<Step[]>(initialSteps);

  const updateStep = (stepId: string, updates: Partial<Step>) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === stepId 
          ? { ...step, ...updates, duration: updates.endTime && step.startTime ? updates.endTime.getTime() - step.startTime.getTime() : step.duration }
          : step
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    console.log('[UrlScrapingModal] Starting real URL scraping process');
    setIsProcessing(true);
    setIsCompleted(false);
    setCurrentStep(1);

    try {
      // Step 1: Fetch
      updateStep('fetch', { 
        status: 'in-progress', 
        startTime: new Date(),
        progress: 25 
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      updateStep('fetch', { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100 
      });
      setCurrentStep(2);

      // Step 2: Parse 
      updateStep('parse', { 
        status: 'in-progress', 
        startTime: new Date(),
        progress: 30 
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      updateStep('parse', { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100 
      });
      setCurrentStep(3);

      // Step 3: Media processing
      updateStep('media', { 
        status: 'in-progress', 
        startTime: new Date(),
        progress: 40 
      });
      
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      updateStep('media', { 
        status: 'completed', 
        endTime: new Date(),
        progress: 100 
      });
      setCurrentStep(4);

      // Step 4: AI Synthesis - REAL API CALL
      updateStep('synthesis', { 
        status: 'in-progress', 
        startTime: new Date(),
        progress: 20 
      });

      console.log('[UrlScrapingModal] Making real API call to scrape URL:', url.trim());
      
      const scrapeResponse = await api.scrapeUrl({
        url: url.trim(),
        options: {
          includeImages: true,
          followLinks: false,
          maxDepth: 1
        }
      });

      console.log('[UrlScrapingModal] API response received:', scrapeResponse);

      if (scrapeResponse.success && scrapeResponse.data) {
        // Check if the internal operation was successful
        if (scrapeResponse.data.success === false) {
          throw new Error(scrapeResponse.data.error || 'Erreur lors du scraping du site web');
        }
        
        // Check if scrapedContent exists before accessing it
        if (!scrapeResponse.data.data || !scrapeResponse.data.data.scrapedContent) {
          throw new Error('Aucun contenu n\'a pu être extrait du site web');
        }
        
        const realScrapedContent = scrapeResponse.data.data.scrapedContent;
        const realAiSynthesis = scrapeResponse.data.data.aiSynthesis;
        
        console.log('[UrlScrapingModal] Real scraped content:', realScrapedContent);
        console.log('[UrlScrapingModal] Real AI synthesis:', realAiSynthesis);
        
        setScrapedContent(realScrapedContent);
        setAiSynthesis(realAiSynthesis);
        
        updateStep('synthesis', { 
          status: 'completed', 
          endTime: new Date(),
          progress: 100 
        });
        
        // Stop processing to show results
        setIsProcessing(false);
        setIsCompleted(true);
        setCurrentStep(5);
        
      } else {
        throw new Error(scrapeResponse.error || 'Erreur lors du scraping');
      }
      
    } catch (error) {
      console.error('Erreur lors du scraping:', error);
      updateStep(steps[currentStep - 1]?.id || 'fetch', { 
        status: 'error' 
      });
      setIsProcessing(false);
      setIsCompleted(false);
    }
  };

  const handleClose = () => {
    console.log('[UrlScrapingModal] handleClose called - Modal is closing');
    setUrl('');
    setTitle('');
    setIsProcessing(false);
    setIsCompleted(false);
    setCurrentStep(0);
    setScrapedContent(null);
    setAiSynthesis('');
    setSteps(steps.map(step => ({ ...step, status: 'pending', progress: 0 })));
    onClose();
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAndClose = async () => {
    if (!scrapedContent) {
      handleClose();
      return;
    }

    console.log('[UrlScrapingModal] Saving document to knowledge base...');
    setIsSaving(true);

    try {
      // Save the scraped content to the knowledge base
      const response = await api.uploadFromUrl({
        url: url.trim(),
        title: title.trim() || scrapedContent.metadata.title || 'Document extrait',
        knowledgeBaseId,
        tags: scrapedContent.metadata.keywords || [],
      });

      console.log('[UrlScrapingModal] Save response:', response);

      if (response.success) {
        console.log('[UrlScrapingModal] Document saved successfully!');
        // Call the callback to refresh the documents list
        if (onUploadComplete) {
          onUploadComplete();
        }
        handleClose();
      } else {
        throw new Error(response.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('[UrlScrapingModal] Error saving document:', error);
      alert('Erreur lors de la sauvegarde du document. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">
                Extraction du contenu web v4.0-real
              </h3>
              <p className="text-purple-100 mt-1">
                Base de connaissances: {knowledgeBaseName}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-purple-200 hover:text-white transition-colors p-1"
              disabled={isProcessing}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          {!isProcessing && !isCompleted ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL du site web
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="https://exemple.com/article"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Titre du document (optionnel)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="Laissez vide pour auto-détection"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={!url.trim()}
                  className="flex items-center space-x-2 bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  <Globe className="w-5 h-5" />
                  <span>Extraire le contenu</span>
                </button>
              </div>
            </div>
          ) : isProcessing ? (
            // Processing view with real-time progress
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center space-x-2 bg-purple-500 bg-opacity-20 rounded-full px-4 py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Traitement en cours...</span>
                </div>
              </div>

              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center space-x-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      step.status === 'completed' 
                        ? 'bg-green-500 text-white'
                        : step.status === 'in-progress'
                          ? 'bg-purple-500 text-white'
                          : step.status === 'error'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.status === 'completed' ? (
                        <Check className="w-5 h-5" />
                      ) : step.status === 'in-progress' ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : step.status === 'error' ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        step.icon
                      )}
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {step.name}
                        </h4>
                        {step.duration && (
                          <span className="text-xs text-gray-500">
                            {Math.round(step.duration / 1000)}s
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {step.description}
                      </p>
                      {step.status === 'in-progress' && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${step.progress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isCompleted && scrapedContent ? (
            // Results view
            <div className="space-y-6 max-h-[60vh] overflow-y-auto">
              <div className="text-center mb-6">
                <div className="inline-flex items-center space-x-2 bg-green-500 bg-opacity-20 rounded-full px-4 py-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Extraction réussie!</span>
                </div>
              </div>

              {/* URL and basic info */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  Contenu extrait
                </h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-500">URL:</span>
                    <span className="ml-2 font-mono text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                      {scrapedContent.metadata.title}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Titre:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {scrapedContent.metadata.description || 'Aucune description'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Mots:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {scrapedContent.metadata.wordCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Synthesis */}
              {aiSynthesis && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center space-x-2 mb-3">
                    <Brain className="w-5 h-5 text-blue-600" />
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">
                      Synthèse IA
                    </h4>
                  </div>
                  <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                    {aiSynthesis}
                  </p>
                </div>
              )}

              {/* Content preview */}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Contenu textuel
                  </h4>
                  <div className="text-sm text-gray-600 dark:text-gray-300 max-h-32 overflow-y-auto">
                    <p>{scrapedContent.text ? scrapedContent.text.substring(0, 500) + (scrapedContent.text.length > 500 ? '...' : '') : 'Aucun contenu textuel détecté'}</p>
                  </div>
                </div>

                {/* Images found */}
                {scrapedContent.images && scrapedContent.images.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                      <Image className="w-4 h-4 mr-2" />
                      Images détectées ({scrapedContent.images.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {scrapedContent.images.slice(0, 4).map((img, index) => (
                        <div key={index} className="bg-white dark:bg-gray-600 p-2 rounded">
                          <div className="font-mono text-gray-600 dark:text-gray-300 truncate">
                            {img.url}
                          </div>
                          <div className="text-xs text-gray-500">
                            {img.alt || 'Sans description'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links found */}
                {scrapedContent.links && scrapedContent.links.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                      <Link className="w-4 h-4 mr-2" />
                      Liens détectés ({scrapedContent.links.length})
                    </h4>
                    <div className="space-y-1 text-xs max-h-24 overflow-y-auto">
                      {scrapedContent.links.slice(0, 6).map((link, index) => (
                        <div key={index} className="bg-white dark:bg-gray-600 p-2 rounded">
                          <div className="font-medium text-gray-900 dark:text-white truncate">
                            {link.text}
                          </div>
                          <div className="font-mono text-gray-600 dark:text-gray-300 truncate">
                            {link.url}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-600 space-x-3">
                  <button
                    onClick={handleClose}
                    disabled={isSaving}
                    className="flex items-center space-x-2 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                    <span>Annuler</span>
                  </button>
                  <button
                    onClick={handleSaveAndClose}
                    disabled={isSaving}
                    className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    <span>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}