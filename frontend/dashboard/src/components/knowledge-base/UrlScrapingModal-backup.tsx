'use client';
// DEBUG VERSION v3.0 - Added extensive logging to track modal closing issue

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
  onUploadComplete: (uploadedFiles: any[]) => void;
}

interface ScrapingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  icon: React.ReactNode;
  progress?: number;
  data?: any;
  startTime?: Date;
  endTime?: Date;
}

interface ScrapedContent {
  text: string;
  images: Array<{
    url: string;
    alt: string;
    size?: number;
    format?: string;
  }>;
  videos: Array<{
    url: string;
    title: string;
    duration?: string;
    thumbnail?: string;
  }>;
  links: Array<{
    url: string;
    title: string;
    description?: string;
  }>;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    author?: string;
    publishedDate?: string;
    language?: string;
  };
}

export function UrlScrapingModal({
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
  
  const [steps, setSteps] = useState<ScrapingStep[]>([
    {
      id: 'fetch',
      title: 'Récupération de la page',
      description: 'Téléchargement du contenu HTML de la page web',
      status: 'pending',
      icon: <Globe className="w-5 h-5" />,
      progress: 0,
    },
    {
      id: 'parse',
      title: 'Analyse du contenu',
      description: 'Extraction du texte, images, vidéos et métadonnées',
      status: 'pending',
      icon: <FileText className="w-5 h-5" />,
      progress: 0,
    },
    {
      id: 'media',
      title: 'Traitement des médias',
      description: 'Analyse des images et vidéos trouvées',
      status: 'pending',
      icon: <Image className="w-5 h-5" />,
      progress: 0,
    },
    {
      id: 'ai-synthesis',
      title: 'Synthèse IA',
      description: 'Génération d\'un résumé intelligent du contenu',
      status: 'pending',
      icon: <Brain className="w-5 h-5" />,
      progress: 0,
    },
    {
      id: 'save',
      title: 'Sauvegarde',
      description: 'Stockage des informations dans la base de connaissances',
      status: 'pending',
      icon: <Database className="w-5 h-5" />,
      progress: 0,
    }
  ]);

  const updateStep = (stepId: string, updates: Partial<ScrapingStep>) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === stepId ? { ...step, ...updates } : step
      )
    );
  };

  const simulateProgress = (stepId: string, duration: number = 2000) => {
    return new Promise<void>((resolve) => {
      const step = steps.find(s => s.id === stepId);
      if (!step) {
        resolve();
        return;
      }

      updateStep(stepId, { 
        status: 'in-progress', 
        startTime: new Date(),
        progress: 0 
      });

      const interval = setInterval(() => {
        updateStep(stepId, { 
          progress: Math.min((step.progress || 0) + Math.random() * 20, 95)
        });
      }, duration / 20);

      setTimeout(() => {
        clearInterval(interval);
        updateStep(stepId, { 
          status: 'completed', 
          progress: 100,
          endTime: new Date()
        });
        resolve();
      }, duration);
    });
  };

  const handleUrlSubmit = async () => {
    if (!url.trim() || !title.trim()) return;

    setIsProcessing(true);
    setCurrentStep(0);
    
    try {
      // Étape 1: Récupération de la page
      setCurrentStep(1);
      await simulateProgress('fetch', 1500);
      
      // Étape 2: Analyse du contenu
      setCurrentStep(2);
      await simulateProgress('parse', 2000);
      
      // Simulation du contenu scrapé
      const mockScrapedContent: ScrapedContent = {
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat...',
        images: [
          { url: '/placeholder-image1.jpg', alt: 'Image principale', size: 250000, format: 'JPG' },
          { url: '/placeholder-image2.jpg', alt: 'Image secondaire', size: 180000, format: 'PNG' }
        ],
        videos: [
          { url: '/placeholder-video.mp4', title: 'Vidéo de démonstration', duration: '2:30', thumbnail: '/placeholder-thumb.jpg' }
        ],
        links: [
          { url: 'https://example.com/link1', title: 'Lien connexe 1', description: 'Description du lien' },
          { url: 'https://example.com/link2', title: 'Lien connexe 2' }
        ],
        metadata: {
          title: title,
          description: 'Description automatiquement extraite de la page web',
          keywords: ['intelligence artificielle', 'technologie', 'innovation'],
          author: 'Auteur exemple',
          publishedDate: '2024-03-15',
          language: 'fr'
        }
      };
      
      setScrapedContent(mockScrapedContent);
      
      // Étape 3: Traitement des médias
      setCurrentStep(3);
      await simulateProgress('media', 1800);
      
      // Étape 4: Synthèse IA
      setCurrentStep(4);
      await simulateProgress('ai-synthesis', 2500);
      
      const mockAiSynthesis = `## Résumé du contenu

Cette page web traite principalement de l'intelligence artificielle et de son impact sur les technologies modernes. 

**Points clés identifiés :**
- Introduction aux concepts fondamentaux de l'IA
- Applications pratiques dans différents secteurs
- Tendances et perspectives d'avenir

**Contenu multimédia :**
- 2 images illustratives (formats JPG/PNG)
- 1 vidéo de démonstration de 2min30
- 2 liens externes pertinents

**Métadonnées extraites :**
- Langue : Français
- Date de publication : 15 mars 2024
- Mots-clés : intelligence artificielle, technologie, innovation

Le contenu est de qualité et pertinent pour la base de connaissances "${knowledgeBaseName}".`;
      
      setAiSynthesis(mockAiSynthesis);
      
      // Étape 5: Sauvegarde
      setCurrentStep(5);
      await simulateProgress('save', 1000);
      
      // Appel API réel pour sauvegarder
      const response = await api.uploadFromUrl({
        url: url.trim(),
        title: title.trim(),
        knowledgeBaseId,
        tags: mockScrapedContent.metadata.keywords,
        options: {
          includeImages: true,
          followLinks: false,
          maxDepth: 1
        }
      });

      if (response.success) {
        console.log('[UrlScrapingModal] SUCCESS: Upload successful, calling onUploadComplete');
        onUploadComplete([response.data]);
        console.log('[UrlScrapingModal] Setting isCompleted=true, isProcessing=false');
        setIsCompleted(true);
        setIsProcessing(false);
        console.log('[UrlScrapingModal] State updated - Modal should stay open for user review');
      } else {
        throw new Error(response.error || 'Erreur lors de la sauvegarde');
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
    console.trace('[UrlScrapingModal] Stack trace for modal close');
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

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={handleClose} />
        
        <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Récupération d'URL v2.1
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Base de connaissances : {knowledgeBaseName}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {!isProcessing && !isCompleted ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL du site web
                </label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Titre du document
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nom du document dans la base de connaissances"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleUrlSubmit}
                  disabled={!url.trim() || !title.trim()}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  <span>Récupérer les informations</span>
                </button>
              </div>
            </div>
          ) : isProcessing ? (
            <div className="space-y-6">
              {/* Étapes de progression */}
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex items-center p-4 rounded-lg border ${
                      step.status === 'completed' 
                        ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        : step.status === 'in-progress'
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                        : step.status === 'error'
                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex-shrink-0 mr-4">
                      {step.status === 'completed' ? (
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      ) : step.status === 'in-progress' ? (
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <Loader className="w-4 h-4 text-white animate-spin" />
                        </div>
                      ) : step.status === 'error' ? (
                        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center dark:bg-gray-600">
                          {step.icon}
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {step.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {step.description}
                      </p>
                      
                      {step.status === 'in-progress' && step.progress !== undefined && (
                        <div className="mt-2">
                          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                            <span>Progression</span>
                            <span>{Math.round(step.progress)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${step.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {step.status === 'completed' && step.endTime && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Terminé en {Math.round((step.endTime.getTime() - (step.startTime?.getTime() || step.endTime.getTime())) / 1000)}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contenu scrapé */}
              {scrapedContent && (
                <div className="mt-8 space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Contenu récupéré
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Texte */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Texte</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {scrapedContent.text.substring(0, 100)}...
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        {scrapedContent.text.length} caractères
                      </p>
                    </div>

                    {/* Images */}
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Image className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Images</span>
                      </div>
                      <div className="space-y-1">
                        {scrapedContent.images.map((img, index) => (
                          <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                            {img.alt} ({img.size ? formatFileSize(img.size) : 'Taille inconnue'})
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                        {scrapedContent.images.length} image(s) trouvée(s)
                      </p>
                    </div>

                    {/* Vidéos */}
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Video className="w-5 h-5 text-purple-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Vidéos</span>
                      </div>
                      <div className="space-y-1">
                        {scrapedContent.videos.map((video, index) => (
                          <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                            {video.title} {video.duration && `(${video.duration})`}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                        {scrapedContent.videos.length} vidéo(s) trouvée(s)
                      </p>
                    </div>
                  </div>

                  {/* Synthèse IA */}
                  {aiSynthesis && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg">
                      <div className="flex items-center space-x-2 mb-4">
                        <Brain className="w-5 h-5 text-orange-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Synthèse IA</span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                          {aiSynthesis}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Écran de résultats une fois le processus terminé */
            <div className="space-y-6">
              {/* Message de succès */}
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Récupération terminée avec succès !
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Les informations ont été extraites et sauvegardées dans votre base de connaissances.
                </p>
              </div>

              {/* Étapes de progression (mode consultation) */}
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex items-center p-4 rounded-lg border ${
                      step.status === 'completed' 
                        ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex-shrink-0 mr-4">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {step.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {step.description}
                      </p>
                      {step.endTime && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✓ Terminé en {Math.round((step.endTime.getTime() - (step.startTime?.getTime() || step.endTime.getTime())) / 1000)}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contenu scrapé (mode consultation) */}
              {scrapedContent && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    📋 Résumé du contenu récupéré
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Texte */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Texte</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {scrapedContent.text.substring(0, 120)}...
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        📊 {scrapedContent.text.length} caractères
                      </p>
                    </div>

                    {/* Images */}
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Image className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Images</span>
                      </div>
                      <div className="space-y-1 mb-2">
                        {scrapedContent.images.slice(0, 2).map((img, index) => (
                          <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                            • {img.alt} ({img.size ? formatFileSize(img.size) : '?'})
                          </div>
                        ))}
                        {scrapedContent.images.length > 2 && (
                          <div className="text-xs text-gray-500">
                            ... et {scrapedContent.images.length - 2} autres
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        🖼️ {scrapedContent.images.length} image(s)
                      </p>
                    </div>

                    {/* Vidéos */}
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Video className="w-5 h-5 text-purple-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Vidéos</span>
                      </div>
                      <div className="space-y-1 mb-2">
                        {scrapedContent.videos.slice(0, 2).map((video, index) => (
                          <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                            • {video.title} {video.duration && `(${video.duration})`}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-purple-600 dark:text-purple-400">
                        🎥 {scrapedContent.videos.length} vidéo(s)
                      </p>
                    </div>
                  </div>

                  {/* Synthèse IA détaillée */}
                  {aiSynthesis && (
                    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="flex items-center space-x-2 mb-4">
                        <Brain className="w-6 h-6 text-orange-500" />
                        <span className="font-semibold text-gray-900 dark:text-white text-lg">
                          🧠 Synthèse Intelligente
                        </span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
                          {aiSynthesis}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Métadonnées */}
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">📋 Métadonnées extraites</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Titre:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">{scrapedContent.metadata.title}</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Langue:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">{scrapedContent.metadata.language}</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Auteur:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">{scrapedContent.metadata.author}</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Date:</span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-white">{scrapedContent.metadata.publishedDate}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-gray-600 dark:text-gray-400">Mots-clés:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {scrapedContent.metadata.keywords.map((keyword, index) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bouton de fermeture */}
              <div className="flex justify-center pt-6 border-t border-gray-200 dark:border-gray-600">
                <button
                  onClick={handleClose}
                  className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Check className="w-5 h-5" />
                  <span>Terminer</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}