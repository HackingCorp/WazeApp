'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, Mic, Search, Archive, Settings, MessageCircle, Check, CheckCheck, Menu, ArrowLeft, AlertCircle, UserCheck, Bot } from 'lucide-react';
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
        <div className="w-3 h-3 rounded-full border border-[#667781] border-t-transparent animate-spin" />
      )}
      {status === 'sent' && <Check className="w-4 h-4 text-[#667781]" />}
      {status === 'delivered' && <CheckCheck className="w-4 h-4 text-[#667781]" />}
      {status === 'read' && <CheckCheck className="w-4 h-4 text-[#53bdeb]" />}
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
        <div className="bg-[#d1f4cc] dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-md shadow-sm">
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
        // Detect media placeholder patterns from historical messages (case-insensitive)
        const content = message.content?.trim().toLowerCase() || '';
        if (content === '[image]' || content === 'image') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🖼️</span>
              <span className="text-sm opacity-80">{t('conversations.image') || 'Image'}</span>
            </div>
          );
        }
        if (content === '[video]' || content === 'video') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🎬</span>
              <span className="text-sm opacity-80">{t('conversations.video') || 'Video'}</span>
            </div>
          );
        }
        if (content === '[audio]' || content === 'audio') {
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🎵</span>
              <span className="text-sm opacity-80">{t('conversations.audio') || 'Audio'}</span>
            </div>
          );
        }
        if (content === '[media message]' || content === 'media message' || content === '[sticker]' || content === '[media]' || content === '[document]' || content === '[file]') {
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
        'relative max-w-[75%] lg:max-w-[65%] px-2 py-1.5 shadow-sm text-[14.2px]',
        isOutgoing && !isOperator && 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef]',
        isOperator && 'bg-[#d1e7ff] dark:bg-[#1a3a5c] text-[#111b21] dark:text-[#e9edef]',
        isIncoming && 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef]',
        isOutgoing && isFirst && isLast && 'rounded-lg rounded-tr-none',
        isOutgoing && isFirst && !isLast && 'rounded-lg rounded-tr-none',
        isOutgoing && !isFirst && isLast && 'rounded-lg',
        isOutgoing && !isFirst && !isLast && 'rounded-lg',
        isIncoming && isFirst && isLast && 'rounded-lg rounded-tl-none',
        isIncoming && isFirst && !isLast && 'rounded-lg rounded-tl-none',
        isIncoming && !isFirst && isLast && 'rounded-lg',
        isIncoming && !isFirst && !isLast && 'rounded-lg',
      )}>
        {isFirst && isOutgoing && !isOperator && (
          <div className="absolute -right-2 top-0 w-2 h-3 overflow-hidden">
            <div className="absolute left-0 top-0 w-2 h-3 bg-[#d9fdd3] dark:bg-[#005c4b]" style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }} />
          </div>
        )}
        {isFirst && isOperator && (
          <div className="absolute -right-2 top-0 w-2 h-3 overflow-hidden">
            <div className="absolute left-0 top-0 w-2 h-3 bg-[#d1e7ff] dark:bg-[#1a3a5c]" style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }} />
          </div>
        )}
        {isFirst && isIncoming && (
          <div className="absolute -left-2 top-0 w-2 h-3 overflow-hidden">
            <div className="absolute right-0 top-0 w-2 h-3 bg-white dark:bg-[#202c33]" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          </div>
        )}

        {renderMessageContent()}

        <div className={clsx(
          'flex items-center justify-end gap-1 mt-0.5 text-[11px]',
          isOutgoing ? 'text-[#667781] dark:text-[#8696a0]' : 'text-[#667781] dark:text-[#8696a0]'
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
        'w-full px-3 py-3 flex items-center gap-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors border-b border-[#e9edef] dark:border-[#222d34]',
        isSelected && 'bg-[#f0f2f5] dark:bg-[#2a3942] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]'
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
            ? "bg-[#6a7175]"
            : "bg-[#dfe5e7] dark:bg-[#6a7175]",
          contact.avatar && "hidden"
        )}>
          <span className={clsx(!contact.isGroup && "text-[#cfd4d6] dark:text-white text-lg")}>
            {contact.isGroup ? '👥' : contact.name.substring(0, 2).toUpperCase()}
          </span>
        </div>
        {!contact.isGroup && contact.isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25d366] border-2 border-white dark:border-[#111b21] rounded-full" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[16px] font-normal text-[#111b21] dark:text-[#e9edef] truncate">
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
              contact.unreadCount > 0 ? 'text-[#25d366] dark:text-[#00a884] font-medium' : 'text-[#667781] dark:text-[#8696a0]'
            )}>
              {formatContactTime(contact.lastMessageTime)}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[13px] text-[#667781] dark:text-[#8696a0] truncate">
            {contact.isTyping ? (
              <span className="text-[#25d366] dark:text-[#00a884] italic">{t('conversations.typing')}</span>
            ) : (
              contact.lastMessage || contact.phone
            )}
          </p>
          {contact.unreadCount > 0 && (
            <span className="flex-shrink-0 bg-[#25d366] dark:bg-[#00a884] text-white text-[11px] font-medium rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
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
        "h-full bg-white dark:bg-[#111b21] flex flex-col overflow-hidden transition-all",
        "md:w-[340px] border-r border-[#e9edef] dark:border-[#222d34]",
        showSidebar ? "w-full" : "hidden md:block"
      )}>
        {/* Sidebar Header */}
        <div className="bg-[#f0f2f5] dark:bg-[#202c33]">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[16px] font-semibold text-[#111b21] dark:text-[#e9edef]">
              {t('conversations.conversations')}
            </h2>
            <button
              className="p-2 hover:bg-[#e9edef] dark:hover:bg-[#374248] rounded-full transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5 text-[#54656f] dark:text-[#aebac1]" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#54656f] dark:text-[#8696a0]" />
              <input
                type="text"
                placeholder={t('conversations.searchContacts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('conversations.searchContacts')}
                className="w-full pl-10 pr-4 py-1.5 bg-white dark:bg-[#2a3942] rounded-lg text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] dark:placeholder-[#8696a0] text-sm focus:outline-none border border-transparent focus:border-[#00a884] transition-colors"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          {escalatedCount > 0 && (
            <div className="flex gap-2 px-3 pb-2">
              <button
                onClick={() => setFilterMode('all')}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                  filterMode === 'all'
                    ? 'bg-[#00a884] text-white'
                    : 'bg-[#e9edef] dark:bg-[#374248] text-[#54656f] dark:text-[#8696a0] hover:bg-[#d1d7db] dark:hover:bg-[#3b4a54]'
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
                    : 'bg-[#e9edef] dark:bg-[#374248] text-[#54656f] dark:text-[#8696a0] hover:bg-[#d1d7db] dark:hover:bg-[#3b4a54]'
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
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]" role="list">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-20 h-20 bg-[#f0f2f5] dark:bg-[#202c33] rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="w-10 h-10 text-[#8696a0]" />
              </div>
              <h3 className="text-[#111b21] dark:text-[#e9edef] font-medium mb-1">
                {searchQuery ? t('conversations.noContacts') : t('conversations.noConversationsYet')}
              </h3>
              <p className="text-sm text-[#667781] dark:text-[#8696a0]">
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
        "flex-1 flex flex-col h-full overflow-hidden bg-[#efeae2] dark:bg-[#0b141a]",
        showSidebar && selectedContactId ? "hidden md:flex" : "flex"
      )}>
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-2 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#e9edef] dark:border-[#222d34]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Back button for mobile */}
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="md:hidden p-2 hover:bg-[#e9edef] dark:hover:bg-[#374248] rounded-full transition-colors"
                    aria-label="Back to contacts"
                  >
                    <ArrowLeft className="w-5 h-5 text-[#54656f] dark:text-[#aebac1]" />
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
                        ? "bg-[#6a7175]"
                        : "bg-[#dfe5e7] dark:bg-[#6a7175]",
                      selectedContact.avatar && "hidden"
                    )}>
                      <span className={clsx(!selectedContact.isGroup && "text-[#cfd4d6] dark:text-white")}>
                        {selectedContact.isGroup ? '👥' : selectedContact.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    {!selectedContact.isGroup && selectedContact.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] border-2 border-[#f0f2f5] dark:border-[#202c33] rounded-full" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-normal text-[#111b21] dark:text-[#e9edef]">
                      {selectedContact.name}
                    </h3>
                    <p className="text-[13px] text-[#667781] dark:text-[#8696a0]">
                      {selectedContact.isGroup ? (
                        selectedContact.phone
                      ) : selectedContact.isTyping ? (
                        <span className="text-[#25d366] dark:text-[#00a884]">{t('conversations.typing')}</span>
                      ) : selectedContact.isOnline ? (
                        <span className="text-[#25d366] dark:text-[#00a884]">{t('conversations.online')}</span>
                      ) : (
                        selectedContact.phone
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Takeover / Release button - always visible */}
                  {!selectedContact.isHumanControlled && onTakeover && (
                    <button
                      onClick={() => onTakeover(selectedContact.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                      aria-label={t('conversations.takeOver')}
                      title={t('conversations.takeOver')}
                    >
                      <UserCheck className="w-4 h-4" />
                      {t('conversations.takeOver')}
                    </button>
                  )}
                  {selectedContact.isHumanControlled && selectedContact.assignedOperatorId && onRelease && (
                    <button
                      onClick={() => onRelease(selectedContact.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00a884] hover:bg-[#008069] text-white text-xs font-medium rounded-lg transition-colors"
                      aria-label={t('conversations.releaseToAI')}
                      title={t('conversations.releaseToAI')}
                    >
                      <Bot className="w-4 h-4" />
                      {t('conversations.releaseToAI')}
                    </button>
                  )}
                  {selectedContact.isHumanControlled && !selectedContact.assignedOperatorId && onTakeover && (
                    <button
                      onClick={() => onTakeover(selectedContact.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors animate-pulse"
                      aria-label={t('conversations.takeOver')}
                      title={t('conversations.takeOver')}
                    >
                      <UserCheck className="w-4 h-4" />
                      {t('conversations.takeOver')}
                    </button>
                  )}
                  {onArchiveContact && (
                    <button
                      onClick={() => onArchiveContact(selectedContact.id)}
                      className="p-2.5 hover:bg-[#e9edef] dark:hover:bg-[#374248] rounded-full transition-colors"
                      aria-label="Archive conversation"
                    >
                      <Archive className="w-5 h-5 text-[#54656f] dark:text-[#aebac1]" />
                    </button>
                  )}
                  <button
                    className="p-2.5 hover:bg-[#e9edef] dark:hover:bg-[#374248] rounded-full transition-colors"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-5 h-5 text-[#54656f] dark:text-[#aebac1]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Escalation Banner */}
            {selectedContact?.isHumanControlled && (
              <div className="px-4 py-2.5 bg-[#fef3c7] dark:bg-[#3b2e14] border-b border-[#e9edef] dark:border-[#222d34]">
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
              className="flex-1 overflow-y-auto px-[3%] lg:px-[5%] py-3 bg-[#efeae2] dark:bg-[#0b141a] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%20viewBox%3D%220%200%20200%20200%22%3E%3Cg%20fill%3D%22%23d1d7db%22%20fill-opacity%3D%220.4%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2260%22%20cy%3D%2240%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%2215%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22140%22%20cy%3D%2235%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%2225%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2270%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2280%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22110%22%20cy%3D%2265%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%2275%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22190%22%20cy%3D%2260%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%2215%22%20cy%3D%22120%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2255%22%20cy%3D%22130%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%2295%22%20cy%3D%22115%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22135%22%20cy%3D%22125%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%22175%22%20cy%3D%22110%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%2240%22%20cy%3D%22165%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%2280%22%20cy%3D%22175%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22120%22%20cy%3D%22160%22%20r%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%22160%22%20cy%3D%22170%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%22195%22%20cy%3D%22155%22%20r%3D%221.5%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E')]"
              role="log"
              aria-live="polite"
            >
              {loadError ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                    <span className="text-sm text-[#667781]">{t('conversations.messageFailed')}</span>
                    <button
                      onClick={() => setLoadError(false)}
                      className="px-4 py-2 bg-[#00a884] hover:bg-[#008069] text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-[#00a884] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-[#667781]">{t('conversations.loading')}</span>
                  </div>
                </div>
              ) : !Array.isArray(messages) || messages.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full">
                  <div className="bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-sm rounded-xl p-8 text-center shadow-lg max-w-sm">
                    <div className="w-16 h-16 bg-[#00a884]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-[#00a884]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef] mb-2">
                      {t('conversations.startConversation')}
                    </h3>
                    <p className="text-sm text-[#667781] dark:text-[#8696a0]">
                      {t('conversations.sendMessageTo')} {selectedContact.name}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {groupedMessages.map((group, groupIndex) => (
                    <div key={group.date}>
                      {/* Date separator */}
                      <div className="flex justify-center my-3">
                        <div className="bg-white dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[12.5px] px-3 py-1 rounded-md shadow-sm">
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
            <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#202c33]">
              <div className="flex items-end gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,audio/*,.pdf,.doc,.docx"
                />

                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-2 text-[#54656f] dark:text-[#8696a0] hover:text-[#3b4a54] dark:hover:text-[#e9edef] transition-colors"
                  aria-label="Add emoji"
                >
                  <Smile className="w-6 h-6" />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-[#54656f] dark:text-[#8696a0] hover:text-[#3b4a54] dark:hover:text-[#e9edef] transition-colors"
                  aria-label="Attach file"
                >
                  <Paperclip className="w-6 h-6" />
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
                    className="w-full resize-none px-3 py-2.5 bg-white dark:bg-[#2a3942] border-0 rounded-lg text-[#111b21] dark:text-[#e9edef] placeholder-[#667781] dark:placeholder-[#8696a0] focus:outline-none text-[15px] max-h-32"
                    rows={1}
                    style={{ minHeight: '42px' }}
                  />
                </div>

                {messageInput.trim() ? (
                  <button
                    onClick={handleSendMessage}
                    className={clsx(
                      "p-2 rounded-full transition-colors",
                      selectedContact?.isHumanControlled && selectedContact?.assignedOperatorId
                        ? "text-[#54656f] dark:text-[#8696a0] hover:text-blue-500"
                        : "text-[#54656f] dark:text-[#8696a0] hover:text-[#00a884]"
                    )}
                    aria-label={t('conversations.sendMessage')}
                  >
                    <Send className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    onMouseDown={() => setIsRecording(true)}
                    onMouseUp={() => setIsRecording(false)}
                    onMouseLeave={() => setIsRecording(false)}
                    className={clsx(
                      'p-2 rounded-full transition-colors',
                      isRecording
                        ? 'text-red-500'
                        : 'text-[#54656f] dark:text-[#8696a0] hover:text-[#3b4a54] dark:hover:text-[#e9edef]'
                    )}
                    aria-label="Record voice message"
                  >
                    <Mic className="w-6 h-6" />
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
            className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#222e35]"
          >
            <div className="text-center max-w-md mx-4">
              <div className="w-[320px] h-[188px] mx-auto mb-8 flex items-center justify-center">
                <div className="relative">
                  <div className="w-28 h-28 rounded-full bg-[#00a884]/10 flex items-center justify-center">
                    <MessageCircle className="w-14 h-14 text-[#00a884]" />
                  </div>
                </div>
              </div>
              <h3 className="text-[28px] font-light text-[#41525d] dark:text-[#e9edef] mb-3">
                WhatsApp Conversations
              </h3>
              <p className="text-[14px] text-[#667781] dark:text-[#8696a0] mb-8 leading-5">
                {contacts.length === 0
                  ? t('conversations.connectToStart')
                  : t('conversations.selectConversation')
                }
              </p>
              {contacts.length === 0 && (
                <a
                  href="/dashboard/whatsapp"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#00a884] hover:bg-[#008069] text-white font-medium rounded-full transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  {t('conversations.connectWhatsApp')}
                </a>
              )}
            </div>
            <div className="mt-10 flex items-center gap-1 text-[#667781] dark:text-[#8696a0] text-[14px]">
              <span>🔒</span>
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
