'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/providers/I18nProvider';
import { useAuth } from '@/providers/AuthProvider';
import api from '@/lib/api';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  ExternalLink,
  Shield,
  Clock,
  Activity,
  Lock,
  Unlock,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  lastUsedAt?: string;
  lastUsedIp?: string;
  totalRequests: number;
  allowedIps?: string[];
  createdAt: string;
}

const PERMISSIONS = [
  { value: 'send:message', label: 'Send Messages', description: 'Send WhatsApp messages' },
  { value: 'contacts:read', label: 'Read Contacts', description: 'View contact list' },
  { value: 'contacts:write', label: 'Write Contacts', description: 'Create/update contacts' },
  { value: 'templates:read', label: 'Read Templates', description: 'View message templates' },
  { value: 'templates:write', label: 'Write Templates', description: 'Create/update templates' },
  { value: 'campaigns:read', label: 'Read Campaigns', description: 'View campaigns' },
  { value: 'campaigns:write', label: 'Write Campaigns', description: 'Create/manage campaigns' },
  { value: 'webhooks:manage', label: 'Manage Webhooks', description: 'Configure webhooks' },
  { value: 'broadcast:read', label: 'Broadcast Read', description: 'Read all broadcast data' },
  { value: 'broadcast:write', label: 'Broadcast Write', description: 'Write all broadcast data' },
];

export default function ApiKeysPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [canUseApi, setCanUseApi] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
    expiresAt: '',
    allowedIps: '',
    rateLimitPerMinute: 60,
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    checkApiAccess();
  }, []);

  const checkApiAccess = async () => {
    try {
      const response = await api.checkApiAccess();
      console.log('API Access Response:', response);

      // Backend returns { canUseApi: boolean } which gets wrapped by TransformInterceptor
      // API client extracts data.data, so response.data = { canUseApi: boolean }
      if (response.success && response.data?.canUseApi === true) {
        setCanUseApi(true);
        fetchApiKeys();
      } else {
        setCanUseApi(false);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking API access:', error);
      setCanUseApi(false);
      setLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const response = await api.getBroadcastApiKeys();
      if (response.success) {
        setApiKeys(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    try {
      const response = await api.createBroadcastApiKey({
        name: newKeyData.name,
        permissions: newKeyData.permissions,
        expiresAt: newKeyData.expiresAt || undefined,
        ipWhitelist: newKeyData.allowedIps ? newKeyData.allowedIps.split(',').map(ip => ip.trim()) : undefined,
        rateLimitPerMinute: newKeyData.rateLimitPerMinute,
      });

      if (response.success && response.data?.key) {
        setCreatedKey(response.data.key);
        fetchApiKeys();
      }
    } catch (error) {
      console.error('Error creating API key:', error);
    }
  };

  const handleToggleKey = async (id: string, isActive: boolean) => {
    try {
      await api.toggleBroadcastApiKey(id, !isActive);
      fetchApiKeys();
    } catch (error) {
      console.error('Error toggling API key:', error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await api.deleteBroadcastApiKey(id);
      setDeleteConfirm(null);
      fetchApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Show upgrade message if user doesn't have API access
  if (!loading && !canUseApi) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-8 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-800/30 rounded-xl">
              <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Accès API non disponible
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                L'accès à l'API externe est réservé aux plans <strong>Pro</strong> et <strong>Enterprise</strong>.
                Mettez à niveau votre plan pour générer des clés API et accéder à notre API REST.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/billing"
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Mettre à niveau
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Link>
                <a
                  href="https://api.wazeapp.xyz/api/v1/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Voir la documentation
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Key className="w-7 h-7 text-green-600" />
            Clés API
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gérez vos clés API pour accéder à l'API externe WazeApp
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="https://api.wazeapp.xyz/api/v1/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Documentation
          </a>
          <button
            onClick={() => {
              setNewKeyData({ name: '', description: '', permissions: [], expiresAt: '', allowedIps: '', rateLimitPerMinute: 60 });
              setCreatedKey(null);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer une clé API
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && apiKeys.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Key className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Aucune clé API
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Créez votre première clé API pour accéder à l'API externe
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer une clé API
          </button>
        </div>
      )}

      {/* API Keys List */}
      {!loading && apiKeys.length > 0 && (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border ${
                key.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
              } p-6`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {key.name}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      key.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {key.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                    <code className="px-2 py-1 bg-gray-100 dark:bg-gray-900 rounded font-mono">
                      {key.keyPrefix}••••••••••••
                    </code>
                    {key.description && (
                      <span className="ml-2">{key.description}</span>
                    )}
                  </div>

                  {/* Permissions */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {key.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Activity className="w-4 h-4" />
                      <span>{key.totalRequests.toLocaleString()} requêtes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>Dernière utilisation: {formatDate(key.lastUsedAt)}</span>
                    </div>
                    {key.expiresAt && (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Expire le {formatDate(key.expiresAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleKey(key.id, key.isActive)}
                    className={`p-2 rounded-lg transition-colors ${
                      key.isActive
                        ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                    title={key.isActive ? 'Désactiver' : 'Activer'}
                  >
                    {key.isActive ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(key.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirm === key.id && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                    Êtes-vous sûr de vouloir supprimer cette clé API ? Cette action est irréversible.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {createdKey ? (
                // Show created key
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <Check className="w-6 h-6 text-green-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      Clé API créée avec succès
                    </h2>
                  </div>

                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Copiez cette clé maintenant. Elle ne sera plus affichée.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <code className="block w-full p-4 bg-gray-100 dark:bg-gray-900 rounded-lg font-mono text-sm break-all">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(createdKey)}
                      className="absolute right-2 top-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {copiedKey ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedKey(null);
                    }}
                    className="w-full mt-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Terminé
                  </button>
                </div>
              ) : (
                // Create form
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                    Créer une clé API
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nom *
                      </label>
                      <input
                        type="text"
                        value={newKeyData.name}
                        onChange={(e) => setNewKeyData({ ...newKeyData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Ma clé API"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={newKeyData.description}
                        onChange={(e) => setNewKeyData({ ...newKeyData, description: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Description optionnelle"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Permissions *
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                        {PERMISSIONS.map((perm) => (
                          <label
                            key={perm.value}
                            className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={newKeyData.permissions.includes(perm.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewKeyData({
                                    ...newKeyData,
                                    permissions: [...newKeyData.permissions, perm.value],
                                  });
                                } else {
                                  setNewKeyData({
                                    ...newKeyData,
                                    permissions: newKeyData.permissions.filter((p) => p !== perm.value),
                                  });
                                }
                              }}
                              className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {perm.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {perm.description}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Date d'expiration (optionnel)
                      </label>
                      <input
                        type="date"
                        value={newKeyData.expiresAt}
                        onChange={(e) => setNewKeyData({ ...newKeyData, expiresAt: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        IPs autorisées (optionnel)
                      </label>
                      <input
                        type="text"
                        value={newKeyData.allowedIps}
                        onChange={(e) => setNewKeyData({ ...newKeyData, allowedIps: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="192.168.1.1, 10.0.0.1"
                      />
                      <p className="text-xs text-gray-500 mt-1">Séparez les IPs par des virgules</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Limite de requêtes par minute
                      </label>
                      <input
                        type="number"
                        value={newKeyData.rateLimitPerMinute}
                        onChange={(e) => setNewKeyData({ ...newKeyData, rateLimitPerMinute: parseInt(e.target.value) || 60 })}
                        min="1"
                        max="1000"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleCreateKey}
                      disabled={!newKeyData.name || newKeyData.permissions.length === 0}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
