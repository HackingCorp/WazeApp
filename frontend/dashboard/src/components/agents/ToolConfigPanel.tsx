'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Wrench, Globe, ShoppingCart, Calendar, Package, Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface DiscoveredTool {
  name: string;
  description: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  enabled: boolean;
}

interface ApiConnection {
  apiKey?: string;
  authType: 'bearer' | 'api-key-header' | 'query-param' | 'basic' | 'none';
  authHeaderName?: string;
  authQueryParam?: string;
  baseUrl: string;
  tools: DiscoveredTool[];
}

interface ToolConfigPanelProps {
  ecommerceEnabled: boolean;
  appointmentsEnabled: boolean;
  apiTools: ApiConnection[];
  hasCatalogs: boolean;
  onUpdate: (updates: {
    ecommerceEnabled?: boolean;
    appointmentsEnabled?: boolean;
    apiTools?: ApiConnection[];
  }) => void;
}

const AUTH_TYPES = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api-key-header', label: 'API Key (Header)' },
  { value: 'query-param', label: 'API Key (Query Param)' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'none', label: 'Aucune' },
] as const;

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  PATCH: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export default function ToolConfigPanel({
  ecommerceEnabled,
  appointmentsEnabled,
  apiTools,
  hasCatalogs,
  onUpdate,
}: ToolConfigPanelProps) {
  const [discovering, setDiscovering] = useState<number | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const addConnection = () => {
    const newConnection: ApiConnection = {
      baseUrl: '',
      apiKey: '',
      authType: 'bearer',
      tools: [],
    };
    onUpdate({ apiTools: [...apiTools, newConnection] });
  };

  const removeConnection = (index: number) => {
    onUpdate({ apiTools: apiTools.filter((_, i) => i !== index) });
  };

  const updateConnection = (index: number, updates: Partial<ApiConnection>) => {
    const updated = apiTools.map((conn, i) =>
      i === index ? { ...conn, ...updates } : conn,
    );
    onUpdate({ apiTools: updated });
  };

  const toggleTool = (connIndex: number, toolIndex: number) => {
    const conn = apiTools[connIndex];
    const updatedTools = conn.tools.map((tool, i) =>
      i === toolIndex ? { ...tool, enabled: !tool.enabled } : tool,
    );
    updateConnection(connIndex, { tools: updatedTools });
  };

  const discoverEndpoints = async (index: number) => {
    const conn = apiTools[index];
    if (!conn.baseUrl) {
      setDiscoveryError('Veuillez entrer l\'URL de l\'API');
      return;
    }

    setDiscovering(index);
    setDiscoveryError(null);

    try {
      const response = await api.post('/tools/discover', {
        baseUrl: conn.baseUrl,
        apiKey: conn.apiKey || undefined,
        authType: conn.authType,
        authHeaderName: conn.authHeaderName || undefined,
      });

      if (response.success && response.data?.tools) {
        updateConnection(index, { tools: response.data.tools });
      } else {
        setDiscoveryError(response.error || 'Aucun endpoint trouve');
      }
    } catch (err: any) {
      setDiscoveryError(err.message || 'Erreur lors de la decouverte');
    } finally {
      setDiscovering(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Internal Tools Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          Outils internes
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Activez les outils internes pour permettre a l'agent d'acceder aux donnees de votre plateforme.
        </p>

        <div className="space-y-3">
          {/* Product Tools */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-blue-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Produits & Catalogue</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Recherche de produits, details, prix et disponibilite
                  {!hasCatalogs && ecommerceEnabled && (
                    <span className="text-amber-500 ml-1">(aucun catalogue lie)</span>
                  )}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={ecommerceEnabled}
                onChange={(e) => onUpdate({ ecommerceEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Order Tools */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Commandes</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Creation de commandes, suivi de statut, historique client
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={ecommerceEnabled}
                onChange={(e) => onUpdate({ ecommerceEnabled: e.target.checked })}
                className="sr-only peer"
                disabled
              />
              <div className={`w-11 h-6 rounded-full ${ecommerceEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'} cursor-not-allowed opacity-60 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${ecommerceEnabled ? 'after:translate-x-full' : ''}`}></div>
            </label>
          </div>

          {/* Appointment Tools */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-purple-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Rendez-vous</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Prise de rendez-vous, consultation des disponibilites
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={appointmentsEnabled}
                onChange={(e) => onUpdate({ appointmentsEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-gray-500 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* External API Connections Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="w-5 h-5" />
              APIs externes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connectez des APIs tierces — entrez l'URL et la cle, les endpoints sont decouverts automatiquement.
            </p>
          </div>
          <button
            onClick={addConnection}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Connecter une API
          </button>
        </div>

        {discoveryError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {discoveryError}
          </div>
        )}

        {apiTools.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Aucune API externe connectee</p>
            <p className="text-xs mt-1">Cliquez sur "Connecter une API" pour commencer</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiTools.map((conn, connIndex) => (
              <div
                key={connIndex}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Connection Config */}
                <div className="p-4 space-y-3 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Connexion API #{connIndex + 1}
                    </span>
                    <button
                      onClick={() => removeConnection(connIndex)}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL de l'API
                    </label>
                    <input
                      type="text"
                      value={conn.baseUrl}
                      onChange={(e) => updateConnection(connIndex, { baseUrl: e.target.value })}
                      placeholder="https://api.example.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                    />
                  </div>

                  {/* API Key + Auth Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Cle API
                      </label>
                      <input
                        type="password"
                        value={conn.apiKey || ''}
                        onChange={(e) => updateConnection(connIndex, { apiKey: e.target.value })}
                        placeholder="sk-xxxxxxxx..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Authentification
                      </label>
                      <select
                        value={conn.authType}
                        onChange={(e) => updateConnection(connIndex, { authType: e.target.value as ApiConnection['authType'] })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                      >
                        {AUTH_TYPES.map((at) => (
                          <option key={at.value} value={at.value}>{at.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Custom header name for api-key-header type */}
                  {conn.authType === 'api-key-header' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nom du header
                      </label>
                      <input
                        type="text"
                        value={conn.authHeaderName || ''}
                        onChange={(e) => updateConnection(connIndex, { authHeaderName: e.target.value })}
                        placeholder="X-API-Key"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Custom query param name for query-param type */}
                  {conn.authType === 'query-param' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nom du parametre
                      </label>
                      <input
                        type="text"
                        value={conn.authQueryParam || ''}
                        onChange={(e) => updateConnection(connIndex, { authQueryParam: e.target.value })}
                        placeholder="api_key"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Discover Button */}
                  <button
                    onClick={() => discoverEndpoints(connIndex)}
                    disabled={discovering === connIndex || !conn.baseUrl}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {discovering === connIndex ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Decouverte en cours...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Decouvrir les endpoints
                      </>
                    )}
                  </button>
                </div>

                {/* Discovered Tools */}
                {conn.tools.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700">
                    <div className="p-3 bg-white dark:bg-gray-900">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {conn.tools.filter(t => t.enabled).length}/{conn.tools.length} endpoints actives
                      </p>
                      <div className="space-y-1">
                        {conn.tools.map((tool, toolIndex) => (
                          <label
                            key={toolIndex}
                            className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={tool.enabled}
                              onChange={() => toggleTool(connIndex, toolIndex)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${METHOD_COLORS[tool.method] || 'bg-gray-100 text-gray-700'}`}>
                              {tool.method}
                            </span>
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                              {tool.path}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              — {tool.description}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
