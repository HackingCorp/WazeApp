'use client';

import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Wrench, Globe, ShoppingCart, Calendar, Package } from 'lucide-react';

interface ApiToolParam {
  type: string;
  description: string;
  enum?: string[];
}

interface ExternalApiTool {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  timeout?: number;
  parameters: {
    type: 'object';
    properties: Record<string, ApiToolParam>;
    required?: string[];
  };
}

interface ToolConfigPanelProps {
  ecommerceEnabled: boolean;
  appointmentsEnabled: boolean;
  apiTools: ExternalApiTool[];
  hasCatalogs: boolean;
  onUpdate: (updates: {
    ecommerceEnabled?: boolean;
    appointmentsEnabled?: boolean;
    apiTools?: ExternalApiTool[];
  }) => void;
}

const EMPTY_TOOL: ExternalApiTool = {
  name: '',
  description: '',
  url: '',
  method: 'GET',
  headers: {},
  timeout: 10000,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export default function ToolConfigPanel({
  ecommerceEnabled,
  appointmentsEnabled,
  apiTools,
  hasCatalogs,
  onUpdate,
}: ToolConfigPanelProps) {
  const [expandedTool, setExpandedTool] = useState<number | null>(null);
  const [newParamName, setNewParamName] = useState('');

  const addTool = () => {
    const toolName = `custom_tool_${apiTools.length + 1}`;
    onUpdate({
      apiTools: [...apiTools, { ...EMPTY_TOOL, name: toolName }],
    });
    setExpandedTool(apiTools.length);
  };

  const removeTool = (index: number) => {
    const updated = apiTools.filter((_, i) => i !== index);
    onUpdate({ apiTools: updated });
    if (expandedTool === index) setExpandedTool(null);
  };

  const updateTool = (index: number, updates: Partial<ExternalApiTool>) => {
    const updated = apiTools.map((tool, i) =>
      i === index ? { ...tool, ...updates } : tool
    );
    onUpdate({ apiTools: updated });
  };

  const addParameter = (toolIndex: number) => {
    if (!newParamName.trim()) return;
    const tool = apiTools[toolIndex];
    const updated = {
      ...tool,
      parameters: {
        ...tool.parameters,
        properties: {
          ...tool.parameters.properties,
          [newParamName.trim()]: { type: 'string', description: '' },
        },
      },
    };
    updateTool(toolIndex, updated);
    setNewParamName('');
  };

  const removeParameter = (toolIndex: number, paramName: string) => {
    const tool = apiTools[toolIndex];
    const { [paramName]: _, ...rest } = tool.parameters.properties;
    updateTool(toolIndex, {
      parameters: {
        ...tool.parameters,
        properties: rest,
        required: (tool.parameters.required || []).filter(r => r !== paramName),
      },
    });
  };

  const updateParameter = (toolIndex: number, paramName: string, updates: Partial<ApiToolParam>) => {
    const tool = apiTools[toolIndex];
    updateTool(toolIndex, {
      parameters: {
        ...tool.parameters,
        properties: {
          ...tool.parameters.properties,
          [paramName]: { ...tool.parameters.properties[paramName], ...updates },
        },
      },
    });
  };

  const toggleRequired = (toolIndex: number, paramName: string) => {
    const tool = apiTools[toolIndex];
    const required = tool.parameters.required || [];
    const updated = required.includes(paramName)
      ? required.filter(r => r !== paramName)
      : [...required, paramName];
    updateTool(toolIndex, {
      parameters: { ...tool.parameters, required: updated },
    });
  };

  const addHeader = (toolIndex: number) => {
    const tool = apiTools[toolIndex];
    updateTool(toolIndex, {
      headers: { ...tool.headers, '': '' },
    });
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

      {/* External API Tools Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="w-5 h-5" />
              APIs externes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connectez des APIs tierces que l'agent pourra appeler pendant les conversations.
            </p>
          </div>
          <button
            onClick={addTool}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Ajouter un outil
          </button>
        </div>

        {apiTools.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Aucun outil API externe configure</p>
            <p className="text-xs mt-1">Cliquez sur "Ajouter un outil" pour commencer</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiTools.map((tool, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Tool Header */}
                <div
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 cursor-pointer"
                  onClick={() => setExpandedTool(expandedTool === index ? null : index)}
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 text-xs font-mono font-bold rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {tool.method}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {tool.name || 'Nouvel outil'}
                    </span>
                    {tool.description && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[300px]">
                        - {tool.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTool(index); }}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {expandedTool === index ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Tool Details (expanded) */}
                {expandedTool === index && (
                  <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {/* Name & Description */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Nom (identifiant)
                        </label>
                        <input
                          type="text"
                          value={tool.name}
                          onChange={(e) => updateTool(index, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
                          placeholder="get_weather"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description (pour l'IA)
                        </label>
                        <input
                          type="text"
                          value={tool.description}
                          onChange={(e) => updateTool(index, { description: e.target.value })}
                          placeholder="Obtenir la meteo d'une ville"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>

                    {/* URL & Method */}
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Methode
                        </label>
                        <select
                          value={tool.method}
                          onChange={(e) => updateTool(index, { method: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          URL de l'API
                        </label>
                        <input
                          type="text"
                          value={tool.url}
                          onChange={(e) => updateTool(index, { url: e.target.value })}
                          placeholder="https://api.example.com/endpoint"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
                        />
                      </div>
                    </div>

                    {/* Headers */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Headers
                        </label>
                        <button
                          onClick={() => addHeader(index)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          + Ajouter un header
                        </button>
                      </div>
                      {tool.headers && Object.entries(tool.headers).map(([key, value], hIdx) => (
                        <div key={hIdx} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={key}
                            onChange={(e) => {
                              const entries = Object.entries(tool.headers || {});
                              entries[hIdx] = [e.target.value, value];
                              updateTool(index, { headers: Object.fromEntries(entries) });
                            }}
                            placeholder="Authorization"
                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
                          />
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              const entries = Object.entries(tool.headers || {});
                              entries[hIdx] = [key, e.target.value];
                              updateTool(index, { headers: Object.fromEntries(entries) });
                            }}
                            placeholder="Bearer token..."
                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
                          />
                          <button
                            onClick={() => {
                              const entries = Object.entries(tool.headers || {}).filter((_, i) => i !== hIdx);
                              updateTool(index, { headers: Object.fromEntries(entries) });
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Parameters */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Parametres
                      </label>
                      {Object.entries(tool.parameters.properties).map(([paramName, param]) => (
                        <div key={paramName} className="flex items-start gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <div className="flex-shrink-0 w-32">
                            <span className="text-sm font-mono text-gray-900 dark:text-white">{paramName}</span>
                            <div className="flex items-center gap-1 mt-1">
                              <input
                                type="checkbox"
                                checked={(tool.parameters.required || []).includes(paramName)}
                                onChange={() => toggleRequired(index, paramName)}
                                className="rounded text-blue-600"
                              />
                              <span className="text-xs text-gray-500">Requis</span>
                            </div>
                          </div>
                          <select
                            value={param.type}
                            onChange={(e) => updateParameter(index, paramName, { type: e.target.value })}
                            className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm"
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                          </select>
                          <input
                            type="text"
                            value={param.description}
                            onChange={(e) => updateParameter(index, paramName, { description: e.target.value })}
                            placeholder="Description du parametre"
                            className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm"
                          />
                          <button
                            onClick={() => removeParameter(index, paramName)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded mt-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={newParamName}
                          onChange={(e) => setNewParamName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))}
                          onKeyDown={(e) => e.key === 'Enter' && addParameter(index)}
                          placeholder="nom_du_parametre"
                          className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm font-mono"
                        />
                        <button
                          onClick={() => addParameter(index)}
                          className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>

                    {/* Timeout */}
                    <div className="w-48">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Timeout (ms)
                      </label>
                      <input
                        type="number"
                        value={tool.timeout || 10000}
                        onChange={(e) => updateTool(index, { timeout: Math.min(30000, Math.max(1000, Number(e.target.value))) })}
                        min={1000}
                        max={30000}
                        step={1000}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
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
