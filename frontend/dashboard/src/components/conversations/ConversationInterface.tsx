'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, Mic, Search, Archive, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'agent' | 'client' | 'system';
  type: 'text' | 'image' | 'audio' | 'file' | 'video';
  status?: 'sending' | 'sent' | 'delivered' | 'read';
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

  // All messages are displayed as-is, including <think> messages from the AI system

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
      // In a real implementation, you'd upload the file and get a URL
      onSendMessage(`File: ${file.name}`, 'file');
    }
  };

  const formatMessageTime = (timestamp: Date) => {
    const now = new Date();
    const isToday = timestamp.toDateString() === now.toDateString();
    
    if (isToday) {
      return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.sender === 'user'; // Messages sent by us through web interface
    const isAgent = message.sender === 'agent'; // AI response messages
    const isClient = message.sender === 'client'; // Messages from WhatsApp clients
    const isSystem = message.sender === 'system';
    
    // 'agent' (AI responses) and 'user' (web interface) messages go right
    // 'client' (WhatsApp contacts) messages go left
    const isRightSide = isAgent || isUser;
    const isLeftSide = isClient;
    
    const renderMessageContent = () => {
      switch (message.type) {
        case 'image':
          // Check if content is a base64 data URL
          if (message.content.startsWith('data:image')) {
            return (
              <div className="space-y-2">
                <img 
                  src={message.content} 
                  alt="WhatsApp Image" 
                  className="max-w-full rounded-lg"
                  style={{ maxHeight: '300px' }}
                />
              </div>
            );
          } else {
            // Fallback for text captions or placeholder
            return (
              <div className="space-y-2">
                <div className="bg-gray-200 dark:bg-gray-600 rounded-lg p-3 flex items-center space-x-2">
                  <span className="text-2xl">🖼️</span>
                  <span className="text-sm">{message.content}</span>
                </div>
              </div>
            );
          }
        case 'video':
          return (
            <div className="space-y-2">
              <div className="bg-gray-200 dark:bg-gray-600 rounded-lg p-3 flex items-center space-x-2">
                <span className="text-2xl">🎥</span>
                <span className="text-sm">{message.content}</span>
              </div>
            </div>
          );
        case 'audio':
          return (
            <div className="space-y-2">
              <div className="bg-gray-200 dark:bg-gray-600 rounded-lg p-3 flex items-center space-x-2">
                <span className="text-2xl">🎵</span>
                <span className="text-sm">{message.content}</span>
              </div>
            </div>
          );
        case 'file':
          return (
            <div className="space-y-2">
              <div className="bg-gray-200 dark:bg-gray-600 rounded-lg p-3 flex items-center space-x-2">
                <span className="text-2xl">📄</span>
                <span className="text-sm">{message.content}</span>
              </div>
            </div>
          );
        default:
          return <p className="whitespace-pre-wrap">{message.content}</p>;
      }
    };
    
    return (
      <div className={clsx(
        'flex mb-4',
        isRightSide ? 'justify-end' : 'justify-start',
        isSystem && 'justify-center'
      )}>
        <div className={clsx(
          'max-w-xs lg:max-w-md px-4 py-2 rounded-2xl',
          isClient && 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm', // WhatsApp client messages - left side, gray
          isAgent && 'bg-green-600 text-white rounded-br-sm', // AI messages - right side, green
          isUser && 'bg-blue-600 text-white rounded-br-sm', // User messages via web interface - right side, blue
          isSystem && 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm px-3 py-1'
        )}>
          {renderMessageContent()}
          <div className={clsx(
            'flex items-center justify-between mt-1 text-xs',
            isAgent && 'text-green-100',
            isUser && 'text-blue-100',
            isClient && 'text-gray-500 dark:text-gray-400'
          )}>
            <span>{formatMessageTime(message.timestamp)}</span>
            {isRightSide && message.status && (
              <span className="ml-2">
                {message.status === 'sending' && '○'}
                {message.status === 'sent' && '✓'}
                {message.status === 'delivered' && '✓✓'}
                {message.status === 'read' && '✓✓'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ContactItem = ({ contact }: { contact: Contact }) => (
    <button
      onClick={() => onSelectContact(contact.id)}
      className={clsx(
        'w-full p-4 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
        selectedContactId === contact.id && 'bg-blue-50 dark:bg-blue-900 border-r-2 border-blue-600'
      )}
    >
      <div className="relative">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
          {contact.name.substring(0, 2).toUpperCase()}
        </div>
        {contact.isOnline && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full"></div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {contact.name}
          </p>
          {contact.lastMessageTime && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(contact.lastMessageTime, { addSuffix: true })}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {contact.isTyping ? (
              <span className="text-blue-600 dark:text-blue-400 italic">typing...</span>
            ) : (
              contact.lastMessage || contact.phone
            )}
          </p>
          {contact.unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
              {contact.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      {/* Contacts Sidebar */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              WhatsApp Conversations
            </h2>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
              <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No contacts found' : (
                <div className="py-8">
                  <p className="mb-2">No conversations yet</p>
                  <p className="text-sm">Connect WhatsApp to start receiving conversations</p>
                </div>
              )}
            </div>
          ) : (
            filteredContacts.map((contact, index) => (
              <ContactItem key={`${contact.id}-${index}`} contact={contact} />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                      {selectedContact.name.substring(0, 2).toUpperCase()}
                    </div>
                    {selectedContact.isOnline && (
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-900 rounded-full"></div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedContact.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedContact.isTyping ? 'typing...' : selectedContact.phone}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                    <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                    <Video className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  {onArchiveContact && (
                    <button 
                      onClick={() => onArchiveContact(selectedContact.id)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                    >
                      <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                  <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                    <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !Array.isArray(messages) || messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-gray-500 dark:text-gray-400">
                  No messages yet. Start a conversation!
                </div>
              ) : (
                <>
                  {messages
                    .sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime()) // Ensure chronological order
                    .map((message, index) => (
                      <MessageBubble key={message.id || `msg-${message.timestamp.getTime()}-${index}`} message={message} />
                    ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="flex items-end space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,audio/*,.pdf,.doc,.docx"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="w-full resize-none px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
                    rows={1}
                    style={{ minHeight: '2.5rem' }}
                  />
                  
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onMouseDown={() => setIsRecording(true)}
                  onMouseUp={() => setIsRecording(false)}
                  onMouseLeave={() => setIsRecording(false)}
                  className={clsx(
                    'p-2 rounded-full transition-colors',
                    isRecording 
                      ? 'bg-red-600 text-white' 
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <Mic className="w-5 h-5" />
                </button>

                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

              {isRecording && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400 animate-pulse">
                  Recording... Release to send
                </div>
              )}
            </div>
          </>
        ) : (
          /* No Contact Selected */
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                WhatsApp Conversations
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                {contacts.length === 0 
                  ? 'Connect your WhatsApp to start receiving conversations' 
                  : 'Select a contact to start chatting'
                }
              </p>
              {contacts.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Go to WhatsApp settings to set up your connection
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}