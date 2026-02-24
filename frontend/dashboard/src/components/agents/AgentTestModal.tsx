'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, RotateCcw, Bot, ChevronDown, ChevronUp, AlertCircle, Clock, Zap } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { api } from '@/lib/api';

interface AgentTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: {
    id: string;
    name: string;
    avatarUrl?: string;
    welcomeMessage?: string;
    systemPrompt?: string;
    primaryLanguage?: string;
  };
  systemPromptOverride?: string;
}

interface Source {
  document: string;
  chunk: string;
  confidence: number;
}

interface MessageMetrics {
  responseTime: number;
  tokensUsed: number;
  confidence: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: Source[];
  metrics?: MessageMetrics;
  isError?: boolean;
}

export function AgentTestModal({
  isOpen,
  onClose,
  agent,
  systemPromptOverride,
}: AgentTestModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with welcome message when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialMessages: ChatMessage[] = [];
      if (agent.welcomeMessage) {
        initialMessages.push({
          id: 'welcome',
          role: 'assistant',
          content: agent.welcomeMessage,
          timestamp: new Date(),
        });
      }
      setMessages(initialMessages);
      setInputValue('');
      setIsLoading(false);
      setExpandedSources(new Set());
      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, agent.welcomeMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleReset = useCallback(() => {
    const initialMessages: ChatMessage[] = [];
    if (agent.welcomeMessage) {
      initialMessages.push({
        id: 'welcome',
        role: 'assistant',
        content: agent.welcomeMessage,
        timestamp: new Date(),
      });
    }
    setMessages(initialMessages);
    setInputValue('');
    setIsLoading(false);
    setExpandedSources(new Set());
    inputRef.current?.focus();
  }, [agent.welcomeMessage]);

  const toggleSources = useCallback((messageId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Build conversation history from existing messages (exclude system/error messages)
    const conversationHistory = [...messages, userMessage]
      .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.isError)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const response = await api.testAgent(agent.id, {
        message: trimmed,
        conversationHistory,
        includeSources: true,
        systemPromptOverride: systemPromptOverride || undefined,
      });

      const data = response.data;
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        sources: data.sources,
        metrics: data.metrics,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: error?.message || 'Une erreur est survenue. Veuillez reessayer.',
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isLoading, messages, agent.id, systemPromptOverride]);

  const handleRetry = useCallback((errorMessageId: string) => {
    // Find the last user message before this error
    const errorIndex = messages.findIndex(m => m.id === errorMessageId);
    if (errorIndex === -1) return;

    // Remove the error message and re-send
    const lastUserMessage = [...messages].slice(0, errorIndex).reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    setMessages(prev => prev.filter(m => m.id !== errorMessageId));
    setInputValue(lastUserMessage.content);
  }, [messages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const formatTime = (date: Date) => format(date, 'HH:mm');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden sm:max-h-[80vh] max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 dark:bg-emerald-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              {agent.avatarUrl ? (
                <img
                  src={agent.avatarUrl}
                  alt={agent.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-emerald-600 dark:border-emerald-700 rounded-full" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
              <p className="text-xs text-emerald-100">En ligne - Mode test</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Reinitialiser la conversation"
            >
              <RotateCcw className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Fermer"
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
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-white/80 dark:bg-gray-700/80 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Bot className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-700/80 rounded-lg px-4 py-2 shadow-sm">
                Envoyez un message pour tester votre agent
              </p>
            </div>
          )}

          {messages.map((message) => {
            if (message.isError) {
              return (
                <div key={message.id} className="flex justify-center my-2">
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-lg shadow-sm max-w-[85%] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{message.content}</span>
                    <button
                      onClick={() => handleRetry(message.id)}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline flex-shrink-0"
                    >
                      Reessayer
                    </button>
                  </div>
                </div>
              );
            }

            const isUser = message.role === 'user';

            return (
              <div key={message.id}>
                <div className={clsx('flex mb-1', isUser ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'relative max-w-[80%] px-3 py-2 shadow-sm rounded-2xl',
                      isUser
                        ? 'bg-emerald-500 dark:bg-emerald-600 text-white rounded-br-md'
                        : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
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

                {/* Sources & Metrics - only for assistant messages */}
                {!isUser && (message.sources?.length || message.metrics) && (
                  <div className="flex justify-start mb-2">
                    <div className="max-w-[80%] space-y-1">
                      {/* Metrics line */}
                      {message.metrics && (
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400 px-1">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {message.metrics.responseTime}ms
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Zap className="w-3 h-3" />
                            {message.metrics.tokensUsed} tokens
                          </span>
                          {message.metrics.confidence > 0 && (
                            <span>
                              Confiance: {Math.round(message.metrics.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      )}

                      {/* Sources collapsible */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="bg-white/80 dark:bg-gray-700/80 rounded-lg shadow-sm overflow-hidden">
                          <button
                            onClick={() => toggleSources(message.id)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600/50 transition-colors"
                          >
                            <span className="font-medium">
                              Sources ({message.sources.length})
                            </span>
                            {expandedSources.has(message.id) ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          {expandedSources.has(message.id) && (
                            <div className="px-3 pb-2 space-y-2">
                              {message.sources.map((source, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs border-t border-gray-200 dark:border-gray-600 pt-2"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
                                      {source.document}
                                    </span>
                                    <span
                                      className={clsx(
                                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                        source.confidence >= 0.8
                                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                          : source.confidence >= 0.5
                                            ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                                            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                      )}
                                    >
                                      {Math.round(source.confidence * 100)}%
                                    </span>
                                  </div>
                                  <p className="text-gray-500 dark:text-gray-400 line-clamp-2">
                                    {source.chunk}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start mb-1">
              <div className="bg-white dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
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
                placeholder="Ecrire un message..."
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
              aria-label="Envoyer"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
