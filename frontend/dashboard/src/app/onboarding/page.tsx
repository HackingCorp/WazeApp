'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Settings,
  CreditCard,
  Smartphone,
  PartyPopper,
  BookOpen,
  Bot,
  CalendarCheck,
  Headset,
  ShoppingBag,
  BadgeDollarSign,
  Crosshair,
  Send,
  MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface AgentTemplate {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  icon: string;
  tone: string;
  systemPrompt: string;
  welcomeMessage: string;
  fallbackMessage: string;
  suggestedQuestions: string[];
}

interface PlanData {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMonthlyUSD: number;
  trialDays: number;
  maxAgents: number;
  maxWhatsAppMessages: number;
  displayOrder: number;
  isActive: boolean;
}

// ─── Icon map for templates ──────────────────────────────────────
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  'bot': Bot,
  'calendar-check': CalendarCheck,
  'headset': Headset,
  'shopping-bag': ShoppingBag,
  'badge-dollar-sign': BadgeDollarSign,
  'crosshair': Crosshair,
};

// ─── Step definitions ────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Template', icon: Sparkles },
  { id: 2, label: 'Configuration', icon: Settings },
  { id: 3, label: 'Forfait', icon: CreditCard },
  { id: 4, label: 'WhatsApp', icon: Smartphone },
  { id: 5, label: 'Termine', icon: PartyPopper },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshAuth } = useAuth();

  // Current step
  const initialStep = parseInt(searchParams?.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(
    initialStep >= 1 && initialStep <= 5 ? initialStep : 1,
  );

  // Step 1 state
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Step 2 state — chat-based configuration
  const [agentName, setAgentName] = useState('');
  const [agentTone, setAgentTone] = useState('professional');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  // Chat flow state
  interface ChatMessage {
    role: 'assistant' | 'user';
    content: string;
    options?: { label: string; value: string }[];
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatPhase, setChatPhase] = useState(0); // 0=init, 1=name, 2=description, 3=tone, 4=welcome, 5=confirm
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // Step 3 state
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Step 4 state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [connectingWhatsapp, setConnectingWhatsapp] = useState(false);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);

  // General
  const [saving, setSaving] = useState(false);

  // ─── Check payment callback on step 3 ────────────────────────
  useEffect(() => {
    const payment = searchParams?.get('payment');
    if (payment === 'success' && currentStep === 3) {
      // Stripe checkout completed — move to step 4
      toast.success('Paiement configure avec succes !');
      goToStep(4);
    }
    if (payment === 'cancelled' && currentStep === 3) {
      toast.error('Paiement annule. Vous pouvez reessayer.');
    }
  }, [searchParams]);

  // ─── Load templates on mount ──────────────────────────────────
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const response = await api.getAgentTemplates();
        if (response.success && response.data) {
          setTemplates(response.data);
        }
      } catch {
        // Silently fail
      } finally {
        setTemplatesLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  // ─── Load plans on mount ──────────────────────────────────────
  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await api.get('/plans');
        if (response.success && response.data) {
          const activePlans = response.data
            .filter((p: any) => p.isActive && p.code !== 'free')
            .sort((a: any, b: any) => a.displayOrder - b.displayOrder)
            .map((p: any) => ({
              id: p.code.toUpperCase(),
              code: p.code,
              name: p.name,
              description: p.description,
              priceMonthlyUSD: p.priceMonthlyUSD,
              trialDays: p.trialDays || 0,
              maxAgents: p.maxAgents,
              maxWhatsAppMessages: p.maxWhatsAppMessages,
              displayOrder: p.displayOrder,
              isActive: p.isActive,
            }));
          setPlans(activePlans);
        }
      } catch {
        // Silently fail
      } finally {
        setPlansLoading(false);
      }
    }
    fetchPlans();
  }, []);

  // ─── Cleanup QR polling ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  // ─── Pre-fill from template when selected ─────────────────────
  useEffect(() => {
    if (selectedTemplate && templates.length > 0) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        if (!agentName) setAgentName(tpl.name);
        setAgentTone(tpl.tone);
        setWelcomeMessage(tpl.welcomeMessage);
      }
    }
  }, [selectedTemplate]);

  // ─── Persist step to backend ──────────────────────────────────
  const goToStep = useCallback(
    async (step: number) => {
      setCurrentStep(step);
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('step', step.toString());
      url.searchParams.delete('payment');
      window.history.replaceState(null, '', url.toString());
      // Persist to backend
      try {
        await api.updateOnboardingStep(step);
      } catch {
        // Non-blocking
      }
    },
    [],
  );

  // ─── Skip / "Plus tard" ───────────────────────────────────────
  const handleSkip = async () => {
    try {
      await api.updateOnboardingStep(null);
    } catch {
      // Ignore
    }
    router.push('/dashboard');
  };

  // ─── Step 2: Chat-based agent configuration ────────────────────

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Focus input after AI message
  useEffect(() => {
    if (!isTyping && chatPhase > 0 && chatPhase < 5) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [isTyping, chatPhase]);

  // Init chat when entering step 2
  useEffect(() => {
    if (currentStep === 2 && chatMessages.length === 0) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      const tplName = tpl?.name || 'votre agent';
      addBotMessage(
        `Bonjour ! Je vais vous aider a configurer votre agent "${tplName}". Comment s'appelle votre entreprise ou commerce ?`,
      );
      setChatPhase(1);
    }
  }, [currentStep]);

  const addBotMessage = (content: string, options?: { label: string; value: string }[]) => {
    setIsTyping(true);
    setTimeout(() => {
      setChatMessages((prev) => [...prev, { role: 'assistant', content, options }]);
      setIsTyping(false);
    }, 600);
  };

  const handleChatSend = (value?: string) => {
    const text = value || chatInput.trim();
    if (!text) return;

    // Add user message
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatInput('');

    switch (chatPhase) {
      case 1: // User answered business name
        setAgentName(text);
        setChatPhase(2);
        addBotMessage(
          `"${text}", c'est note ! Decrivez votre activite en quelques mots pour que l'agent puisse bien repondre a vos clients.`,
        );
        break;

      case 2: // User answered business description
        setBusinessDescription(text);
        setChatPhase(3);
        addBotMessage(
          'Comment souhaitez-vous que votre agent communique avec vos clients ?',
          [
            { label: 'Professionnel', value: 'professional' },
            { label: 'Amical', value: 'friendly' },
            { label: 'Empathique', value: 'empathetic' },
            { label: 'Decontracte', value: 'casual' },
          ],
        );
        break;

      case 3: { // User selected tone
        const toneMap: Record<string, string> = {
          'Professionnel': 'professional',
          'Amical': 'friendly',
          'Empathique': 'empathetic',
          'Decontracte': 'casual',
        };
        const toneValue = toneMap[text] || text;
        setAgentTone(toneValue);
        setChatPhase(4);
        const tpl3 = templates.find((t) => t.id === selectedTemplate);
        const defaultWelcome = tpl3?.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?';
        setWelcomeMessage(defaultWelcome);
        addBotMessage(
          `Quel message d'accueil souhaitez-vous afficher quand un client vous contacte sur WhatsApp ?\n\nSuggestion : "${defaultWelcome}"`,
        );
        break;
      }

      case 4: // User answered welcome message
        setWelcomeMessage(text);
        setChatPhase(5);
        const toneLabelMap: Record<string, string> = {
          professional: 'Professionnel',
          friendly: 'Amical',
          empathetic: 'Empathique',
          casual: 'Decontracte',
        };
        addBotMessage(
          `Votre agent est pret a etre cree !\n\n• Nom : ${agentName}\n• Activite : ${businessDescription}\n• Ton : ${toneLabelMap[agentTone] || agentTone}\n• Accueil : "${text}"\n\nOn lance la creation ?`,
          [
            { label: 'Creer mon agent', value: 'confirm' },
            { label: 'Recommencer', value: 'restart' },
          ],
        );
        break;

      case 5: // Confirm or restart
        if (text === 'restart') {
          setChatMessages([]);
          setChatPhase(0);
          setAgentName('');
          setBusinessDescription('');
          setAgentTone('professional');
          setWelcomeMessage('');
          // Re-trigger init
          setTimeout(() => {
            const tpl = templates.find((t) => t.id === selectedTemplate);
            const tplName = tpl?.name || 'votre agent';
            addBotMessage(
              `Bonjour ! Je vais vous aider a configurer votre agent "${tplName}". Comment s'appelle votre entreprise ou commerce ?`,
            );
            setChatPhase(1);
          }, 100);
        } else {
          handleCreateAgent();
        }
        break;
    }
  };

  // ─── Step 2: Create agent ─────────────────────────────────────
  const handleCreateAgent = async () => {
    if (!agentName.trim()) {
      toast.error('Le nom de l\'agent est requis');
      return;
    }

    setSaving(true);
    try {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      const payload: any = {
        name: agentName.trim(),
        tone: agentTone,
        welcomeMessage: welcomeMessage || tpl?.welcomeMessage || 'Bonjour ! Comment puis-je vous aider ?',
        fallbackMessage: tpl?.fallbackMessage || 'Desole, je n\'ai pas compris. Pouvez-vous reformuler ?',
        systemPrompt: tpl?.systemPrompt || '',
        language: 'fr',
        status: 'active',
      };

      if (businessDescription.trim()) {
        payload.systemPrompt = `${tpl?.systemPrompt || ''}\n\nContexte de l'entreprise: ${businessDescription.trim()}`;
      }

      const response = await api.createAgent(payload);
      if (response.success && response.data?.id) {
        setCreatedAgentId(response.data.id);
        analytics.track('onboarding_agent_created', { templateId: selectedTemplate });
        toast.success('Agent cree avec succes !');
        goToStep(3);
      } else {
        toast.error(response.error || 'Erreur lors de la creation de l\'agent');
      }
    } catch (err) {
      toast.error('Erreur lors de la creation de l\'agent');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 3: Select plan ──────────────────────────────────────
  const handleSelectPlan = async (planCode: string) => {
    setSaving(true);
    try {
      const dashboardUrl = window.location.origin;
      const response = await api.createStripeCheckoutSession({
        plan: planCode as 'STANDARD' | 'PRO' | 'ENTERPRISE',
        billingPeriod: 'monthly',
        successUrl: `${dashboardUrl}/onboarding?step=4&payment=success`,
        cancelUrl: `${dashboardUrl}/onboarding?step=3&payment=cancelled`,
      });

      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error(response.error || 'Erreur lors de la creation de la session de paiement');
      }
    } catch (err) {
      toast.error('Erreur de paiement. Veuillez reessayer.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinueFree = () => {
    goToStep(4);
  };

  // ─── Step 4: Connect WhatsApp ─────────────────────────────────
  const handleConnectWhatsApp = async () => {
    setConnectingWhatsapp(true);
    try {
      // Create session
      const sessionRes = await api.createWhatsAppSession({ name: 'WhatsApp Principal' });
      if (!sessionRes.success) {
        toast.error(sessionRes.error || 'Erreur lors de la creation de la session');
        setConnectingWhatsapp(false);
        return;
      }

      const sid = sessionRes.data?.id || sessionRes.data?.sessionId;
      setSessionId(sid);

      // Connect session
      await api.connectWhatsAppSession(sid);

      // Wait a moment then fetch QR
      await new Promise((r) => setTimeout(r, 2000));

      const qrRes = await api.getQrCode(sid);
      if (qrRes.success && qrRes.data?.qrCode) {
        setQrCode(qrRes.data.qrCode);
      }

      // Poll for connection status
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      qrPollRef.current = setInterval(async () => {
        try {
          const statusRes = await api.getWhatsAppSessionStatus(sid);
          if (statusRes.success) {
            const status = statusRes.data?.status || statusRes.data?.state;
            if (status === 'connected' || status === 'open') {
              setWhatsappConnected(true);
              if (qrPollRef.current) clearInterval(qrPollRef.current);

              // Assign agent to session
              if (createdAgentId) {
                await api.put(`/whatsapp/sessions/${sid}`, { agentId: createdAgentId });
              }

              toast.success('WhatsApp connecte !');
              return;
            }

            // Refresh QR if still pending
            const newQr = await api.getQrCode(sid);
            if (newQr.success && newQr.data?.qrCode) {
              setQrCode(newQr.data.qrCode);
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 5000);
    } catch (err) {
      toast.error('Erreur de connexion WhatsApp');
    } finally {
      setConnectingWhatsapp(false);
    }
  };

  // ─── Step 5: Complete onboarding ──────────────────────────────
  const handleComplete = async () => {
    try {
      await api.updateOnboardingStep(null);
      await refreshAuth();
    } catch {
      // Ignore
    }
    router.push('/dashboard');
  };

  // ─── Format messages helper ───────────────────────────────────
  const formatMessages = (count: number): string => {
    if (count === -1) return 'Messages illimites';
    return `${count.toLocaleString('fr-FR')} msg/mois`;
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-green-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">WazeApp</span>
        </div>

        {/* Step progress */}
        <div className="hidden sm:flex items-center space-x-2">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.id}>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                  currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : currentStep === step.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={handleSkip}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          Plus tard
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-3xl">
          {/* ── Step 1: Template Selection ── */}
          {currentStep === 1 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Choisissez un template pour votre agent
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Selectionnez un modele de depart ou partez de zero
                </p>
              </div>

              {templatesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`relative p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                        selectedTemplate === tpl.id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {selectedTemplate === tpl.id && (
                        <div className="absolute top-3 right-3">
                          <Check className="h-5 w-5 text-green-500" />
                        </div>
                      )}
                      {(() => {
                        const IconComp = TEMPLATE_ICONS[tpl.icon];
                        return IconComp ? (
                          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <IconComp className="w-5 h-5 text-green-600 dark:text-green-400" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            <Bot className="w-5 h-5 text-gray-500" />
                          </div>
                        );
                      })()}
                      <h3 className="font-semibold text-gray-900 dark:text-white mt-2">
                        {tpl.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {tpl.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-8">
                <button
                  onClick={() => {
                    if (!selectedTemplate) {
                      toast.error('Selectionnez un template');
                      return;
                    }
                    goToStep(2);
                  }}
                  className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Continuer
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Chat-based Agent Configuration ── */}
          {currentStep === 2 && (
            <div className="animate-fade-in">
              <div className="text-center mb-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Configurez votre agent
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                  Repondez aux questions pour personnaliser votre assistant
                </p>
              </div>

              <div className="max-w-lg mx-auto">
                {/* Chat container */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                  {/* Chat header */}
                  <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-green-600">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mr-3">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Assistant WazeApp</p>
                      <p className="text-xs text-green-100">En ligne</p>
                    </div>
                  </div>

                  {/* Messages area */}
                  <div className="h-80 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-900/50">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-line ${
                            msg.role === 'user'
                              ? 'bg-green-600 text-white rounded-br-md'
                              : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-md shadow-sm'
                          }`}
                        >
                          {msg.content}
                          {/* Option buttons */}
                          {msg.options && msg.role === 'assistant' && i === chatMessages.length - 1 && !isTyping && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {msg.options.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => handleChatSend(opt.value === 'confirm' || opt.value === 'restart' ? opt.value : opt.label)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-green-500 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Typing indicator */}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                          <div className="flex space-x-1.5">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Saving indicator */}
                    {saving && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin mr-2 text-green-600" />
                          Creation de l'agent en cours...
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Input area */}
                  <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    {chatPhase > 0 && chatPhase < 5 && chatPhase !== 3 ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleChatSend();
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          ref={chatInputRef}
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Tapez votre reponse..."
                          disabled={isTyping || saving}
                          className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-full text-sm focus:ring-2 focus:ring-green-500 focus:outline-none disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!chatInput.trim() || isTyping || saving}
                          className="w-10 h-10 flex items-center justify-center bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors disabled:opacity-50 disabled:hover:bg-green-600 flex-shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="text-center text-xs text-gray-400 py-1">
                        {chatPhase === 3 ? 'Choisissez une option ci-dessus' : chatPhase === 5 ? 'Confirmez la creation ci-dessus' : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Back button */}
                <div className="flex justify-start mt-4">
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      setChatPhase(0);
                      goToStep(1);
                    }}
                    className="flex items-center px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Changer de template
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Plan Selection ── */}
          {currentStep === 3 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Choisissez votre forfait
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Configurez votre methode de paiement pour activer votre agent
                </p>
              </div>

              {plansLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`relative p-6 rounded-xl border-2 transition-all ${
                        plan.code === 'pro'
                          ? 'border-green-500 shadow-lg'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {plan.code === 'pro' && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-green-500 text-white text-xs px-3 py-1 rounded-full flex items-center whitespace-nowrap">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Populaire
                          </span>
                        </div>
                      )}

                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {plan.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {plan.description}
                      </p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
                        ${plan.priceMonthlyUSD}
                        <span className="text-sm font-normal text-gray-500">/mois</span>
                      </p>
                      {plan.trialDays > 0 && (
                        <span className="inline-block mt-2 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                          {plan.trialDays} jours d'essai gratuit
                        </span>
                      )}
                      <ul className="mt-4 space-y-2">
                        <li className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {plan.maxAgents} Agent{plan.maxAgents > 1 ? 's' : ''} IA
                        </li>
                        <li className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                          {formatMessages(plan.maxWhatsAppMessages)}
                        </li>
                      </ul>
                      <button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={saving}
                        className={`w-full mt-5 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                          plan.code === 'pro'
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                        } disabled:opacity-50`}
                      >
                        {saving ? 'Chargement...' : 'Choisir'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center mt-8">
                <button
                  onClick={() => goToStep(2)}
                  className="flex items-center px-5 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour
                </button>
                <button
                  onClick={handleContinueFree}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors underline"
                >
                  Continuer avec l'essai gratuit
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: WhatsApp Connection ── */}
          {currentStep === 4 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Connectez votre WhatsApp
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Scannez le QR code avec votre telephone pour activer l'agent
                </p>
              </div>

              <div className="max-w-md mx-auto">
                {!sessionId && !whatsappConnected && (
                  <div className="text-center">
                    <div className="w-48 h-48 mx-auto bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-6">
                      <Smartphone className="w-16 h-16 text-gray-400" />
                    </div>
                    <button
                      onClick={handleConnectWhatsApp}
                      disabled={connectingWhatsapp}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {connectingWhatsapp ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
                          Connexion en cours...
                        </>
                      ) : (
                        'Connecter WhatsApp'
                      )}
                    </button>
                  </div>
                )}

                {sessionId && qrCode && !whatsappConnected && (
                  <div className="text-center">
                    <div className="inline-block p-4 bg-white rounded-2xl shadow-lg mb-4">
                      <img
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-64 h-64"
                      />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Ouvrez WhatsApp sur votre telephone &gt; Appareils connectes &gt; Scanner le QR code
                    </p>
                    <div className="flex items-center justify-center mt-3 text-green-600">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-sm">En attente de connexion...</span>
                    </div>
                  </div>
                )}

                {whatsappConnected && (
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                      <Check className="w-10 h-10 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      WhatsApp connecte !
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Votre agent est pret a recevoir des messages
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-8 max-w-md mx-auto">
                <button
                  onClick={() => goToStep(3)}
                  className="flex items-center px-5 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour
                </button>
                <button
                  onClick={() => goToStep(5)}
                  className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                    whatsappConnected
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 underline'
                  }`}
                >
                  {whatsappConnected ? (
                    <>
                      Continuer
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    'Passer cette etape'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Complete ── */}
          {currentStep === 5 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <PartyPopper className="w-10 h-10 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Votre agent est pret !
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Felicitations, votre assistant IA WhatsApp est configure
                </p>
              </div>

              <div className="max-w-md mx-auto">
                {/* Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Agent</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {agentName || 'Configure'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">WhatsApp</span>
                    <span className={`text-sm font-medium ${whatsappConnected ? 'text-green-600' : 'text-gray-400'}`}>
                      {whatsappConnected ? 'Connecte' : 'Non connecte'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={handleComplete}
                    className="w-full flex items-center justify-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Aller au dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </button>

                  <button
                    onClick={() => {
                      handleComplete();
                      setTimeout(() => router.push('/knowledge-base'), 100);
                    }}
                    className="w-full flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors font-medium"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Ajouter une base de connaissances
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
