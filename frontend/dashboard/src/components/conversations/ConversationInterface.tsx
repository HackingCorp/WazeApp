'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, Mic, Search, Archive, Settings, MessageCircle, Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import clsx from 'clsx';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'agent' | 'client' | 'system';
  type: 'text' | 'image' | 'audio' | 'file' | 'video';
  status?: 'sending' | 'sent' | 'delivered' | 'read';
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
}

interface ConversationInterfaceProps {
  contacts: Contact[];
  selectedContactId?: string;
  messages: Message[];
  onSendMessage: (content: string, type: 'text' | 'image' | 'audio' | 'file' | 'video') => void;
  onSelectContact: (contactId: string) => void;
  onArchiveContact?: (contactId: string) => void;
  isLoading?: boolean;
}

export function ConversationInterface({
  contacts,
  selectedContactId,
  messages,
  onSendMessage,
  onSelectContact,
  onArchiveContact,
  isLoading = false,
}: ConversationInterfaceProps) {
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phone.includes(searchQuery)
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      onSendMessage(messageInput.trim(), 'text');
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
    if (isToday(timestamp)) return 'Today';
    if (isYesterday(timestamp)) return 'Yesterday';
    return format(timestamp, 'MMMM d, yyyy');
  };

  const formatContactTime = (timestamp: Date) => {
    if (isToday(timestamp)) {
      return format(timestamp, 'HH:mm');
    }
    if (isYesterday(timestamp)) {
      return 'Yesterday';
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

  const MessageStatus = ({ status }: { status?: string }) => {
    if (!status) return null;

    return (
      <span className="ml-1 inline-flex">
        {status === 'sending' && (
          <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
        )}
        {status === 'sent' && <Check className="w-3.5 h-3.5" />}
        {status === 'delivered' && <CheckCheck className="w-3.5 h-3.5" />}
        {status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
      </span>
    );
  };

  const MessageBubble = ({ message, isFirst, isLast }: { message: Message; isFirst: boolean; isLast: boolean }) => {
    const isUser = message.sender === 'user';
    const isAgent = message.sender === 'agent';
    const isClient = message.sender === 'client';
    const isSystem = message.sender === 'system';

    const isOutgoing = isAgent || isUser;
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
      // Get the media URL - check mediaUrl field first, then content
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
                <img
                  src={mediaSource}
                  alt={message.mediaCaption || "Image"}
                  className="rounded-lg max-w-[280px] max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(mediaSource, '_blank')}
                  onError={(e) => {
                    // Fallback if image fails to load
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                      <div class="flex items-center gap-2 bg-black/10 rounded-lg p-3">
                        <span class="text-2xl">🖼️</span>
                        <span class="text-sm opacity-80">Image not available</span>
                      </div>
                    `;
                  }}
                />
                {message.mediaCaption && (
                  <p className="text-sm opacity-90">{message.mediaCaption}</p>
                )}
              </div>
            );
          }
          return (
            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-lg p-3">
              <span className="text-2xl">🖼️</span>
              <span className="text-sm opacity-80">{message.content || 'Image'}</span>
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
              <span className="text-sm opacity-80">{message.content || 'Video'}</span>
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
                <span className="text-xs opacity-70 mt-1">Audio</span>
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
              <span className="text-sm opacity-80">{message.mediaCaption || message.content || 'File'}</span>
            </a>
          );
        default:
          return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
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
          // Outgoing messages (user/agent) - right side, green
          isOutgoing && 'bg-emerald-500 dark:bg-emerald-600 text-white',
          // Incoming messages (client) - left side, white/gray
          isIncoming && 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
          // Border radius based on position
          isOutgoing && isFirst && isLast && 'rounded-2xl rounded-br-md',
          isOutgoing && isFirst && !isLast && 'rounded-2xl rounded-br-md',
          isOutgoing && !isFirst && isLast && 'rounded-2xl rounded-br-md',
          isOutgoing && !isFirst && !isLast && 'rounded-2xl',
          isIncoming && isFirst && isLast && 'rounded-2xl rounded-bl-md',
          isIncoming && isFirst && !isLast && 'rounded-2xl rounded-bl-md',
          isIncoming && !isFirst && isLast && 'rounded-2xl rounded-bl-md',
          isIncoming && !isFirst && !isLast && 'rounded-2xl',
        )}>
          {/* Message tail for first message in group */}
          {isLast && isOutgoing && (
            <div className="absolute -right-1 bottom-0 w-3 h-3 overflow-hidden">
              <div className="absolute -left-2 bottom-0 w-4 h-4 bg-emerald-500 dark:bg-emerald-600 rotate-45 transform origin-bottom-left" />
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
          </div>
        </div>
      </div>
    );
  };

  const ContactItem = ({ contact }: { contact: Contact }) => (
    <button
      onClick={() => onSelectContact(contact.id)}
      className={clsx(
        'w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-800',
        selectedContactId === contact.id && 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
          {contact.name.substring(0, 2).toUpperCase()}
        </div>
        {contact.isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-white dark:border-gray-900 rounded-full" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {contact.name}
          </p>
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
              <span className="text-emerald-600 dark:text-emerald-400 italic">typing...</span>
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
  );

  const messageGroups = groupMessagesByDate(
    [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Contacts Sidebar */}
      <div className="w-[340px] h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        {/* Sidebar Header */}
        <div className="p-4 bg-emerald-600 dark:bg-emerald-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Conversations
            </h2>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Settings className="w-5 h-5 text-white/80" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-emerald-200" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-emerald-200 focus:outline-none focus:bg-white/20 focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="w-10 h-10 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-gray-900 dark:text-white font-medium mb-1">
                {searchQuery ? 'No contacts found' : 'No conversations yet'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Try a different search term' : 'Connect WhatsApp to start receiving conversations'}
              </p>
            </div>
          ) : (
            filteredContacts.map((contact, index) => (
              <ContactItem key={`${contact.id}-${index}`} contact={contact} />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                      {selectedContact.name.substring(0, 2).toUpperCase()}
                    </div>
                    {selectedContact.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-gray-800 rounded-full" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedContact.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedContact.isTyping ? (
                        <span className="text-emerald-600 dark:text-emerald-400">typing...</span>
                      ) : selectedContact.isOnline ? (
                        <span className="text-emerald-600 dark:text-emerald-400">online</span>
                      ) : (
                        selectedContact.phone
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                    <Video className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                    <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  {onArchiveContact && (
                    <button
                      onClick={() => onArchiveContact(selectedContact.id)}
                      className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                      <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                  <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                    <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                backgroundColor: '#f0f2f5',
              }}
            >
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Loading messages...</span>
                  </div>
                </div>
              ) : !Array.isArray(messages) || messages.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full">
                  <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 text-center shadow-lg max-w-sm">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Start a conversation
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Send a message to {selectedContact.name}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messageGroups.map((group, groupIndex) => (
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
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="w-full resize-none px-4 py-2.5 pr-12 bg-gray-100 dark:bg-gray-700 border-0 rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
                    rows={1}
                    style={{ minHeight: '44px' }}
                  />

                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </div>

                {messageInput.trim() ? (
                  <button
                    onClick={handleSendMessage}
                    className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors shadow-lg shadow-emerald-500/30"
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
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>

              {isRecording && (
                <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Recording... Release to send
                </div>
              )}
            </div>
          </>
        ) : (
          /* No Contact Selected */
          <div
            className="flex-1 flex items-center justify-center"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#f0f2f5',
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
                  ? 'Connect your WhatsApp to start receiving conversations'
                  : 'Select a conversation from the sidebar to start chatting'
                }
              </p>
              {contacts.length === 0 && (
                <a
                  href="/dashboard/whatsapp"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-emerald-500/30"
                >
                  <Phone className="w-5 h-5" />
                  Connect WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
