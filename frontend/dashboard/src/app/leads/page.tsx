'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Target,
  Flame,
  CloudSun,
  Snowflake,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';

interface Lead {
  id: string;
  clientName?: string;
  clientEmail?: string;
  clientPhoneNumber: string;
  status: 'new' | 'cold' | 'warm' | 'hot' | 'customer' | 'lost';
  score: number;
  interest?: string;
  needSummary?: string;
  signals?: Record<string, any>;
  tags?: string[];
  lastInteractionAt?: string;
  createdAt: string;
}

interface LeadStats {
  total: number;
  cold: number;
  warm: number;
  hot: number;
  customer: number;
  lost: number;
}

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', label: 'Nouveau' },
  cold: { bg: 'bg-sky-100 dark:bg-sky-900', text: 'text-sky-800 dark:text-sky-200', label: 'Froid' },
  warm: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200', label: 'Tiède' },
  hot: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200', label: 'Chaud' },
  customer: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', label: 'Client' },
  lost: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'Perdu' },
};

const FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'hot', label: '🔥 Chauds' },
  { key: 'warm', label: '🌤️ Tièdes' },
  { key: 'cold', label: '❄️ Froids' },
  { key: 'customer', label: '✅ Clients' },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getLeads({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      });
      if (response.success && response.data) {
        const data: any = response.data.data || response.data;
        setLeads(Array.isArray(data) ? data : data.leads || []);
        const total = data.total || 0;
        setTotalPages(data.totalPages || Math.ceil(total / limit) || 1);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error fetching leads:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.getLeadStats();
      if (response.success && response.data) {
        setStats((response.data as any).data || response.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error fetching lead stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleStatusChange = async (id: string, status: string) => {
    await api.updateLeadStatus(id, status);
    fetchLeads();
    fetchStats();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce lead ?')) return;
    await api.deleteLead(id);
    fetchLeads();
    fetchStats();
  };

  const statCards = [
    { label: 'Total', value: stats?.total ?? 0, icon: Target, color: 'text-gray-500' },
    { label: 'Chauds', value: stats?.hot ?? 0, icon: Flame, color: 'text-red-500' },
    { label: 'Tièdes', value: stats?.warm ?? 0, icon: CloudSun, color: 'text-amber-500' },
    { label: 'Froids', value: stats?.cold ?? 0, icon: Snowflake, color: 'text-sky-500' },
    { label: 'Clients', value: stats?.customer ?? 0, icon: CheckCircle2, color: 'text-green-500' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Target className="w-6 h-6 text-green-600" /> Leads
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Prospects qualifiés automatiquement par vos agents IA
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span>
              <s.icon className={clsx('w-4 h-4', s.color)} />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un lead (nom, téléphone, intérêt)…"
            value={searchQuery}
            onChange={(e) => {
              setPage(1);
              setSearchQuery(e.target.value);
            }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setPage(1);
                setStatusFilter(f.key);
              }}
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-medium border transition',
                statusFilter === f.key
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16">
          <Target className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Aucun lead pour le moment.</p>
          <p className="text-sm text-gray-400 mt-1">
            Activez la qualification des leads dans la configuration de l&apos;agent.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const meta = STATUS_META[lead.status] || STATUS_META.new;
            return (
              <div
                key={lead.id}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {lead.clientName || `+${lead.clientPhoneNumber}`}
                    </span>
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', meta.bg, meta.text)}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-gray-400">Score {lead.score}/100</span>
                  </div>
                  {lead.clientName && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">+{lead.clientPhoneNumber}</div>
                  )}
                  {(lead.needSummary || lead.interest) && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {lead.needSummary || lead.interest}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={lead.status}
                    onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                    className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                  >
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(lead.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
