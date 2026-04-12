'use client';

import { useEscalationNotifications } from '@/hooks/useEscalationNotifications';

export function EscalationListener() {
  useEscalationNotifications();
  return null;
}
