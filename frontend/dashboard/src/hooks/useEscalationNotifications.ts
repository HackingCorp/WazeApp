'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { playEscalationSound } from '@/lib/notificationSound';
import { requestNotificationPermission, showBrowserNotification } from '@/lib/browserNotification';
import toast from 'react-hot-toast';

interface EscalationEvent {
  conversationId: string;
  agentId?: string;
  agentName?: string;
  clientPhoneNumber?: string;
  reason?: string;
  timestamp?: string;
}

export function useEscalationNotifications() {
  const { socket } = useSocket();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const permissionRequested = useRef(false);

  // Request browser notification permission once
  useEffect(() => {
    if (!permissionRequested.current) {
      permissionRequested.current = true;
      requestNotificationPermission();
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleEscalation = (data: EscalationEvent) => {
      const agentName = data.agentName || 'Agent IA';
      const reason = data.reason || 'Agent humain demandé';
      const title = `Escalade - ${agentName}`;
      const message = data.clientPhoneNumber
        ? `Client ${data.clientPhoneNumber}: ${reason}`
        : reason;

      // 1. Add to notification store (Header bell)
      addNotification({
        type: 'escalation',
        title,
        message,
        conversationId: data.conversationId,
        agentName,
      });

      // 2. Play alert sound
      playEscalationSound();

      // 3. Show toast
      toast.error(`${title}: ${reason}`, {
        duration: 8000,
        icon: '\u26A1',
      });

      // 4. Browser notification (works in background tabs)
      showBrowserNotification(title, message, () => {
        window.location.href = '/conversations';
      });
    };

    socket.on('conversation_escalated', handleEscalation);

    return () => {
      socket.off('conversation_escalated', handleEscalation);
    };
  }, [socket, addNotification]);
}
