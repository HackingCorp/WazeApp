'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthProvider';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback?: (data: any) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, token, refreshToken } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isRefreshingToken = useRef(false);

  useEffect(() => {
    if (!user || !token) return;

    const connectSocket = () => {
      console.log('Connecting to WhatsApp WebSocket...');
      
      // Connect to the /whatsapp namespace (must match backend gateway)
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3100';
      const newSocket = io(`${socketUrl}/whatsapp`, {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: maxReconnectAttempts,
      });

      // Connection events
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        isRefreshingToken.current = false; // Reset refresh flag on successful connection
        
        // User is now connected to their personal WhatsApp room
        
        toast.success('Real-time connection established', {
          id: 'socket-connected',
          duration: 2000,
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server disconnected due to JWT expiry, try token refresh first
          if (!isRefreshingToken.current) {
            console.log('Server disconnect detected, attempting token refresh...');
            handleTokenRefreshAndReconnect(newSocket);
          }
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
        
        // If error is JWT related or during authentication, try to refresh token
        if (error.message && (error.message.includes('jwt') || error.message.includes('auth'))) {
          if (!isRefreshingToken.current) {
            console.log('JWT/Auth error detected, attempting token refresh...');
            handleTokenRefreshAndReconnect(newSocket);
          }
          return;
        }
        
        reconnectAttemptsRef.current++;
        
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          toast.error('Unable to establish real-time connection', {
            id: 'socket-error',
          });
        }
      });

      const handleTokenRefreshAndReconnect = async (socketInstance: Socket) => {
        if (isRefreshingToken.current) {
          console.log('Token refresh already in progress, skipping...');
          return;
        }

        isRefreshingToken.current = true;
        
        try {
          console.log('Refreshing token for WebSocket connection...');
          await refreshToken?.();
          console.log('Token refreshed successfully, socket will reconnect with new token');
          
          // The useEffect will handle reconnection when token updates
          
        } catch (error) {
          console.error('Token refresh failed:', error);
          isRefreshingToken.current = false;
          toast.error('Session expired, please refresh the page', {
            id: 'session-expired',
          });
        }
      };

      // Real-time event handlers
      newSocket.on('message:received', (data) => {
        toast.success(`New message from ${data.from}`, {
          duration: 4000,
        });
      });

      // WhatsApp specific events
      newSocket.on('whatsapp:message', (data) => {
        console.log('WhatsApp message received:', data);
        // This will be handled by conversation components
      });

      newSocket.on('whatsapp:message-sent', (data) => {
        console.log('WhatsApp message sent:', data);
        // This will be handled by conversation components
      });

      newSocket.on('whatsapp:session-status', (data) => {
        console.log('WhatsApp session status:', data);
        // This will be handled by WhatsApp settings components
      });

      newSocket.on('whatsapp:typing', (data) => {
        console.log('WhatsApp typing indicator:', data);
        // This will be handled by conversation components
      });

      newSocket.on('whatsapp:online-status', (data) => {
        console.log('WhatsApp contact online status:', data);
        // This will be handled by conversation components
      });

      newSocket.on('agent:status', (data) => {
        if (data.status === 'offline') {
          toast.error(`Agent "${data.name}" is offline`, {
            duration: 3000,
          });
        } else if (data.status === 'online') {
          toast.success(`Agent "${data.name}" is back online`, {
            duration: 3000,
          });
        }
      });

      newSocket.on('conversation:updated', (data) => {
        // This will be handled by specific components
        console.log('Conversation updated:', data);
      });

      newSocket.on('analytics:updated', (data) => {
        // This will be handled by analytics components
        console.log('Analytics updated:', data);
      });

      newSocket.on('notification', (data) => {
        toast(data.message, {
          duration: data.duration || 4000,
          icon: data.icon || '📢',
        });
      });

      setSocket(newSocket);
    };

    connectSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Reset refresh flag when cleaning up
      isRefreshingToken.current = false;
    };
  }, [user, token, refreshToken]);

  const emit = (event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (!socket) {
      console.warn('Socket not available for subscription:', event);
      return () => {};
    }

    socket.on(event, callback);

    return () => {
      socket.off(event, callback);
    };
  };

  const on = (event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback);
    }
  };

  const off = (event: string, callback?: (data: any) => void) => {
    if (socket) {
      socket.off(event, callback);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        emit,
        subscribe,
        on,
        off,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}