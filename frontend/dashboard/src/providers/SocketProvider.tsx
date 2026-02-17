'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthProvider';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  on: (event: string, callback: (data: any) => void) => () => void;
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
  const socketRef = useRef<Socket | null>(null);
  const maxReconnectAttempts = 5;
  const isRefreshingToken = useRef(false);

  useEffect(() => {
    if (!user || !token) return;

    const connectSocket = () => {
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
        setIsConnected(false);

        if (reason === 'io server disconnect') {
          // Server disconnected due to JWT expiry, try token refresh first
          if (!isRefreshingToken.current) {
            handleTokenRefreshAndReconnect(newSocket);
          }
        }
      });

      newSocket.on('connect_error', (error) => {
        setIsConnected(false);

        // If error is JWT related or during authentication, try to refresh token
        if (error.message && (error.message.includes('jwt') || error.message.includes('auth'))) {
          if (!isRefreshingToken.current) {
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
          return;
        }

        isRefreshingToken.current = true;

        try {
          await refreshToken?.();
          // The useEffect will handle reconnection when token updates
        } catch (error) {
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

      newSocket.on('notification', (data) => {
        toast(data.message, {
          duration: data.duration || 4000,
          icon: data.icon || '📢',
        });
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      isRefreshingToken.current = false;
    };
  }, [user, token, refreshToken]);

  const emit = (event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  };

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (!socket) {
      return () => {};
    }

    socket.on(event, callback);

    return () => {
      socket.off(event, callback);
    };
  };

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (socket) {
      socket.on(event, callback);
      return () => { socket.off(event, callback); };
    }
    return () => {};
  }, [socket]);

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