'use client';

import React, { useState, useEffect } from 'react';
import { ConversationInterface } from '@/components/conversations/ConversationInterface';
import { useSocket } from '@/providers/SocketProvider';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';


export default function ConversationsPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>();
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [whatsappSessions, setWhatsappSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<{
    isActive: boolean;
    status: 'started' | 'progress' | 'completed' | 'failed';
    totalChats: number;
    syncedChats: number;
    currentChat: string;
    error?: string;
  } | null>(null);
  const [contactsMap, setContactsMap] = useState<Record<string, any>>({});
  const { socket, subscribe } = useSocket();

  // Load WhatsApp sessions on mount
  useEffect(() => {
    if (user) {
      loadWhatsAppSessions();
    }
  }, [user]);

  // Load contacts when session changes
  useEffect(() => {
    if (selectedSessionId) {
      loadContactsForSession(selectedSessionId);
    }
  }, [selectedSessionId]);

  // Load conversations when selected session changes
  useEffect(() => {
    if (selectedSessionId) {
      loadConversations();
    } else {
      setContacts([]);
      setLoadingConversations(false);
    }
  }, [selectedSessionId]);

  // Load messages when contact is selected
  useEffect(() => {
    if (selectedContactId) {
      loadMessages(selectedContactId);
    }
  }, [selectedContactId]);

  const loadWhatsAppSessions = async () => {
    try {
      const response = await api.getWhatsAppSessions();
      console.log('WhatsApp sessions API response:', response);
      
      // Handle nested data structure
      const sessions = response?.data?.data || response?.data || [];
      
      // Filter only connected sessions
      const connectedSessions = sessions.filter((session: any) => session.status === 'connected');
      setWhatsappSessions(connectedSessions);
      
      // Auto-select first connected session if none selected
      if (connectedSessions.length > 0 && !selectedSessionId) {
        setSelectedSessionId(connectedSessions[0].id);
      }
      
      console.log('Loaded WhatsApp sessions:', connectedSessions);
    } catch (error) {
      console.error('Failed to load WhatsApp sessions:', error);
      toast.error('Failed to load WhatsApp sessions');
    }
  };

  const loadContactsForSession = async (sessionId: string) => {
    try {
      console.log('Loading contacts for session:', sessionId);
      const response = await api.getSessionContacts(sessionId);

      if (response.success && response.data) {
        // Create a map of phone numbers to contact info
        const map: Record<string, any> = {};
        const contacts = response.data || [];

        contacts.forEach((contact: any) => {
          if (contact.phoneNumber) {
            map[contact.phoneNumber] = contact;
            // Also map with + prefix if not present
            if (!contact.phoneNumber.startsWith('+')) {
              map[`+${contact.phoneNumber}`] = contact;
            }
          }
        });

        setContactsMap(map);
        console.log(`Loaded ${contacts.length} contacts for session ${sessionId}`);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
      // Don't show error toast - contacts are optional
    }
  };

  // Helper function to get contact display name
  const getContactDisplayName = (phoneNumber: string): string => {
    if (!phoneNumber) return 'Unknown';

    // Clean phone number for lookup
    const cleanPhone = phoneNumber
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@lid$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/@g\.us$/i, '');

    // Try to find contact in our map
    const contact = contactsMap[cleanPhone] || contactsMap[`+${cleanPhone}`] || contactsMap[cleanPhone.replace(/^\+/, '')];

    if (contact) {
      return contact.name || contact.pushName || contact.shortName || cleanPhone;
    }

    // Format phone number nicely if no contact found
    return cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
  };

  const loadConversations = async () => {
    if (!selectedSessionId || !selectedSessionId.trim()) {
      setContacts([]);
      setLoadingConversations(false);
      return;
    }

    try {
      setLoadingConversations(true);
      console.log('Loading conversations for sessionId:', selectedSessionId);
      
      // Pass sessionId as query parameter to filter conversations
      const response = await api.get(`/whatsapp/conversations?sessionId=${selectedSessionId}`);
      console.log('Conversations API response:', response);
      
      // Handle direct array response from API (no wrapping)
      const conversations = Array.isArray(response) ? response : response?.data || [];
      
      if (conversations.length > 0) {
        // Convert backend format to frontend format
        const formattedContacts = conversations.map((conv: any) => {
          const isGroup = conv.phoneNumber?.includes('@g.us') || false;

          // Clean phone number - remove all WhatsApp suffixes (@s.whatsapp.net, @lid, @c.us)
          const cleanPhoneNumber = (phone: string) => {
            if (!phone) return '';
            return phone
              .replace(/@s\.whatsapp\.net$/i, '')
              .replace(/@lid$/i, '')
              .replace(/@c\.us$/i, '')
              .replace(/@g\.us$/i, '');
          };

          // Use contact name from our contacts map, or fallback to conversation name, or clean phone
          let displayName = conv.name;
          if (!displayName || displayName === conv.phoneNumber || displayName.includes('@')) {
            // Try to get name from contacts map
            displayName = getContactDisplayName(conv.phoneNumber);
          }

          // Better formatting for groups
          if (isGroup && !displayName.includes('📱')) {
            const groupId = cleanPhoneNumber(conv.phoneNumber);
            displayName = conv.name && !conv.name.includes('@')
              ? `📱 ${conv.name}`
              : `📱 Group ${groupId}`;
          }

          return {
            id: conv.id,
            name: displayName,
            phone: conv.phoneNumber,
            lastMessage: conv.lastMessage || '',
            lastMessageTime: new Date(conv.lastMessageTime),
            unreadCount: conv.unreadCount || 0,
            isOnline: conv.isOnline || false,
            isTyping: false,
          };
        });
        
        setContacts(formattedContacts);
      } else {
        // No real conversations, show empty state
        setContacts([]);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      
      // Check if it's an authentication error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication required') || errorMessage.includes('Invalid or expired token')) {
        toast.error('Your session has expired. Please refresh the page to log in again.');
      } else {
        // Show empty state for other errors
        setContacts([]);
        toast.error('Failed to load conversations - connect WhatsApp to see real conversations');
      }
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setIsLoading(true);
      
      const response = await api.getWhatsAppConversationMessages(conversationId);
      
      // Handle direct array response from API (no wrapping)
      const rawMessages = Array.isArray(response) ? response : response?.data || [];
      console.log('Loaded raw messages:', rawMessages);
      
      // Convert timestamp strings to Date objects and sort by timestamp (oldest first)
      const messages = rawMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })).sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
      
      console.log('Processed messages:', messages);
      setMessages(messages);
      
      // Mark conversation as read
      await api.markWhatsAppConversationAsRead(conversationId);
      setContacts(prev => prev.map(contact => 
        contact.id === conversationId 
          ? { ...contact, unreadCount: 0 }
          : contact
      ));
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: any) => {
      console.log('Received WhatsApp message event:', data);
      
      if (data.contactId === selectedContactId) {
        // Ensure timestamp is a Date object
        const message = {
          ...data.message,
          timestamp: new Date(data.message.timestamp),
        };
        console.log('Adding new message to conversation:', message);
        setMessages(prev => {
          const updated = [...prev, message];
          // Sort messages by timestamp to ensure proper ordering
          return updated.sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
        });
      }
      
      // Update contact's last message
      setContacts(prev => {
        const existingContact = prev.find(c => c.id === data.contactId);
        if (!existingContact) {
          // Create new contact if it doesn't exist
          const newContact = {
            id: data.contact?.id || data.contactId,
            name: data.contact?.name || data.contact?.phone || 'Unknown',
            phone: data.contact?.phone || 'Unknown',
            lastMessage: data.message.content,
            lastMessageTime: new Date(data.message.timestamp),
            unreadCount: data.contactId === selectedContactId ? 0 : 1,
            isOnline: data.contact?.isOnline || false,
            isTyping: false,
          };
          console.log('Creating new contact:', newContact);
          return [newContact, ...prev];
        } else {
          // Update existing contact
          return prev.map(contact => 
            contact.id === data.contactId
              ? {
                  ...contact,
                  lastMessage: data.message.content,
                  lastMessageTime: new Date(data.message.timestamp),
                  unreadCount: contact.id === selectedContactId ? 0 : contact.unreadCount + 1,
                }
              : contact
          );
        }
      });
      
      // Show notification for new messages
      if (data.contactId !== selectedContactId) {
        toast.success(`New message from ${data.contact?.name || 'Unknown'}`, {
          duration: 3000,
        });
      }
    };

    const handleTypingUpdate = (data: { contactId: string; isTyping: boolean }) => {
      setContacts(prev => prev.map(contact =>
        contact.id === data.contactId
          ? { ...contact, isTyping: data.isTyping }
          : contact
      ));
    };

    const handleOnlineStatus = (data: { contactId: string; isOnline: boolean }) => {
      setContacts(prev => prev.map(contact =>
        contact.id === data.contactId
          ? { ...contact, isOnline: data.isOnline }
          : contact
      ));
    };

    const handleSyncStatus = (data: any) => {
      console.log('Received sync status:', data);
      
      setSyncStatus({
        isActive: data.status !== 'completed' && data.status !== 'failed',
        status: data.status,
        totalChats: data.totalChats || 0,
        syncedChats: data.syncedChats || 0,
        currentChat: data.currentChat || '',
        error: data.error,
      });

      // Hide sync status after 5 seconds when completed
      if (data.status === 'completed') {
        setTimeout(() => setSyncStatus(null), 5000);
      }

      // Show notification for completion
      if (data.status === 'completed') {
        toast.success(`WhatsApp sync completed! ${data.syncedChats} conversations loaded`);
        // Reload conversations to show newly synced ones
        loadConversations();
      } else if (data.status === 'failed') {
        toast.error(`WhatsApp sync failed: ${data.error}`);
        setTimeout(() => setSyncStatus(null), 5000);
      }
    };

    console.log('Setting up WhatsApp WebSocket listeners');
    const unsubscribeNewMessage = subscribe('whatsapp:message', handleNewMessage);
    const unsubscribeTyping = subscribe('whatsapp:typing', handleTypingUpdate);
    const unsubscribeOnlineStatus = subscribe('whatsapp:online-status', handleOnlineStatus);
    const unsubscribeSyncStatus = subscribe('whatsapp:sync-status', handleSyncStatus);

    return () => {
      console.log('Cleaning up WhatsApp WebSocket listeners');
      unsubscribeNewMessage();
      unsubscribeTyping();
      unsubscribeOnlineStatus();
      unsubscribeSyncStatus();
    };
  }, [socket, subscribe, selectedContactId]);

  const handleSendMessage = async (content: string, type: 'text' | 'image' | 'audio' | 'file' | 'video') => {
    console.log('[FRONTEND] handleSendMessage called with:', { selectedContactId, content, type });
    
    if (!selectedContactId) {
      console.log('[FRONTEND] No selectedContactId, returning');
      return;
    }

    const newMessage = {
      id: `msg_${Date.now()}`,
      content,
      timestamp: new Date(),
      sender: 'user' as const, // Messages sent by us should be 'user' (right side)
      type,
      status: 'sending' as const,
    };

    console.log('[FRONTEND] Adding message to UI:', newMessage);
    // Add message to UI immediately and ensure proper ordering
    setMessages(prev => {
      const updated = [...prev, newMessage];
      // Sort messages by timestamp to ensure proper ordering
      return updated.sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
    });

    try {
      console.log('[FRONTEND] Calling API to send message...');
      // Send to real WhatsApp conversation
      const result = await api.sendWhatsAppConversationMessage(selectedContactId, content);
      console.log('[FRONTEND] API call successful:', result);
      
      // Update message status and maintain sorting
      setMessages(prev => {
        const updated = prev.map(msg =>
          msg.id === newMessage.id
            ? { ...msg, status: 'sent' }
            : msg
        );
        return updated.sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
      });

      // Update contact's last message
      setContacts(prev => prev.map(contact =>
        contact.id === selectedContactId
          ? {
              ...contact,
              lastMessage: content,
              lastMessageTime: new Date(),
            }
          : contact
      ));

      toast.success('Message sent');
    } catch (error) {
      console.error('[FRONTEND] Failed to send message:', error);
      toast.error('Failed to send message');
      
      // Update message status to failed and maintain sorting
      setMessages(prev => {
        const updated = prev.map(msg =>
          msg.id === newMessage.id
            ? { ...msg, status: 'failed' as any }
            : msg
        );
        return updated.sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());
      });
    }
  };

  const handleSelectContact = (contactId: string) => {
    setSelectedContactId(contactId);
  };

  const handleArchiveContact = (contactId: string) => {
    setContacts(prev => prev.filter(contact => contact.id !== contactId));
    if (selectedContactId === contactId) {
      setSelectedContactId(undefined);
      setMessages([]);
    }
    toast.success('Contact archived');
  };

  if (loadingConversations) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen relative">
      {/* WhatsApp Session Selector */}
      {whatsappSessions.length > 1 && (
        <div className="bg-gray-50 border-b border-gray-200 p-3">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700">WhatsApp Account:</span>
            <select 
              value={selectedSessionId} 
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {whatsappSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} ({session.status})
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              {whatsappSessions.length} account{whatsappSessions.length > 1 ? 's' : ''} connected
            </span>
          </div>
        </div>
      )}
      
      {/* No Sessions Warning */}
      {whatsappSessions.length === 0 && !loadingConversations && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-3">
          <div className="text-sm text-yellow-800">
            <strong>No WhatsApp accounts connected.</strong>{' '}
            <a href="/whatsapp" className="text-blue-600 hover:underline">
              Connect a WhatsApp account
            </a>{' '}
            to start viewing conversations.
          </div>
        </div>
      )}
      
      {/* Sync Status Banner */}
      {syncStatus && syncStatus.isActive && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-blue-600 text-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <div>
                <p className="font-medium">Synchronizing WhatsApp conversations...</p>
                <p className="text-sm opacity-90">
                  {syncStatus.status === 'started' 
                    ? `Found ${syncStatus.totalChats} conversations to sync`
                    : `${syncStatus.syncedChats}/${syncStatus.totalChats} conversations synced`
                  }
                  {syncStatus.currentChat && ` - Processing: ${syncStatus.currentChat}`}
                </p>
              </div>
            </div>
            <div className="text-sm">
              {syncStatus.totalChats > 0 && (
                <span>{Math.round((syncStatus.syncedChats / syncStatus.totalChats) * 100)}%</span>
              )}
            </div>
          </div>
          {syncStatus.totalChats > 0 && (
            <div className="mt-2 w-full bg-blue-500 rounded-full h-2">
              <div 
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${Math.round((syncStatus.syncedChats / syncStatus.totalChats) * 100)}%` }}
              ></div>
            </div>
          )}
        </div>
      )}
      
      <div className={syncStatus?.isActive ? 'mt-24' : ''}>
        <ConversationInterface
          contacts={contacts}
          selectedContactId={selectedContactId}
          messages={messages}
          onSendMessage={handleSendMessage}
          onSelectContact={handleSelectContact}
          onArchiveContact={handleArchiveContact}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}