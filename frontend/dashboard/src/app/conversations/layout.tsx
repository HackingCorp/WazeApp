'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}