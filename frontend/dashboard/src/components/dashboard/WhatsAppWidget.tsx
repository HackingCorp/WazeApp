'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  MessageSquare, 
  AlertCircle,
  Plus,
  ArrowRight,
  CheckCircle,
  Clock
} from 'lucide-react';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';

interface WhatsAppSession {
  id: string;
  name: string;
  phoneNumber?: string;
  status: 'disconnected' | 'connecting' | 'connected';
  isConnected: boolean;
  lastSeenAt?: string;
  messagesCount?: number;
}

interface WhatsAppWidgetProps {
  className?: string;
}

export function WhatsAppWidget({ className = '' }: WhatsAppWidgetProps) {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSessions: 0,
    connectedSessions: 0,
    messagesThisMonth: 0,
    uptimePercentage: 0
  });

  useEffect(() => {
    fetchWhatsAppData(true); // Afficher les erreurs pour le premier chargement
    
    // Refresh data every 30 seconds (sans afficher les erreurs pour éviter le spam)
    const interval = setInterval(() => fetchWhatsAppData(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchWhatsAppData = async (showErrorToUser = false) => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp/sessions');
      
      // Vérifier si l'API retourne une erreur
      if (!response.success) {
        throw new Error(response.error || 'Erreur lors de la récupération des sessions');
      }
      
      const sessionData = response.data?.data || [];
      setSessions(sessionData);

      // Calculate stats
      const connectedCount = sessionData.filter((s: WhatsAppSession) => s.isConnected).length;
      let totalMessages = 0;
      let failedStatsCount = 0;
      
      // Fetch stats for each session (in a real app, this would be a batch endpoint)
      for (const session of sessionData) {
        try {
          const statsResponse = await api.get(`/whatsapp/sessions/${session.id}/stats`);
          if (statsResponse.success) {
            totalMessages += statsResponse.data.messagesReceivedThisMonth || 0;
          } else {
            failedStatsCount++;
          }
        } catch (error) {
          console.error(`Error fetching stats for session ${session.id}:`, error);
          failedStatsCount++;
        }
      }
      
      // Notifier l'utilisateur si certaines statistiques n'ont pas pu être chargées
      if (failedStatsCount > 0 && showErrorToUser) {
        console.warn(`Could not load statistics for ${failedStatsCount} session(s)`);
      }

      setStats({
        totalSessions: sessionData.length,
        connectedSessions: connectedCount,
        messagesThisMonth: totalMessages,
        uptimePercentage: sessionData.length > 0 ? Math.round((connectedCount / sessionData.length) * 100) : 0
      });
    } catch (error: any) {
      console.error('Error fetching WhatsApp data:', error);
      
      if (showErrorToUser) {
        // Messages d'erreur améliorés pour l'utilisateur
        const errorMessage = getWhatsAppErrorMessage(error?.message || error?.response?.data?.error);
        console.error('WhatsApp service error:', errorMessage);
      }
      
      // En cas d'erreur, initialiser avec des valeurs vides pour éviter les erreurs d'interface
      setSessions([]);
      setStats({
        totalSessions: 0,
        connectedSessions: 0,
        messagesThisMonth: 0,
        uptimePercentage: 0
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Fonction utilitaire pour les messages d'erreur
  const getWhatsAppErrorMessage = (error: string | undefined): string => {
    if (!error) return 'Service WhatsApp temporairement indisponible';
    
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('network') || errorLower.includes('connection')) {
      return 'Problème de connexion au service WhatsApp';
    }
    if (errorLower.includes('unauthorized') || errorLower.includes('authentication')) {
      return 'Erreur d\'authentification WhatsApp';
    }
    if (errorLower.includes('timeout')) {
      return 'Délai d\'attente dépassé pour le service WhatsApp';
    }
    
    return 'Service WhatsApp temporairement indisponible';
  };

  const getStatusIcon = (session: WhatsAppSession) => {
    if (session.isConnected) {
      return <Wifi className="w-4 h-4 text-green-600" />;
    } else if (session.status === 'connecting') {
      return <RefreshCw className="w-4 h-4 text-yellow-600 animate-spin" />;
    } else {
      return <WifiOff className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusColor = (session: WhatsAppSession) => {
    if (session.isConnected) return 'bg-green-100 text-green-800';
    if (session.status === 'connecting') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 ${className}`}>
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
            <Smartphone className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              WhatsApp Connections
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {stats.connectedSessions} of {stats.totalSessions} connected
            </p>
          </div>
        </div>
        
        <Link
          href="/dashboard/whatsapp"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center space-x-1"
        >
          <span>Manage</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* No Sessions State */}
      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-gray-400" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Aucun WhatsApp Connecté
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Connectez votre compte WhatsApp pour commencer à recevoir des messages
          </p>
          <Link
            href="/dashboard/whatsapp"
            className="inline-flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Connecter WhatsApp</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {stats.messagesThisMonth}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Messages This Month
              </div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {stats.uptimePercentage}%
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Uptime
              </div>
            </div>
          </div>

          {/* Sessions List */}
          <div className="space-y-3">
            {sessions.slice(0, 3).map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(session)}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {session.name}
                    </h4>
                    {session.phoneNumber && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {session.phoneNumber}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {session.lastSeenAt && session.isConnected && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Active
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session)}`}>
                    {session.status === 'connected' ? 'Online' : 
                     session.status === 'connecting' ? 'Connecting' : 'Offline'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Show More Link */}
          {sessions.length > 3 && (
            <Link
              href="/dashboard/whatsapp"
              className="block text-center text-sm text-blue-600 hover:text-blue-700 font-medium mt-4 pt-4 border-t border-gray-200 dark:border-gray-600"
            >
              View all {sessions.length} connections
            </Link>
          )}

          {/* Connection Status Summary */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Status Overview
              </span>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">{stats.connectedSessions}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-gray-600 dark:text-gray-400">{stats.totalSessions - stats.connectedSessions}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action */}
          {stats.connectedSessions === 0 && stats.totalSessions > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800 dark:text-yellow-200">
                  Aucune connexion active
                </span>
              </div>
              <Link
                href="/dashboard/whatsapp"
                className="text-sm text-yellow-600 hover:text-yellow-700 font-medium mt-2 block"
              >
                Reconnectez vos comptes WhatsApp →
              </Link>
            </div>
          )}
          
          {/* Service Error Warning */}
          {stats.totalSessions === 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-800 dark:text-red-200">
                  Service WhatsApp indisponible
                </span>
              </div>
              <button
                onClick={() => fetchWhatsAppData(true)}
                className="text-sm text-red-600 hover:text-red-700 font-medium mt-2 block"
              >
                Réessayer →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}