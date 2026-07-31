'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import {
  Smartphone, 
  QrCode, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Plus,
  Wifi,
  WifiOff,
  Clock,
  Trash2,
  Settings,
  MessageSquare,
  Users,
  ArrowRight,
  Crown,
  Zap,
  Download
} from 'lucide-react';
import { AssignAgentModal } from '@/components/whatsapp/AssignAgentModal';
import toast from 'react-hot-toast';

interface WhatsAppSession {
  id: string;
  name: string;
  phoneNumber?: string;
  status: 'disconnected' | 'connecting' | 'connected';
  isActive: boolean;
  lastSeenAt?: string;
  createdAt: string;
  autoReconnect: boolean;
  aiResponsesEnabled: boolean;
  retryCount: number;
  agent?: {
    id: string;
    name: string;
    status: string;
  };
  hasAgent?: boolean; // Computed field pour savoir si la session a un agent
}

interface SessionStats {
  messagesSentToday: number;
  messagesSentThisMonth: number;
  messagesReceivedToday: number;
  messagesReceivedThisMonth: number;
  uptimePercentage: number;
  lastConnected?: string;
  connectionTimeToday: number;
}

interface QRCodeData {
  qrCode: string;
  expiresAt: string;
  timeRemaining: number;
}

const PLAN_LIMITS = {
  free: 1,
  standard: 1,
  pro: 2,
  enterprise: 5
};

export default function WhatsAppPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [stats, setStats] = useState<{[key: string]: SessionStats}>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [qrTimer, setQrTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showAssignAgentModal, setShowAssignAgentModal] = useState(false);
  const [newlyConnectedSession, setNewlyConnectedSession] = useState<WhatsAppSession | null>(null);
  const [selectedSessionForAgent, setSelectedSessionForAgent] = useState<WhatsAppSession | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'standard' | 'pro' | 'enterprise'>('free');
  const [planLimits, setPlanLimits] = useState({ current: 0, max: 1 });

  // Refs to track active intervals for cleanup
  const pollIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Pairing code state
  const [connectionMethod, setConnectionMethod] = useState<'qr' | 'pairing'>('qr');
  const [countryCode, setCountryCode] = useState('+237');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Session settings modal state
  const [settingsSession, setSettingsSession] = useState<WhatsAppSession | null>(null);
  const [settingsForm, setSettingsForm] = useState({ name: '', webhookUrl: '', autoReconnect: true });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Country codes list
  const countryCodes = [
    // Afrique Centrale
    { code: '+237', country: 'Cameroun', flag: '🇨🇲' },
    { code: '+241', country: 'Gabon', flag: '🇬🇦' },
    { code: '+242', country: 'Congo', flag: '🇨🇬' },
    { code: '+243', country: 'RD Congo', flag: '🇨🇩' },
    { code: '+235', country: 'Tchad', flag: '🇹🇩' },
    { code: '+236', country: 'Centrafrique', flag: '🇨🇫' },
    { code: '+240', country: 'Guinée équatoriale', flag: '🇬🇶' },
    // Afrique de l'Ouest
    { code: '+225', country: 'Côte d\'Ivoire', flag: '🇨🇮' },
    { code: '+221', country: 'Sénégal', flag: '🇸🇳' },
    { code: '+223', country: 'Mali', flag: '🇲🇱' },
    { code: '+226', country: 'Burkina Faso', flag: '🇧🇫' },
    { code: '+228', country: 'Togo', flag: '🇹🇬' },
    { code: '+229', country: 'Bénin', flag: '🇧🇯' },
    { code: '+224', country: 'Guinée', flag: '🇬🇳' },
    { code: '+227', country: 'Niger', flag: '🇳🇪' },
    { code: '+220', country: 'Gambie', flag: '🇬🇲' },
    { code: '+222', country: 'Mauritanie', flag: '🇲🇷' },
    { code: '+231', country: 'Liberia', flag: '🇱🇷' },
    { code: '+232', country: 'Sierra Leone', flag: '🇸🇱' },
    { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
    { code: '+233', country: 'Ghana', flag: '🇬🇭' },
    { code: '+245', country: 'Guinée-Bissau', flag: '🇬🇼' },
    { code: '+238', country: 'Cap-Vert', flag: '🇨🇻' },
    // Afrique de l'Est
    { code: '+254', country: 'Kenya', flag: '🇰🇪' },
    { code: '+255', country: 'Tanzanie', flag: '🇹🇿' },
    { code: '+256', country: 'Ouganda', flag: '🇺🇬' },
    { code: '+250', country: 'Rwanda', flag: '🇷🇼' },
    { code: '+257', country: 'Burundi', flag: '🇧🇮' },
    { code: '+251', country: 'Éthiopie', flag: '🇪🇹' },
    { code: '+252', country: 'Somalie', flag: '🇸🇴' },
    { code: '+253', country: 'Djibouti', flag: '🇩🇯' },
    { code: '+291', country: 'Érythrée', flag: '🇪🇷' },
    { code: '+258', country: 'Mozambique', flag: '🇲🇿' },
    { code: '+261', country: 'Madagascar', flag: '🇲🇬' },
    { code: '+269', country: 'Comores', flag: '🇰🇲' },
    { code: '+230', country: 'Maurice', flag: '🇲🇺' },
    { code: '+262', country: 'La Réunion', flag: '🇷🇪' },
    // Afrique Australe
    { code: '+27', country: 'Afrique du Sud', flag: '🇿🇦' },
    { code: '+263', country: 'Zimbabwe', flag: '🇿🇼' },
    { code: '+260', country: 'Zambie', flag: '🇿🇲' },
    { code: '+265', country: 'Malawi', flag: '🇲🇼' },
    { code: '+267', country: 'Botswana', flag: '🇧🇼' },
    { code: '+264', country: 'Namibie', flag: '🇳🇦' },
    { code: '+266', country: 'Lesotho', flag: '🇱🇸' },
    { code: '+268', country: 'Eswatini', flag: '🇸🇿' },
    { code: '+244', country: 'Angola', flag: '🇦🇴' },
    // Afrique du Nord
    { code: '+212', country: 'Maroc', flag: '🇲🇦' },
    { code: '+216', country: 'Tunisie', flag: '🇹🇳' },
    { code: '+213', country: 'Algérie', flag: '🇩🇿' },
    { code: '+218', country: 'Libye', flag: '🇱🇾' },
    { code: '+20', country: 'Égypte', flag: '🇪🇬' },
    { code: '+249', country: 'Soudan', flag: '🇸🇩' },
    { code: '+211', country: 'Soudan du Sud', flag: '🇸🇸' },
    // Europe
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+32', country: 'Belgique', flag: '🇧🇪' },
    { code: '+41', country: 'Suisse', flag: '🇨🇭' },
    { code: '+44', country: 'Royaume-Uni', flag: '🇬🇧' },
    { code: '+49', country: 'Allemagne', flag: '🇩🇪' },
    { code: '+34', country: 'Espagne', flag: '🇪🇸' },
    { code: '+39', country: 'Italie', flag: '🇮🇹' },
    { code: '+351', country: 'Portugal', flag: '🇵🇹' },
    { code: '+31', country: 'Pays-Bas', flag: '🇳🇱' },
    { code: '+352', country: 'Luxembourg', flag: '🇱🇺' },
    // Amérique
    { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
    { code: '+55', country: 'Brésil', flag: '🇧🇷' },
    // Moyen-Orient
    { code: '+966', country: 'Arabie Saoudite', flag: '🇸🇦' },
    { code: '+971', country: 'Émirats arabes unis', flag: '🇦🇪' },
    { code: '+961', country: 'Liban', flag: '🇱🇧' },
    // Asie
    { code: '+86', country: 'Chine', flag: '🇨🇳' },
    { code: '+91', country: 'Inde', flag: '🇮🇳' },
    { code: '+90', country: 'Turquie', flag: '🇹🇷' },
  ];

  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchUserPlan();
    }
  }, [user]);

  // Cleanup all intervals and timeouts on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach(interval => clearInterval(interval));
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      pollIntervalsRef.current.clear();
      timeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (qrData && timeRemaining > 0) {
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            toast.error('QR code expired. Regenerating...');
            // Try to regenerate QR code instead of giving up
            if (connecting) {
              setTimeout(() => {
                connectSession(connecting);
              }, 1000);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [qrData, timeRemaining]);

  // Update plan limits current count when sessions change
  useEffect(() => {
    setPlanLimits(prev => ({ ...prev, current: sessions.length }));
  }, [sessions.length]);

  const fetchUserPlan = async () => {
    try {
      // Get subscription info directly from usage-summary endpoint
      const subResponse = await api.get('/subscriptions/usage-summary');
      
      if (subResponse.success && subResponse.data) {
        const planData = subResponse.data;
        const plan = planData.plan as 'free' | 'standard' | 'pro' | 'enterprise';
        const maxSessions = planData.usage?.agents?.limit || 1;

        setUserPlan(plan);
        setPlanLimits(prev => ({ ...prev, max: maxSessions }));
        return;
      }
      
      // Fallback if API response is not in expected format
      throw new Error('Invalid API response format');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching user plan:', error);
      }
      // Set default plan for demo users based on email
      const email = user?.email || '';
      let maxSessions = 1;
      let plan: 'free' | 'standard' | 'pro' | 'enterprise' = 'free';

      if (email.includes('enterprise')) {
        plan = 'enterprise';
        maxSessions = 5;
      } else if (email.includes('pro')) {
        plan = 'pro';
        maxSessions = 2;
      } else if (email.includes('standard')) {
        plan = 'standard';
        maxSessions = 1;
      }

      setUserPlan(plan);
      setPlanLimits(prev => ({ ...prev, max: maxSessions }));
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp/sessions');

      // Check if the API call was successful
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch sessions');
      }
      
      // Extract sessions from the paginated response structure
      const sessionsData = response.data?.data || [];
      
      // Filter out null/undefined sessions and ensure required properties exist
      const validSessions = sessionsData.filter((session: any) => 
        session && 
        session.id && 
        typeof session.status !== 'undefined'
      );
      
      // Map sessions with real agent data from API response
      const sessionsWithAgents = validSessions.map((session: any) => ({
        ...session,
        hasAgent: !!(session.agent && session.agent.id),
      }));

      setSessions(sessionsWithAgents);
      
      // Fetch stats for each valid session
      const sessionStats: {[key: string]: SessionStats} = {};
      for (const session of sessionsWithAgents) {
        try {
          const statsResponse = await api.get(`/whatsapp/sessions/${session.id}/stats`);
          if (statsResponse.success) {
            sessionStats[session.id] = statsResponse.data;
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`Error fetching stats for session ${session.id}:`, error);
          }
        }
      }
      setStats(sessionStats);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching sessions:', error);
      }
      
      if (error.message?.includes('Invalid or expired token') || error.message?.includes('Unauthorized')) {
        toast.error('Authentication required. Please log in with valid credentials to access WhatsApp service.');
      } else {
        toast.error('Failed to connect to WhatsApp service. Please check if the backend is running.');
      }
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!newSessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    if (sessions.length >= planLimits.max) {
      toast.error(`You've reached your plan limit of ${planLimits.max} WhatsApp account${planLimits.max > 1 ? 's' : ''}. Please upgrade to add more.`);
      return;
    }

    try {
      const response = await api.post('/whatsapp/sessions', {
        name: newSessionName.trim(),
        autoReconnect: true,
        config: {
          messageRetryCount: 3,
          markOnlineOnConnect: true,
          syncFullHistory: false,
          defaultPresence: 'available'
        }
      });

      // Check if the API call was successful
      if (!response.success) {
        throw new Error(response.error || 'Failed to create session');
      }
      
      // Refetch sessions to ensure we have the latest data
      await fetchSessions();
      
      setNewSessionName('');
      setShowCreateModal(false);
      analytics.track('whatsapp_session_created');
      toast.success('WhatsApp session created successfully');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating session:', error);
      }
      toast.error(error?.message || 'Failed to create session');
    }
  };

  const connectSession = async (sessionId: string, retryCount = 0) => {
    try {
      setConnecting(sessionId);
      setQrData(null);
      
      if (retryCount > 0) {
        toast.loading(`Tentative de reconnexion... (${retryCount}/3)`, { id: 'whatsapp-connecting' });
      } else {
        toast.loading('Connexion à WhatsApp...', { id: 'whatsapp-connecting' });
      }
      
      const response = await api.post(`/whatsapp/sessions/${sessionId}/connect`);

      // Gestion d'erreur améliorée
      if (!response.success && response.error) {
        const errorMessage = getWhatsAppErrorMessage(response.error);
        if (retryCount < 3 && isRetriableError(response.error)) {
          toast.dismiss('whatsapp-connecting');
          toast(`${errorMessage} Nouvelle tentative dans 3 secondes...`, { icon: '⚠️' });
          setTimeout(() => connectSession(sessionId, retryCount + 1), 3000);
          return;
        } else {
          throw new Error(errorMessage);
        }
      }
      
      toast.dismiss('whatsapp-connecting');
      toast.success('Connexion initialisée. Veuillez scanner le QR code.');
      
      // Always try to get QR code after connection attempt
      // Give it a moment for the QR to be generated
      setTimeout(async () => {
        try {
          const qrResponse = await api.get(`/whatsapp/sessions/${sessionId}/qr`);

          if (qrResponse.success && qrResponse.data.qrCode) {
            setQrData(qrResponse.data);
            setTimeRemaining(qrResponse.data.timeRemaining);
          } else {
            // Handle QR generation failure
            const qrErrorMessage = getQRErrorMessage(qrResponse.error);
            toast.error(qrErrorMessage);
          }
        } catch (error: any) {
          const qrErrorMessage = getQRErrorMessage(error?.response?.data?.error || error?.message);
          toast.error(qrErrorMessage);
        }
      }, 2000); // Wait 2 seconds for QR generation
      
      // Poll for connection status
        const pollInterval = setInterval(async () => {
          try {
            // Check session status
            const sessionResponse = await api.get(`/whatsapp/sessions/${sessionId}`);
            const session = sessionResponse.data;

            if (session && session.status === 'connected' && session.isActive) {
              clearInterval(pollInterval);
              pollIntervalsRef.current.delete(pollInterval);
              setConnecting(null);
              setQrData(null);
              fetchSessions();
              analytics.track('whatsapp_connected', { sessionId });
              toast.success('WhatsApp connected successfully! 🎉');

              // Déclencher le modal d'assignation d'agent seulement si aucun agent n'est assigné
              const connectedSession: WhatsAppSession = {
                id: sessionId,
                name: newSessionName || `Session ${session.phoneNumber || sessionId.slice(-4)}`,
                status: 'connected',
                phoneNumber: session.phoneNumber,
                isActive: true,
                autoReconnect: true,
                aiResponsesEnabled: true,
                retryCount: 0,
                lastSeenAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              };

              // Vérifier si la session a déjà un agent assigné
              if (!session.agent) {
                setNewlyConnectedSession(connectedSession);
                setShowAssignAgentModal(true);
              }
            } else if (session && session.status === 'disconnected' && session.retryCount > 3) {
              clearInterval(pollInterval);
              pollIntervalsRef.current.delete(pollInterval);
              setConnecting(null);
              setQrData(null);
              toast.error('Failed to connect. Please try again.');
            } else if (session && session.status === 'connecting') {
              // Keep checking for QR code updates while connecting
              try {
                const qrResponse = await api.get(`/whatsapp/sessions/${sessionId}/qr`);
                if (qrResponse.success && qrResponse.data.qrCode) {
                  setQrData(qrResponse.data);
                  setTimeRemaining(qrResponse.data.timeRemaining);
                }
              } catch (qrError) {
                // QR code may have expired or not available
              }
            }
          } catch (error) {
            // Error polling session status
          }
        }, 3000);
        pollIntervalsRef.current.add(pollInterval);

        // Clear polling after 3 minutes (since QR codes last 5 minutes now)
        const timeoutId = setTimeout(() => {
          clearInterval(pollInterval);
          pollIntervalsRef.current.delete(pollInterval);
          timeoutsRef.current.delete(timeoutId);
          if (connecting === sessionId) {
            setConnecting(null);
            setQrData(null);
            toast.error('Connection timeout. Please try again.');
          }
        }, 180000);
        timeoutsRef.current.add(timeoutId);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error connecting session:', error);
      }
      toast.dismiss('whatsapp-connecting');
      
      const errorMessage = getWhatsAppErrorMessage(
        error?.response?.data?.error || 
        error?.response?.data?.message || 
        error?.message
      );
      
      toast.error(errorMessage, { duration: 6000 });
      setConnecting(null);
      setQrData(null);
      
      // Si c'est une erreur de service backend, suggérer un diagnostic
      if (error?.message?.includes('connect ECONNREFUSED') || error?.code === 'NETWORK_ERROR') {
        setTimeout(() => {
          toast.error('Le service WhatsApp semble indisponible. Veuillez contacter l\'administrateur.', {
            duration: 8000
          });
        }, 1000);
      }
    }
  };

  const requestPairingCode = async (sessionId: string) => {
    if (!phoneNumber.trim()) {
      toast.error('Veuillez entrer votre numéro de téléphone');
      return;
    }

    try {
      setPairingLoading(true);
      setPairingCode(null);

      toast.loading('Génération du code d\'appairage...', { id: 'pairing-code' });

      // Combine country code with phone number
      const fullPhoneNumber = countryCode + phoneNumber.trim();

      const response = await api.post(`/whatsapp/sessions/${sessionId}/pairing-code`, {
        phoneNumber: fullPhoneNumber
      });

      if (!response.success) {
        throw new Error(response.error || 'Échec de la génération du code');
      }

      setPairingCode(response.data.pairingCode);
      setTimeRemaining(300); // 5 minutes
      toast.success('Code d\'appairage généré!', { id: 'pairing-code' });

      // Start polling for connection status
      const pollInterval = setInterval(async () => {
        try {
          const sessionResponse = await api.get(`/whatsapp/sessions/${sessionId}`);
          const session = sessionResponse.data;

          if (session && session.status === 'connected' && session.isActive) {
            clearInterval(pollInterval);
            pollIntervalsRef.current.delete(pollInterval);
            setConnecting(null);
            setPairingCode(null);
            setPhoneNumber('');
            setConnectionMethod('qr');
            fetchSessions();
            toast.success('WhatsApp connecté avec succès! 🎉');
          }
        } catch (error) {
          // Error polling session status
        }
      }, 3000);
      pollIntervalsRef.current.add(pollInterval);

      // Clear polling after 5 minutes
      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        pollIntervalsRef.current.delete(pollInterval);
        timeoutsRef.current.delete(timeoutId);
      }, 300000);
      timeoutsRef.current.add(timeoutId);

    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error requesting pairing code:', error);
      }
      toast.dismiss('pairing-code');
      toast.error(error?.message || 'Erreur lors de la génération du code');
    } finally {
      setPairingLoading(false);
    }
  };

  const disconnectSession = async (sessionId: string) => {
    try {
      const session = sessions.find(s => s.id === sessionId);
      const sessionName = session?.name || 'Session';
      
      toast.loading(`Déconnexion de ${sessionName}...`, { id: 'whatsapp-disconnecting' });
      
      const response = await api.post(`/whatsapp/sessions/${sessionId}/disconnect`);
      
      if (!response.success) {
        throw new Error(response.error || 'Échec de la déconnexion');
      }
      
      await fetchSessions();
      analytics.track('whatsapp_disconnected', { sessionId });
      toast.success(`${sessionName} déconnecté avec succès`, { id: 'whatsapp-disconnecting' });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error disconnecting session:', error);
      }
      toast.dismiss('whatsapp-disconnecting');
      
      const errorMessage = getWhatsAppErrorMessage(
        error?.response?.data?.error || 
        error?.response?.data?.message || 
        error?.message
      );
      
      toast.error(`Erreur lors de la déconnexion: ${errorMessage}`, { duration: 5000 });
    }
  };

  const syncMessages = async (sessionId: string) => {
    try {
      toast.loading('Synchronizing all messages...', { id: 'sync-messages' });

      const response = await api.post(`/whatsapp/sessions/${sessionId}/sync`);

      if (response.success) {
        toast.success('Message synchronization started! This may take a few minutes for large chats.', {
          id: 'sync-messages',
          duration: 5000
        });
      } else {
        toast.error(response.message || response.error || 'Failed to start synchronization', { id: 'sync-messages' });
      }
    } catch (error: any) {
      toast.error('Failed to sync messages', { id: 'sync-messages' });
    }
  };

  const handleAssignAgent = async (agentId: string, createKnowledgeBase: boolean) => {
    try {
      const targetSession = newlyConnectedSession || selectedSessionForAgent;
      if (!targetSession) return;

      // API call to assign agent to session
      const response = await api.put(`/whatsapp/sessions/${targetSession.id}`, {
        agentId
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to assign agent');
      }
      
      analytics.track('agent_assigned_to_session', { sessionId: targetSession.id, agentId });
      toast.success(`Agent assigné avec succès à ${targetSession.name}!`);
      
      setShowAssignAgentModal(false);
      setNewlyConnectedSession(null);
      setSelectedSessionForAgent(null);
      
      // Refresh sessions to show the new agent assignment
      await fetchSessions();
      
      // Optionnel: rediriger vers la gestion des documents si une base de connaissances a été créée
      if (createKnowledgeBase) {
        setTimeout(() => {
          window.location.href = `/knowledge-base/${agentId}/documents`;
        }, 1000);
      }
      
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error assigning agent:', error);
      }
      toast.error('Erreur lors de l\'assignation de l\'agent');
    }
  };

  const openAssignAgentModal = (session: WhatsAppSession) => {
    setSelectedSessionForAgent(session);
    setShowAssignAgentModal(true);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this WhatsApp session? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/whatsapp/sessions/${sessionId}`);
      // Refetch sessions to ensure UI is synchronized with backend
      await fetchSessions();
      toast.success('WhatsApp session deleted');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error deleting session:', error);
      }
      toast.error(error?.response?.data?.message || 'Failed to delete session');
    }
  };

  const toggleAiResponses = async (sessionId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue;
      const session = sessions.find(s => s.id === sessionId);

      toast.loading(
        newValue
          ? `Activation des réponses IA pour ${session?.name}...`
          : `Désactivation des réponses IA pour ${session?.name}...`,
        { id: 'toggle-ai' }
      );

      const response = await api.put(`/whatsapp/sessions/${sessionId}`, {
        aiResponsesEnabled: newValue
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update AI responses setting');
      }

      // Update local state
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, aiResponsesEnabled: newValue } : s
      ));

      toast.success(
        newValue
          ? `Réponses IA activées pour ${session?.name}`
          : `Réponses IA désactivées pour ${session?.name}`,
        { id: 'toggle-ai' }
      );
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error toggling AI responses:', error);
      }
      toast.error('Erreur lors de la modification des réponses IA', { id: 'toggle-ai' });
    }
  };

  const openSessionSettings = (session: WhatsAppSession) => {
    setSettingsForm({
      name: session.name,
      webhookUrl: (session as any).webhookUrl || '',
      autoReconnect: session.autoReconnect !== false,
    });
    setSettingsSession(session);
  };

  const saveSessionSettings = async () => {
    if (!settingsSession) return;
    setSettingsSaving(true);
    try {
      const payload: any = {
        name: settingsForm.name.trim(),
        autoReconnect: settingsForm.autoReconnect,
      };
      if (settingsForm.webhookUrl.trim()) {
        payload.webhookUrl = settingsForm.webhookUrl.trim();
      }
      const response = await api.put(`/whatsapp/sessions/${settingsSession.id}`, payload);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update session');
      }
      setSessions(prev => prev.map(s =>
        s.id === settingsSession.id
          ? { ...s, name: payload.name, autoReconnect: payload.autoReconnect }
          : s
      ));
      toast.success('Paramètres enregistrés');
      setSettingsSession(null);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSettingsSaving(false);
    }
  };

  const refreshQR = async (sessionId: string) => {
    try {
      const response = await api.get(`/whatsapp/sessions/${sessionId}/qr`);
      if (response.success && response.data) {
        setQrData(response.data);
        setTimeRemaining(response.data.timeRemaining);
        toast.success('QR code refreshed');
      } else {
        toast.error(response.error || 'Failed to refresh QR code');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error refreshing QR:', error);
      }
      toast.error('Failed to refresh QR code');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      default: return 'text-red-600';
    }
  };

  const getStatusIcon = (status: string, isActive: boolean) => {
    // Only show connected icon if BOTH isActive AND status is connected
    if (isActive && status === 'connected') return <Wifi className="w-4 h-4 text-green-600" />;
    if (status === 'connecting') return <RefreshCw className="w-4 h-4 animate-spin text-yellow-600" />;
    return <WifiOff className="w-4 h-4 text-red-600" />;
  };

  // Fonctions utilitaires pour la gestion d'erreurs
  const getWhatsAppErrorMessage = (error: string | undefined): string => {
    if (!error) return 'Une erreur inconnue s\'est produite';

    const errorLower = error.toLowerCase();

    // Device removed / 401 conflict error - most common issue
    if (errorLower.includes('device_removed') || errorLower.includes('401') || errorLower.includes('conflict')) {
      return '⚠️ Connexion rejetée par WhatsApp. Veuillez aller dans WhatsApp → Appareils liés et supprimer les anciens appareils avant de réessayer (max 4 appareils).';
    }
    if (errorLower.includes('failed to connect to whatsapp') || errorLower.includes('connection failed')) {
      return 'Impossible de se connecter à WhatsApp. Vérifiez que votre téléphone est connecté à internet.';
    }
    if (errorLower.includes('qr code is not available') || errorLower.includes('qr code expired')) {
      return 'Le QR code a expiré. Veuillez réessayer pour générer un nouveau code.';
    }
    if (errorLower.includes('session already exists') || errorLower.includes('already connected')) {
      return 'Cette session WhatsApp est déjà connectée. Veuillez la déconnecter d\'abord.';
    }
    if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
      return 'Trop de tentatives de connexion. Veuillez attendre quelques minutes avant de réessayer.';
    }
    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
      return 'Délai d\'attente dépassé. Vérifiez votre connexion internet et réessayez.';
    }
    if (errorLower.includes('unauthorized') || errorLower.includes('authentication')) {
      return 'Erreur d\'authentification. Veuillez vous reconnecter à l\'application.';
    }
    if (errorLower.includes('service unavailable') || errorLower.includes('server error')) {
      return 'Le service WhatsApp est temporairement indisponible. Veuillez réessayer plus tard.';
    }
    if (errorLower.includes('unlink') || errorLower.includes('max')) {
      return '⚠️ Maximum d\'appareils atteint. Délier les anciens appareils dans WhatsApp → Appareils liés.';
    }

    // Retourner l'erreur originale si aucune correspondance
    return `Erreur WhatsApp: ${error}`;
  };
  
  const getQRErrorMessage = (error: string | undefined): string => {
    if (!error) return 'Impossible de générer le QR code';
    
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('expired') || errorLower.includes('not available')) {
      return 'Le QR code a expiré. Un nouveau code sera généré automatiquement.';
    }
    if (errorLower.includes('generation failed')) {
      return 'Échec de la génération du QR code. Veuillez réessayer.';
    }
    
    return 'Problème avec le QR code. Veuillez rafraîchir et réessayer.';
  };
  
  const isRetriableError = (error: string | undefined): boolean => {
    if (!error) return false;
    
    const errorLower = error.toLowerCase();
    
    // Erreurs qui méritent un retry automatique
    const retriableErrors = [
      'timeout',
      'connection failed',
      'network error',
      'service unavailable',
      'server error',
      'qr generation failed'
    ];
    
    return retriableErrors.some(retriableError => errorLower.includes(retriableError));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
        <span className="ml-2 text-lg">{t('whatsapp.loadingSessions')}</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
            <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('whatsapp.pageTitle')}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t('whatsapp.pageSubtitle')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('whatsapp.currentPlan')}: {userPlan.charAt(0).toUpperCase() + userPlan.slice(1)}</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('whatsapp.accountsUsed', { current: planLimits.current, max: planLimits.max })}
            </div>
          </div>

          {sessions.length < planLimits.max && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t('whatsapp.connectWhatsapp')}</span>
            </button>
          )}

          {sessions.length >= planLimits.max && (
            <div className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-emerald-600 text-white px-4 py-2 rounded-lg">
              <Crown className="w-4 h-4" />
              <span>{t('whatsapp.upgradePlan')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Upgrade Banner */}
      {sessions.length >= planLimits.max && userPlan !== 'enterprise' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-100 to-emerald-100 dark:from-purple-900/30 dark:to-emerald-900/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div>
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">Upgrade to connect more accounts</h3>
                <p className="text-purple-700 dark:text-purple-300 text-sm">
                  {userPlan === 'free' && 'Upgrade to Standard for 1 account, Pro for 2 accounts, or Enterprise for 5 accounts'}
                  {userPlan === 'standard' && 'Upgrade to Pro for 2 accounts or Enterprise for 5 accounts'}
                  {userPlan === 'pro' && 'Upgrade to Enterprise for up to 5 WhatsApp accounts'}
                </p>
              </div>
            </div>
            <button className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
              Upgrade Now
            </button>
          </div>
        </motion.div>
      )}

      {/* Connection Modal (QR Code or Pairing Code) */}
      <AnimatePresence>
        {(qrData || pairingCode || connectionMethod === 'pairing') && connecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setQrData(null);
              setPairingCode(null);
              setConnecting(null);
              setConnectionMethod('qr');
              setPhoneNumber('');
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Connecter WhatsApp</h3>

                {/* Method Tabs */}
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6">
                  <button
                    onClick={() => setConnectionMethod('qr')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      connectionMethod === 'qr'
                        ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    QR Code
                  </button>
                  <button
                    onClick={() => setConnectionMethod('pairing')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      connectionMethod === 'pairing'
                        ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Code d'appairage
                  </button>
                </div>

                {/* QR Code Method */}
                {connectionMethod === 'qr' && qrData && (
                  <>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Scannez ce QR code avec WhatsApp</p>

                    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-600 mb-4">
                      <img
                        src={qrData.qrCode}
                        alt="WhatsApp QR Code"
                        className="w-full max-w-64 mx-auto"
                      />
                    </div>

                    <div className="flex items-center justify-center space-x-2 mb-4">
                      <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Expire dans {formatTime(timeRemaining)}
                      </span>
                    </div>

                    <div className="text-left space-y-2 mb-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        <span className="text-gray-700 dark:text-gray-300">Ouvrir WhatsApp</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        <span className="text-gray-700 dark:text-gray-300">Menu → Appareils liés</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        <span className="text-gray-700 dark:text-gray-300">Scanner le QR code</span>
                      </div>
                    </div>

                    <button
                      onClick={() => refreshQR(connecting)}
                      className="w-full flex items-center justify-center space-x-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors mb-3"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Rafraîchir le QR</span>
                    </button>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      Problème de scan sur Android? Essayez le <button onClick={() => setConnectionMethod('pairing')} className="text-green-600 dark:text-green-400 underline">code d'appairage</button>
                    </p>
                  </>
                )}

                {/* Pairing Code Method */}
                {connectionMethod === 'pairing' && (
                  <>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      {pairingCode
                        ? 'Entrez ce code dans WhatsApp'
                        : 'Entrez votre numéro de téléphone WhatsApp'}
                    </p>

                    {!pairingCode ? (
                      <>
                        <div className="flex gap-2 mb-4">
                          <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            className="px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          >
                            {countryCodes.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.code}
                              </option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            placeholder="6XX XXX XXX"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-lg"
                          />
                        </div>

                        <button
                          onClick={() => connecting && requestPairingCode(connecting)}
                          disabled={pairingLoading || !phoneNumber.trim()}
                          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                        >
                          {pairingLoading ? 'Génération...' : 'Obtenir le code'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="bg-green-50 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-700 rounded-xl p-6 mb-4">
                          <div className="text-4xl font-mono font-bold text-green-700 dark:text-green-400 tracking-widest">
                            {pairingCode}
                          </div>
                        </div>

                        <div className="flex items-center justify-center space-x-2 mb-4">
                          <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Expire dans {formatTime(timeRemaining)}
                          </span>
                        </div>

                        <div className="text-left space-y-2 mb-4 text-sm">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                            <span className="text-gray-700 dark:text-gray-300">Ouvrir WhatsApp</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                            <span className="text-gray-700 dark:text-gray-300">Menu → Appareils liés</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                            <span className="text-gray-700 dark:text-gray-300">Lier avec numéro de téléphone</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                            <span className="text-gray-700 dark:text-gray-300">Entrer le code ci-dessus</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setPairingCode(null);
                            setPhoneNumber('');
                          }}
                          className="w-full flex items-center justify-center space-x-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors mb-3"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Nouveau code</span>
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* Cancel Button */}
                <button
                  onClick={() => {
                    setQrData(null);
                    setPairingCode(null);
                    setConnecting(null);
                    setConnectionMethod('qr');
                    setPhoneNumber('');
                  }}
                  className="w-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Session Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('whatsapp.createSession')}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{t('whatsapp.giveSessionName')}</p>

              <input
                type="text"
                placeholder={t('whatsapp.sessionNamePlaceholder')}
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-6"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && createSession()}
              />

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {t('whatsapp.cancel')}
                </button>
                <button
                  onClick={createSession}
                  disabled={!newSessionName.trim()}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('whatsapp.createAndConnect')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Smartphone className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('whatsapp.noAccountsConnected')}</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
            {t('whatsapp.connectYourAccount')}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{t('whatsapp.connectFirstAccount')}</span>
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sessions.filter(session => session && session.id && typeof session.isActive === 'boolean').map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-all"
            >
              {/* Session Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-3 rounded-full ${session.isActive && session.status === 'connected' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                    {getStatusIcon(session.status, session.isActive)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{session.name}</h3>
                    {session.phoneNumber && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{session.phoneNumber}</p>
                    )}
                    <div className="flex items-center space-x-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${session.isActive && session.status === 'connected' ? 'bg-green-500' : session.status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      <span className={`text-xs font-medium ${getStatusColor(session.status)}`}>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Stats */}
              {stats[session.id] && (
                <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {stats[session.id].messagesSentToday}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{t('whatsapp.sentToday')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {stats[session.id].messagesReceivedToday}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{t('whatsapp.receivedToday')}</div>
                  </div>
                </div>
              )}
              
              {/* Agent Assignment Status */}
              <div className="mb-4">
                {session.agent ? (
                  <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <span className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                        {t('whatsapp.agent')}: {session.agent.name}
                      </span>
                      {session.agent.status === 'active' && (
                        <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 rounded-full flex-shrink-0">
                          {t('whatsapp.active')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => openAssignAgentModal(session)}
                      className="ml-2 text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex-shrink-0"
                    >
                      {t('whatsapp.changeAgent')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm text-yellow-800 dark:text-yellow-200">
                        {t('whatsapp.noAgentAssigned')}
                      </span>
                    </div>
                    <button
                      onClick={() => openAssignAgentModal(session)}
                      className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                    >
                      {t('whatsapp.assign')}
                    </button>
                  </div>
                )}
              </div>

              {/* AI Responses Toggle */}
              <div className="mb-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('whatsapp.aiAutoResponses')}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleAiResponses(session.id, session.aiResponsesEnabled !== false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      session.aiResponsesEnabled !== false
                        ? 'bg-green-600'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        session.aiResponsesEnabled !== false
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {session.aiResponsesEnabled === false && (
                  <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                    ⚠️ {t('whatsapp.aiResponsesDisabled')}
                  </p>
                )}
              </div>

              {/* Last Seen */}
              {session.lastSeenAt && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  {t('whatsapp.lastSeen')}: {new Date(session.lastSeenAt).toLocaleString()}
                </p>
              )}

              {/* Actions */}
              <div className="flex space-x-2">
                {/* Show connected buttons only if BOTH isActive AND status is connected */}
                {session.isActive && session.status === 'connected' ? (
                  <>
                    <button
                      onClick={() => syncMessages(session.id)}
                      className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 py-2 px-4 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors text-sm font-medium flex items-center justify-center space-x-1"
                      title="Sync all message history"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t('whatsapp.sync')}</span>
                    </button>
                    <button
                      onClick={() => disconnectSession(session.id)}
                      className="flex-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 py-2 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-sm font-medium"
                    >
                      {t('whatsapp.disconnect')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectSession(session.id)}
                    disabled={connecting === session.id}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {connecting === session.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <QrCode className="w-4 h-4" />
                    )}
                    <span>{connecting === session.id ? t('whatsapp.connecting') : t('whatsapp.connect')}</span>
                  </button>
                )}

                <button
                  onClick={() => openSessionSettings(session)}
                  className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                  title="Paramètres de la session"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal paramètres session */}
      <AnimatePresence>
        {settingsSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSettingsSession(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Paramètres de la session
                  </h2>
                </div>
                <button
                  onClick={() => setSettingsSession(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <span className="text-xl">&times;</span>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Nom de la session */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Nom de la session
                  </label>
                  <input
                    type="text"
                    value={settingsForm.name}
                    onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                    placeholder="Ex: Support Client"
                    maxLength={50}
                  />
                </div>

                {/* Webhook URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Webhook URL <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="url"
                    value={settingsForm.webhookUrl}
                    onChange={e => setSettingsForm(f => ({ ...f, webhookUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                    placeholder="https://example.com/webhook"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Recevez les événements de cette session sur votre serveur.
                  </p>
                </div>

                {/* Auto-reconnect */}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Reconnexion automatique
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Se reconnecter automatiquement en cas de déconnexion.
                    </p>
                  </div>
                  <button
                    onClick={() => setSettingsForm(f => ({ ...f, autoReconnect: !f.autoReconnect }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      settingsForm.autoReconnect ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settingsForm.autoReconnect ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Infos session */}
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">ID :</span> <span className="font-mono">{settingsSession.id.slice(0, 8)}...</span>
                  </p>
                  {settingsSession.phoneNumber && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-300">Téléphone :</span> {settingsSession.phoneNumber}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Créée le :</span> {new Date(settingsSession.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setSettingsSession(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveSessionSettings}
                  disabled={settingsSaving || !settingsForm.name.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {settingsSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{settingsSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal d'assignation d'agent */}
      {showAssignAgentModal && (newlyConnectedSession || selectedSessionForAgent) && (
        <AssignAgentModal
          isOpen={showAssignAgentModal}
          onClose={() => {
            setShowAssignAgentModal(false);
            setNewlyConnectedSession(null);
            setSelectedSessionForAgent(null);
          }}
          onAssignAgent={handleAssignAgent}
          sessionName={(newlyConnectedSession || selectedSessionForAgent)?.name || ''}
          currentAgentId={(newlyConnectedSession || selectedSessionForAgent)?.agent?.id}
        />
      )}
    </div>
  );
}