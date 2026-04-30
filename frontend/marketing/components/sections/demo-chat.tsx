"use client"

import { useState, useRef, useEffect } from "react"
import { Send, X, MessageCircle, Bot } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"
import { useLanguage } from "@/components/providers/language-provider"

interface Message {
  id: string
  text: string
  sender: "user" | "bot"
  timestamp: Date
}

// Configuration API - Use environment variable with fallback
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100/api/v1"

// Fonction pour appeler l'API WazeApp AI avec support de langues
async function getAIResponse(message: string, userLanguage: string = 'en'): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/marketing/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        context: "marketing_demo",
        language: userLanguage
      }),
    })

    if (response.ok) {
      const data = await response.json()

      // Le backend renvoie: { success: true, data: { success: true, data: { response: "...", timestamp: "...", provider: "..." } } }
      const aiResponse = data.data?.data?.response || data.data?.response || data.response || data.message || "Désolé, je n'ai pas pu traiter votre demande pour le moment."
      return aiResponse
    } else {
      const errorText = await response.text()
      console.error('API Error - Status:', response.status, 'Text:', errorText)
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    console.error('Fetch error:', error)

    // Fallback intelligent avec prompt système complet
    const fallbackResponses: Record<string, string> = {
      greeting: "Salut ! Je suis l'IA de WazeApp, votre futur assistant WhatsApp ! Je peux vous expliquer comment automatiser complètement vos conversations client, améliorer votre SAV et booster vos ventes. Que souhaitez-vous découvrir en premier ?",
      features: "WazeApp c'est magique ! Votre IA peut répondre en 95+ langues, s'intégrer à vos outils (CRM, calendrier...), analyser les sentiments clients, créer des rapports détaillés... Plus jamais de messages perdus ! Quelle fonctionnalité vous intéresse le plus ?",
      pricing: "Excellente question ! WazeApp propose un plan gratuit pour démarrer, puis des plans premium à partir de 29\u20ac/mois avec IA avancée, intégrations illimitées et support prioritaire. Voulez-vous une démo personnalisée pour voir le ROI concret ?",
      setup: "C'est incroyablement simple ! 1) Connectez votre WhatsApp (30 sec) 2) Configurez votre IA avec vos infos business 3) Votre assistant automatise tout : réponses, RDV, SAV... Envie d'essayer gratuitement maintenant ?",
      security: "La sécurité est notre priorité absolue ! Chiffrement bout-en-bout, conformité RGPD totale, vos données restent 100% privées. Nous ne lisons jamais vos conversations. Audit de sécurité disponible pour les entreprises. Rassuré(e) ?",
      integration: "WazeApp se connecte à tout ! CRM (Salesforce, HubSpot...), calendriers, helpdesk, e-commerce, outils de paiement... L'API REST permet des intégrations custom. Quels outils utilisez-vous actuellement ?",
      languages: "Impressionnant, non ? 95+ langues supportées avec traduction automatique ! Vos clients parlent chinois, arabe, espagnol ? L'IA répond dans leur langue natale. Plus de barrières linguistiques pour votre business international !",
      default: "Excellente question ! WazeApp transforme radicalement votre WhatsApp en assistant IA puissant pour automatiser support client, ventes et communication. Que vous cherchiez à améliorer votre SAV, booster vos conversions ou optimiser vos RDV, j'ai LA solution ! Sur quoi puis-je vous éclairer précisément ?"
    }

    const lowerMessage = message.toLowerCase()

    // Détection intelligente du contexte de la question
    if (lowerMessage.includes('salut') || lowerMessage.includes('hello') || lowerMessage.includes('bonjour') || lowerMessage.includes('hi ')) {
      return fallbackResponses.greeting
    } else if (lowerMessage.includes('prix') || lowerMessage.includes('coût') || lowerMessage.includes('tarif') || lowerMessage.includes('plan') || lowerMessage.includes('\u20ac') || lowerMessage.includes('euro') || lowerMessage.includes('cher')) {
      return fallbackResponses.pricing
    } else if (lowerMessage.includes('comment') || lowerMessage.includes('setup') || lowerMessage.includes('installer') || lowerMessage.includes('configur') || lowerMessage.includes('commenc')) {
      return fallbackResponses.setup
    } else if (lowerMessage.includes('fonctionnalité') || lowerMessage.includes('feature') || lowerMessage.includes('peut faire') || lowerMessage.includes('capable') || lowerMessage.includes('service')) {
      return fallbackResponses.features
    } else if (lowerMessage.includes('sécurit') || lowerMessage.includes('données') || lowerMessage.includes('rgpd') || lowerMessage.includes('privé') || lowerMessage.includes('confidentiel')) {
      return fallbackResponses.security
    } else if (lowerMessage.includes('intégr') || lowerMessage.includes('connecter') || lowerMessage.includes('crm') || lowerMessage.includes('api') || lowerMessage.includes('outil')) {
      return fallbackResponses.integration
    } else if (lowerMessage.includes('langue') || lowerMessage.includes('language') || lowerMessage.includes('traduction') || lowerMessage.includes('français') || lowerMessage.includes('anglais')) {
      return fallbackResponses.languages
    } else {
      return fallbackResponses.default
    }
  }
}

export function DemoChatWidget() {
  const { t } = useTranslations()
  const { currentLanguage } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)

  // Expose open function globally so other components (e.g. hero button) can trigger it
  useEffect(() => {
    (window as any).__openDemoChat = () => setIsOpen(true)
    return () => { delete (window as any).__openDemoChat }
  }, [])

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: t("chatInitialMessage"),
      sender: "bot",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Update initial message when language changes
  useEffect(() => {
    const initialMessage = t("chatInitialMessage");
    setMessages([{
      id: "1",
      text: initialMessage,
      sender: "bot",
      timestamp: new Date(),
    }]);
  }, [currentLanguage]); // Use currentLanguage instead of t function

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const currentMessage = inputValue
    setInputValue("")
    setIsTyping(true)

    try {
      // Appel à l'API WazeApp AI avec la langue de l'utilisateur
      const aiResponse = await getAIResponse(currentMessage, currentLanguage)

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        sender: "bot",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, botMessage])
      setIsTyping(false)
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error)

      // Message d'erreur fallback
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Désolé, je rencontre un petit problème technique. Mais je suis toujours là pour vous aider avec WazeApp ! Pouvez-vous reformuler votre question ?",
        sender: "bot",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, errorMessage])
      setIsTyping(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-whatsapp text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center ${isOpen ? 'scale-0 pointer-events-none' : 'scale-100'}`}
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-90 pointer-events-none'}`}
      >
        <div className="bg-gradient-to-r from-whatsapp to-green-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center relative">
              <Bot className="h-5 w-5" />
              <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <p className="font-semibold">{t("chatTitle")}</p>
              <div className="flex items-center space-x-1">
                <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                <p className="text-xs opacity-90">{t("chatStatus")}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-96 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-3 flex animate-fade-in ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  message.sender === "user"
                    ? "bg-whatsapp text-white"
                    : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                }`}
              >
                <p className="text-sm">{message.text}</p>
                <p className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start mb-3 animate-fade-in">
              <div className="bg-white dark:bg-gray-700 rounded-2xl px-4 py-3">
                <div className="flex space-x-1">
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></span>
                  <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t dark:border-gray-700">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("chatPlaceholder")}
              className="flex-1 px-4 py-2 rounded-full border dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp"
            />
            <button
              type="submit"
              className="p-2 rounded-full bg-whatsapp text-white hover:bg-green-600 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
