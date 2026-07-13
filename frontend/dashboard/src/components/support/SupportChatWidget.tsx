'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, RotateCcw, MessageCircle, Headphones } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { formatWhatsAppText } from '@/lib/format-whatsapp';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGES: Record<string, string> = {
  fr: "Bonjour ! Je suis l'assistant support WazeApp. Comment puis-je vous aider aujourd'hui ?",
  en: "Hello! I'm the WazeApp support assistant. How can I help you today?",
  es: "Hola! Soy el asistente de soporte de WazeApp. Como puedo ayudarte hoy?",
  de: 'Hallo! Ich bin der WazeApp Support-Assistent. Wie kann ich Ihnen heute helfen?',
  it: "Ciao! Sono l'assistente supporto WazeApp. Come posso aiutarti oggi?",
  pt: 'Ola! Sou o assistente de suporte WazeApp. Como posso ajuda-lo hoje?',
};

export function SupportChatWidget() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waMessage, setWaMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null!);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Don't render if not authenticated
  if (!user) return null;

  const welcomeMessage = WELCOME_MESSAGES[locale] || WELCOME_MESSAGES.en;

  // Initialize welcome message on first open
  const handleOpen = () => {
    setIsOpen(true);
    setHasUnread(false);
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
      },
    ]);
    setInputValue('');
    setIsLoading(false);
  };

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Build conversation history (exclude welcome message)
    const conversationHistory = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await api.supportChat({
        message: trimmed,
        language: locale,
        conversationHistory,
      });

      if (response.success && response.data) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error('Invalid response');
      }
    } catch {
      const fallback =
        locale === 'fr'
          ? "Desole, une erreur est survenue. Veuillez reessayer."
          : 'Sorry, an error occurred. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: fallback,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleWhatsAppRedirect = () => {
    const need = waMessage.trim();
    if (!need) return;
    const identity = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const intro =
      locale === 'fr'
        ? `Bonjour, je suis ${identity} (${user.email}), utilisateur WazeApp.`
        : `Hello, I am ${identity} (${user.email}), WazeApp user.`;
    const text = `${intro}\n\n${need}`;
    window.open(
      `https://wa.me/237691371922?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
    setWaOpen(false);
    setWaMessage('');
  };

  const handleWaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleWhatsAppRedirect();
    }
  };

  const formatTime = (date: Date) => format(date, 'HH:mm');

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-20 right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px]"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl h-[500px] sm:h-[560px] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 dark:bg-emerald-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Headphones className="w-5 h-5 text-white" />
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-emerald-600 dark:border-emerald-700 rounded-full" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Support WazeApp</h3>
                    <p className="text-xs text-emerald-100">
                      {locale === 'fr' ? 'En ligne' : 'Online'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    title={locale === 'fr' ? 'Reinitialiser' : 'Reset'}
                  >
                    <RotateCcw className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    title={locale === 'fr' ? 'Fermer' : 'Close'}
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[#e5ddd5] dark:bg-gray-900"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c4b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              >
                <MessagesRenderer
                  messages={messages}
                  isLoading={isLoading}
                  formatTime={formatTime}
                  messagesEndRef={messagesEndRef}
                />
              </div>

              {/* Input Area */}
              <div className="px-3 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                      }}
                      placeholder={
                        locale === 'fr' ? 'Posez votre question...' : 'Ask your question...'
                      }
                      className="w-full resize-none px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm max-h-[120px]"
                      rows={1}
                      style={{ minHeight: '42px' }}
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className={clsx(
                      'p-2.5 rounded-full transition-colors shadow-lg flex-shrink-0',
                      inputValue.trim() && !isLoading
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                        : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed shadow-none'
                    )}
                    aria-label="Send"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Support Panel */}
      <AnimatePresence>
        {waOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-6 sm:right-[5.5rem] z-50 w-[calc(100vw-2rem)] sm:w-[340px]"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between px-4 py-3 bg-[#25D366]">
                <h3 className="text-sm font-semibold text-white">
                  {locale === 'fr' ? 'Support WhatsApp' : 'WhatsApp Support'}
                </h3>
                <button
                  onClick={() => setWaOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  title={locale === 'fr' ? 'Fermer' : 'Close'}
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {locale === 'fr'
                    ? 'Décrivez votre besoin : il sera prérempli dans votre message WhatsApp au support.'
                    : 'Describe your need: it will be pre-filled in your WhatsApp message to support.'}
                </p>
                <textarea
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  onKeyDown={handleWaKeyDown}
                  placeholder={
                    locale === 'fr'
                      ? 'Ex. : Mon agent ne répond plus aux clients depuis ce matin…'
                      : 'E.g.: My agent stopped replying to customers this morning…'
                  }
                  className="w-full resize-none px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#25D366] text-sm"
                  rows={3}
                  autoFocus
                />
                <button
                  onClick={handleWhatsAppRedirect}
                  disabled={!waMessage.trim()}
                  className={clsx(
                    'w-full py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    waMessage.trim()
                      ? 'bg-[#25D366] hover:bg-[#1da851] text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  )}
                >
                  {locale === 'fr' ? 'Continuer sur WhatsApp' : 'Continue on WhatsApp'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Support Button */}
      <button
        onClick={() => setWaOpen((v) => !v)}
        className="fixed bottom-6 right-[5.5rem] z-50 w-14 h-14 bg-[#25D366] hover:bg-[#1da851] text-white rounded-full shadow-lg shadow-green-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label={locale === 'fr' ? 'Contacter le support via WhatsApp' : 'Contact support via WhatsApp'}
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </button>

      {/* Floating Bubble */}
      <motion.button
        onClick={() => (isOpen ? setIsOpen(false) : handleOpen())}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Support chat"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
            )}
          </>
        )}
      </motion.button>
    </>
  );
}

// Extracted to a separate component for auto-scroll effect
function MessagesRenderer({
  messages,
  isLoading,
  formatTime,
  messagesEndRef,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  formatTime: (date: Date) => string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}) {
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, messagesEndRef]);

  // Focus input after loading completes
  useEffect(() => {
    if (!isLoading) {
      // Parent handles focus via inputRef
    }
  }, [isLoading]);

  return (
    <>
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <div key={message.id} className={clsx('flex mb-1', isUser ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'relative max-w-[80%] px-3 py-2 shadow-sm rounded-2xl',
                isUser
                  ? 'bg-emerald-500 dark:bg-emerald-600 text-white rounded-br-md'
                  : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
              )}
            >
              <div className="whitespace-pre-wrap break-words text-sm">
                {formatWhatsAppText(message.content)}
              </div>
              <div
                className={clsx(
                  'flex items-center justify-end gap-1 mt-1 text-[10px]',
                  isUser ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
                )}
              >
                <span>{formatTime(message.timestamp)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Typing indicator */}
      {isLoading && (
        <div className="flex justify-start mb-1">
          <div className="bg-white dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
            <div className="flex gap-1">
              <div
                className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
