'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, Mic, Search, Archive, Settings, MessageCircle, Check, CheckCheck, Menu, ArrowLeft, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import clsx from 'clsx';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'agent' | 'client' | 'system' | 'operator';
  type: 'text' | 'image' | 'audio' | 'file' | 'video';
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
  mediaType?: string;
  mediaCaption?: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    duration?: number;
  };
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  isOnline: boolean;
  isTyping?: boolean;
  isGroup?: boolean;
  isHumanControlled?: boolean;
  assignedOperatorId?: string;
  escalationReason?: string;
}

interface ConversationInterfaceProps {
  contacts: Contact[];
  selectedContactId?: string;
  messages: Message[];
  onSendMessage: (content: string, type: 'text' | 'image' | 'audio' | 'file' | 'video') => void;
  onSelectContact: (contactId: string) => void;
  onArchiveContact?: (contactId: string) => void;
  onTakeover?: (contactId: string) => void;
  onRelease?: (contactId: string) => void;
  onOperatorReply?: (contactId: string, message: string) => void;
  isOperatorMode?: boolean;
  isLoading?: boolean;
  t?: (key: string) => string;
}

// --- Prop interfaces for extracted components ---

interface MessageStatusProps {
  status?: string;
}

interface MessageBubbleProps {
  message: Message;
  isFirst: boolean;
  isLast: boolean;
  formatMessageTime: (timestamp: Date) => string;
  t: (key: string) => string;
}

interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
  formatContactTime: (timestamp: Date) => string;
  t: (key: string) => string;
}

// --- Extracted components wrapped in React.memo ---

const MessageStatus = React.memo(({ status }: MessageStatusProps) => {
  if (!status) return null;

  return (
    <span className="ml-1 inline-flex">
      {status === 'sending' && (
        <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {status === 'sent' && <Check className="w-3.5 h-3.5" />}
      {status === 'delivered' && <CheckCheck className="w-3.5 h-3.5" />}
      {status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
      {status === 'failed' && <AlertCircle className="w-4 h-4 text-red-500" />}
    </span>
  );
});

MessageStatus.displayName = 'MessageStatus';

const MessageBubble = React.memo(({ message, isFirst, isLast, formatMessageTime, t }: MessageBubbleProps) => {
  const [imageError, setImageError] = useState(false);
  const isUser = message.sender === 'user';
  const isAgent = message.sender === 'agent';
  const isClient = message.sender === 'client';
  const isSystem = message.sender === 'system';
  const isOperator = message.sender === 'operator';

  const isOutgoing = isAgent || isUser || isOperator;
  const isIncoming = isClient;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm text-gray-600 dark:text-gray-300 text-xs px-3 py-1.5 rounded-lg shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const renderMessageContent = () => {
    const mediaSource = message.mediaUrl || message.content;
    const isMediaUrl = mediaSource && (
      mediaSource.startsWith('http') ||
      mediaSource.startsWith('data:') ||
      mediaSource.startsWith('/uploads')
    );

    switch (message.type) {
      case 'image':
        if (isMediaUrl) {
          return (
            <div className="space-y-1">
              {imageError ? (
                <div className="w-[280px] h-[200px] bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                  {t('conversations.imageUnavailable')}
                </div>
              ) : (
                <img
                  src={mediaSource}
                  alt={message.mediaCaption || t('conversations.image')}
                  className="rounded-lg max-w-[280px] max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => window.open(mediaSource, '_blank', 'noopener,noreferrer')}
                  onError={() => setImageError(true)}
                />
              )}
              {message.mediaCaption && (
                <p className="text-sm opacity-90">{message.mediaCaption}</p>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
            <span className="text-2xl">🖼️</span>
            <span className="text-sm opacity-80">{message.content || t('conversations.image')}</span>
          </div>
        );
      case 'video':
        if (isMediaUrl) {
          return (
            <div className="space-y-1">
              <video
                src={mediaSource}
                controls
                className="rounded-lg max-w-[280px] max-h-[300px]"
              />
              {message.mediaCaption && (
                <p className="text-sm opacity-90">{message.mediaCaption}</p>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
            <span className="text-2xl">🎥</span>
            <span className="text-sm opacity-80">{message.content || t('conversations.video')}</span>
          </div>
        );
      case 'audio':
        if (isMediaUrl) {
          return (
            <div className="flex items-center gap-3 min-w-[200px]">
              <audio src={mediaSource} controls className="w-full max-w-[250px]" />
            </div>
          );
        }
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="h-1 bg-white/30 rounded-full">
                <div className="h-1 bg-white/70 rounded-full w-1/3" />
              </div>
              <span className="text-xs opacity-70 mt-1">{t('conversations.audio')}</span>
            </div>
          </div>
        );
      case 'file':
        return (
          <a
            href={isMediaUrl ? mediaSource : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
          >
            <span className="text-2xl">📄</span>
            <span className="text-sm opacity-80">{message.mediaCaption || message.content || t('conversations.file')}</span>
          </a>
        );
      default: {
        // Detect media placeholder patterns from historical messages
        const content = message.content?.trim() || '';
        if (content === '[Image]' || content === '[image]') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🖼️</span>
              <span className="text-sm opacity-80">{t('conversations.image') || 'Image'}</span>
            </div>
          );
        }
        if (content === '[Video]' || content === '[video]') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🎬</span>
              <span className="text-sm opacity-80">{t('conversations.video') || 'Video'}</span>
            </div>
          );
        }
        if (content === '[Audio]' || content === '[audio]') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🎵</span>
              <span className="text-sm opacity-80">{t('conversations.audio') || 'Audio'}</span>
            </div>
          );
        }
        if (content === '[Media message]' || content === 'Media message' || content === '[Sticker]') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">📎</span>
              <span className="text-sm opacity-80">{t('conversations.file') || 'Media'}</span>
            </div>
          );
        }
        return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
      }
    }
  };

  return (
    <div className={clsx(
      'flex mb-1',
      isOutgoing ? 'justify-end' : 'justify-start',
      isLast && 'mb-3'
    )}>
      <div className={clsx(
        'relative max-w-[75%] lg:max-w-[65%] px-3 py-2 shadow-sm',
        isOutgoing && !isOperator && 'bg-emerald-500 dark:bg-emerald-600 text-white',
        isOperator && 'bg-blue-500 dark:bg-blue-600 text-white',
        isIncoming && 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
        isOutgoing && isFirst && isLast && 'rounded-2xl rounded-br-md',
        isOutgoing && isFirst && !isLast && 'rounded-2xl rounded-br-md',
        isOutgoing && !isFirst && isLast && 'rounded-2xl rounded-br-md',
        isOutgoing && !isFirst && !isLast && 'rounded-2xl',
        isIncoming && isFirst && isLast && 'rounded-2xl rounded-bl-md',
        isIncoming && isFirst && !isLast && 'rounded-2xl rounded-bl-md',
        isIncoming && !isFirst && isLast && 'rounded-2xl rounded-bl-md',
        isIncoming && !isFirst && !isLast && 'rounded-2xl',
      )}>
        {isLast && isOutgoing && !isOperator && (
          <div className="absolute -right-1 bottom-0 w-3 h-3 overflow-hidden">
            <div className="absolute -left-2 bottom-0 w-4 h-4 bg-emerald-500 dark:bg-emerald-600 rotate-45 transform origin-bottom-left" />
          </div>
        )}
        {isLast && isOperator && (
          <div className="absolute -right-1 bottom-0 w-3 h-3 overflow-hidden">
            <div className="absolute -left-2 bottom-0 w-4 h-4 bg-blue-500 dark:bg-blue-600 rotate-45 transform origin-bottom-left" />
          </div>
        )}
        {isLast && isIncoming && (
          <div className="absolute -left-1 bottom-0 w-3 h-3 overflow-hidden">
            <div className="absolute -right-2 bottom-0 w-4 h-4 bg-white dark:bg-gray-700 rotate-45 transform origin-bottom-right" />
          </div>
        )}

        {renderMessageContent()}

        <div className={clsx(
          'flex items-center justify-end gap-1 mt-1 text-[10px]',
          isOutgoing ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
        )}>
          <span>{formatMessageTime(message.timestamp)}</span>
          {isOutgoing && <MessageStatus status={message.status} />}
          {message.status === 'failed' && (
            <span className="text-red-400 text-[10px] ml-1">{t('conversations.messageFailed')}</span>
          )}
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

const ContactItem = React.memo(({ contact, isSelected, onClick, formatContactTime, t }: ContactItemProps) => (
  <div role="listitem">
    <button
      onClick={onClick}
      aria-selected={isSelected}
      className={clsx(
        'w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-800',
        isSelected && 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={contact.name}
            className="w-12 h-12 rounded-full object-cover"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={clsx(
          "w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm",
          contact.isGroup
            ? "bg-gradient-to-br from-blue-400 to-purple-500"
            : "bg-gradient-to-br from-emerald-400 to-teal-500",
          contact.avatar && "hidden"
        )}>
          {contact.isGroup ? '👥' : contact.name.substring(0, 2).toUpperCase()}
        </div>
        {!contact.isGroup && contact.isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-white dark:border-gray-900 rounded-full" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {contact.name}
          </p>
          {contact.isHumanControlled && (
            <span className="ml-1 px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-[10px] font-medium rounded-full">
              {t('conversations.escalated')}
            </span>
          )}
          {contact.lastMessageTime && (
            <p className={clsx(
              'text-xs flex-shrink-0',
              contact.unreadCount > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-500 dark:text-gray-400'
            )}>
              {formatContactTime(contact.lastMessageTime)}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {contact.isTyping ? (
              <span className="text-emerald-600 dark:text-emerald-400 italic">{t('conversations.typing')}</span>
            ) : (
              contact.lastMessage || contact.phone
            )}
          </p>
          {contact.unreadCount > 0 && (
            <span className="flex-shrink-0 bg-emerald-500 text-white text-xs font-medium rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
              {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  </div>
));

ContactItem.displayName = 'ContactItem';

// --- Main component ---

const defaultT = (key: string) => {
  const fallbacks: Record<string, string> = {
    'conversations.search': 'Search conversations...',
    'conversations.typeMessage': 'Type a message...',
    'conversations.sendMessage': 'Send message',
    'conversations.loading': 'Loading conversations...',
    'conversations.group': 'Group',
    'conversations.noContacts': 'No contacts found',
    'conversations.noConversationsYet': 'No conversations yet',
    'conversations.tryDifferent': 'Try a different search term',
    'conversations.connectToStart': 'Connect WhatsApp to start receiving conversations',
    'conversations.startConversation': 'Start a conversation',
    'conversations.sendMessageTo': 'Send a message to',
    'conversations.recording': 'Recording... Release to send',
    'conversations.selectConversation': 'Select a conversation from the sidebar to start chatting',
    'conversations.online': 'Online',
    'conversations.typing': 'typing...',
    'conversations.escalated': 'Escalated',
    'conversations.escalatedToHuman': 'Escalated to human',
    'conversations.takeOver': 'Take over',
    'conversations.releaseToAI': 'Release to AI',
    'conversations.replyAsOperator': 'Reply as operator...',
    'conversations.escalationReason': 'Reason',
    'conversations.escalatedConversations': 'Escalated',
    'conversations.conversations': 'Conversations',
    'conversations.searchContacts': 'Search contacts...',
    'conversations.connectWhatsApp': 'Connect WhatsApp',
    'conversations.today': 'Today',
    'conversations.yesterday': 'Yesterday',
    'conversations.image': 'Image',
    'conversations.video': 'Video',
    'conversations.audio': 'Audio',
    'conversations.file': 'File',
    'conversations.imageUnavailable': 'Image unavailable',
    'conversations.messageFailed': 'Message failed',
  };
  return fallbacks[key] || key;
};

export function ConversationInterface({
  contacts,
  selectedContactId,
  messages,
  onSendMessage,
  onSelectContact,
  onArchiveContact,
  onTakeover,
  onRelease,
  onOperatorReply,
  isOperatorMode,
  isLoading = false,
  t: tProp,
}: ConversationInterfaceProps) {
  const t = tProp || defaultT;
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterMode, setFilterMode] = useState<'all' | 'escalated'>('all');
  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const escalatedCount = useMemo(() => contacts.filter(c => c.isHumanControlled).length, [contacts]);
  const filteredContacts = useMemo(() => contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery);
    const matchesFilter = filterMode === 'all' || contact.isHumanControlled;
    return matchesSearch && matchesFilter;
  }), [contacts, searchQuery, filterMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      if (selectedContact?.isHumanControlled && selectedContact?.assignedOperatorId && onOperatorReply) {
        onOperatorReply(selectedContact.id, messageInput.trim());
      } else {
        onSendMessage(messageInput.trim(), 'text');
      }
      setMessageInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMessage(`File: ${file.name}`, 'file');
    }
  };

  const formatMessageTime = (timestamp: Date) => {
    return format(timestamp, 'HH:mm');
  };

  const formatDateSeparator = (timestamp: Date) => {
    if (isToday(timestamp)) return t('conversations.today');
    if (isYesterday(timestamp)) return t('conversations.yesterday');
    return format(timestamp, 'MMMM d, yyyy');
  };

  const formatContactTime = (timestamp: Date) => {
    if (isToday(timestamp)) {
      return format(timestamp, 'HH:mm');
    }
    if (isYesterday(timestamp)) {
      return t('conversations.yesterday');
    }
    return format(timestamp, 'dd/MM/yyyy');
  };

  // Group messages by date
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    msgs.forEach(msg => {
      const msgDate = formatDateSeparator(msg.timestamp);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const sortedMessages = useMemo(() => [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()), [messages]);
  const groupedMessages = useMemo(() => groupMessagesByDate(sortedMessages), [sortedMessages]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Contacts Sidebar */}
      <div className={clsx(
        "h-full bg-white dark:bg-gray-800 flex flex-col overflow-hidden shadow-sm transition-all",
        "md:w-[340px]",
        showSidebar ? "w-full" : "hidden md:block"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 bg-emerald-600 dark:bg-emerald-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {t('conversations.conversations')}
            </h2>
            <button
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5 text-white/80" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-emerald-200" />
            <input
              type="text"
              placeholder={t('conversations.searchContacts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('conversations.searchContacts')}
              className="w-full pl-10 pr-4 py-2.5 bg-white/10 rounded-xl text-white placeholder-emerald-200 focus:outline-none focus:bg-white/20 transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          {escalatedCount > 0 && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setFilterMode('all')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                  filterMode === 'all'
                    ? 'bg-white text-emerald-700'
                    : 'bg-white/10 text-white hover:bg-white/20'
                )}
              >
                {t('conversations.conversations')}
              </button>
              <button
                onClick={() => setFilterMode('escalated')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors flex items-center gap-1',
                  filterMode === 'escalated'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                )}
              >
                ⚡ {t('conversations.escalatedConversations')}
                <span className={clsx(
                  'ml-1 px-1.5 py-0.5 text-xs rounded-full font-bold',
                  filterMode === 'escalated'
                    ? 'bg-white text-orange-600'
                    : 'bg-orange-500 text-white'
                )}>
                  {escalatedCount}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto" role="list">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="w-10 h-10 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-gray-900 dark:text-white font-medium mb-1">
                {searchQuery ? t('conversations.noContacts') : t('conversations.noConversationsYet')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchQuery ? t('conversations.tryDifferent') : t('conversations.connectToStart')}
              </p>
            </div>
          ) : (
            filteredContacts.map((contact, index) => (
              <ContactItem
                key={`${contact.id}-${index}`}
                contact={contact}
                isSelected={selectedContactId === contact.id}
                onClick={() => {
                  onSelectContact(contact.id);
                  if (window.innerWidth < 768) {
                    setShowSidebar(false);
                  }
                }}
                formatContactTime={formatContactTime}
                t={t}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={clsx(
        "flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-gray-800",
        showSidebar && selectedContactId ? "hidden md:flex" : "flex"
      )}>
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back button for mobile */}
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    aria-label="Back to contacts"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <div className="relative">
                    {selectedContact.avatar ? (
                      <img
                        src={selectedContact.avatar}
                        alt={selectedContact.name}
                        className="w-10 h-10 rounded-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={clsx(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm",
                      selectedContact.isGroup
                        ? "bg-gradient-to-br from-blue-400 to-purple-500"
                        : "bg-gradient-to-br from-emerald-400 to-teal-500",
                      selectedContact.avatar && "hidden"
                    )}>
                      {selectedContact.isGroup ? '👥' : selectedContact.name.substring(0, 2).toUpperCase()}
                    </div>
                    {!selectedContact.isGroup && selectedContact.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-gray-800 rounded-full" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedContact.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedContact.isGroup ? (
                        selectedContact.phone
                      ) : selectedContact.isTyping ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{t('conversations.typing')}</span>
                      ) : selectedContact.isOnline ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{t('conversations.online')}</span>
                      ) : (
                        selectedContact.phone
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors opacity-50 cursor-not-allowed"
                    aria-label="Video call"
                    disabled
                  >
                    <Video className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors opacity-50 cursor-not-allowed"
                    aria-label="Voice call"
                    disabled
                  >
                    <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  {onArchiveContact && (
                    <button
                      onClick={() => onArchiveContact(selectedContact.id)}
                      className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                      aria-label="Archive conversation"
                    >
                      <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                  <button
                    className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Escalation Banner */}
            {selectedContact?.isHumanControlled && (
              <div className="px-4 py-3 bg-orange-50 dark:bg-orange-900/30 border-b border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-600 dark:text-orange-400 text-lg">⚡</span>
                    <div>
                      <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                        {t('conversations.escalatedToHuman')}
                      </p>
                      {selectedContact.escalationReason && (
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {t('conversations.escalationReason')}: {selectedContact.escalationReason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!selectedContact.assignedOperatorId && onTakeover && (
                      <button
                        onClick={() => onTakeover(selectedContact.id)}
                        className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {t('conversations.takeOver')}
                      </button>
                    )}
                    {selectedContact.assignedOperatorId && onRelease && (
                      <button
                        onClick={() => onRelease(selectedContact.id)}
                        className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {t('conversations.releaseToAI')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 bg-gray-100 dark:bg-gray-900"
              role="log"
              aria-live="polite"
            >
              {loadError ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t('conversations.messageFailed')}</span>
                    <button
                      onClick={() => setLoadError(false)}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t('conversations.loading')}</span>
                  </div>
                </div>
              ) : !Array.isArray(messages) || messages.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full">
                  <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 text-center shadow-lg max-w-sm">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t('conversations.startConversation')}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('conversations.sendMessageTo')} {selectedContact.name}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {groupedMessages.map((group, groupIndex) => (
                    <div key={group.date}>
                      {/* Date separator */}
                      <div className="flex justify-center my-4">
                        <div className="bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm text-gray-600 dark:text-gray-300 text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm">
                          {group.date}
                        </div>
                      </div>

                      {/* Messages */}
                      {group.messages.map((message, msgIndex) => {
                        const prevMsg = msgIndex > 0 ? group.messages[msgIndex - 1] : null;
                        const nextMsg = msgIndex < group.messages.length - 1 ? group.messages[msgIndex + 1] : null;

                        const isFirst = !prevMsg || prevMsg.sender !== message.sender;
                        const isLast = !nextMsg || nextMsg.sender !== message.sender;

                        return (
                          <MessageBubble
                            key={message.id || `msg-${message.timestamp.getTime()}-${msgIndex}`}
                            message={message}
                            isFirst={isFirst}
                            isLast={isLast}
                            formatMessageTime={formatMessageTime}
                            t={t}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,audio/*,.pdf,.doc,.docx"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  aria-label="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                    }}
                    placeholder={selectedContact?.isHumanControlled && selectedContact?.assignedOperatorId ? t('conversations.replyAsOperator') : t('conversations.typeMessage')}
                    className="w-full resize-none px-4 py-2.5 pr-12 bg-gray-100 dark:bg-gray-700 border-0 rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
                    rows={1}
                    style={{ minHeight: '44px' }}
                  />

                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    aria-label="Add emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </div>

                {messageInput.trim() ? (
                  <button
                    onClick={handleSendMessage}
                    className={clsx(
                      "p-2.5 text-white rounded-full transition-colors shadow-lg",
                      selectedContact?.isHumanControlled && selectedContact?.assignedOperatorId
                        ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/30"
                        : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30"
                    )}
                    aria-label={t('conversations.sendMessage')}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onMouseDown={() => setIsRecording(true)}
                    onMouseUp={() => setIsRecording(false)}
                    onMouseLeave={() => setIsRecording(false)}
                    className={clsx(
                      'p-2.5 rounded-full transition-colors',
                      isRecording
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                    )}
                    aria-label="Record voice message"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>

              {isRecording && (
                <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  {t('conversations.recording')}
                </div>
              )}
            </div>
          </>
        ) : (
          /* No Contact Selected */
          <div
            className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-10 text-center shadow-xl max-w-md mx-4">
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
                <MessageCircle className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                WhatsApp Conversations
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {contacts.length === 0
                  ? t('conversations.connectToStart')
                  : t('conversations.selectConversation')
                }
              </p>
              {contacts.length === 0 && (
                <a
                  href="/dashboard/whatsapp"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/30"
                >
                  <Phone className="w-5 h-5" />
                  {t('conversations.connectWhatsApp')}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
