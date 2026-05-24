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
} from 'lucide-react';

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

  // Step 2 state
  const [agentName, setAgentName] = useState('');
  const [agentTone, setAgentTone] = useState('professional');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

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
                      <span className="text-2xl">{tpl.icon}</span>
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

          {/* ── Step 2: Agent Configuration ── */}
          {currentStep === 2 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Configurez votre agent
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  Donnez un nom et une personnalite a votre assistant
                </p>
              </div>

              <div className="max-w-lg mx-auto space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nom de l'agent *
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700"
                    placeholder="Ex: Assistant Boutique"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ton de communication
                  </label>
                  <select
                    value={agentTone}
                    onChange={(e) => setAgentTone(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="professional">Professionnel</option>
                    <option value="friendly">Amical</option>
                    <option value="empathetic">Empathique</option>
                    <option value="casual">Decontracte</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message d'accueil
                  </label>
                  <textarea
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700"
                    placeholder="Bonjour ! Comment puis-je vous aider ?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Decrivez votre activite <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700"
                    placeholder="Ex: Nous sommes un salon de coiffure a Douala. Nous proposons des coupes, des tresses, et du maquillage..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Cette description aidera l'IA a mieux repondre a vos clients
                  </p>
                </div>
              </div>

              <div className="flex justify-between mt-8 max-w-lg mx-auto">
                <button
                  onClick={() => goToStep(1)}
                  className="flex items-center px-5 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour
                </button>
                <button
                  onClick={handleCreateAgent}
                  disabled={saving}
                  className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creation...
                    </>
                  ) : (
                    <>
                      Creer l'agent
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
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
