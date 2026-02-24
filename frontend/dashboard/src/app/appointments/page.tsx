'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  List,
  Settings,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  description?: string;
  agentId?: string;
  createdAt: string;
}

interface AppointmentStats {
  totalAppointments: number;
  upcoming: number;
  completedToday: number;
}

interface BusinessHour {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  breakStart?: string;
  breakEnd?: string;
  slotDuration: number;
}

interface DayOff {
  id: string;
  date: string;
  reason?: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
}

export default function AppointmentsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'availability'>('list');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('appointments.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {t('appointments.subtitle')}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm mb-6 w-fit">
          <button
            onClick={() => setActiveTab('list')}
            className={clsx(
              'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === 'list'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <List className="w-4 h-4 mr-2" />
            {t('appointments.list')}
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={clsx(
              'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === 'calendar'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            {t('appointments.calendar')}
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={clsx(
              'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === 'availability'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <Settings className="w-4 h-4 mr-2" />
            {t('appointments.availability')}
          </button>
        </div>

        {activeTab === 'list' && <AppointmentList />}
        {activeTab === 'calendar' && <AppointmentCalendar />}
        {activeTab === 'availability' && <AvailabilitySettings />}
      </div>
    </div>
  );
}

// ==========================================
// Tab 1: Appointment List
// ==========================================
function AppointmentList() {
  const { t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const limit = 20;

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getAppointments({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      });
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setAppointments(Array.isArray(data) ? data : data.items || []);
        const total = data.total || data.length || 0;
        setTotalPages(Math.ceil(total / limit) || 1);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching appointments:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.getAppointmentStats();
      if (response.success && response.data) {
        setStats(response.data.data || response.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching appointment stats:', error);
      }
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleStatusUpdate = async (id: string, status: string, reason?: string) => {
    setUpdatingId(id);
    try {
      const response = await api.updateAppointmentStatus(id, status, reason);
      if (response.success) {
        toast.success(`Appointment ${status}`);
        fetchAppointments();
        fetchStats();
        setShowCancelDialog(null);
        setCancelReason('');
      } else {
        toast.error(response.error || 'Error');
      }
    } catch {
      toast.error('Error');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200', label: t('appointments.statusPending') },
      confirmed: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200', label: t('appointments.statusConfirmed') },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200', label: t('appointments.statusCancelled') },
      completed: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', label: t('appointments.statusCompleted') },
      no_show: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200', label: t('appointments.statusNoShow') },
    };
    const c = config[status] || config.pending;
    return (
      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', c.bg, c.text)}>
        {c.label}
      </span>
    );
  };

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('appointments.totalAppointments')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalAppointments}</p>
              </div>
              <CalendarIcon className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('appointments.upcoming')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.upcoming}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('appointments.completedToday')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completedToday}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={`${t('appointments.client')}...`}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="lg:w-48">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">{t('orders.allStatuses')}</option>
              <option value="pending">{t('appointments.statusPending')}</option>
              <option value="confirmed">{t('appointments.statusConfirmed')}</option>
              <option value="completed">{t('appointments.statusCompleted')}</option>
              <option value="cancelled">{t('appointments.statusCancelled')}</option>
              <option value="no_show">{t('appointments.statusNoShow')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="text-gray-500 dark:text-gray-400 mt-4">Loading...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {t('appointments.noAppointments')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {t('appointments.noAppointmentsDesc')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.client')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.phone')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.date')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.time')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.duration')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('appointments.status')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{appt.customerName}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">{appt.customerPhone}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {new Date(appt.date).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {appt.startTime} - {appt.endTime}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {appt.duration} {t('appointments.minutes')}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(appt.status)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {appt.status === 'pending' && (
                            <button
                              onClick={() => handleStatusUpdate(appt.id, 'confirmed')}
                              disabled={updatingId === appt.id}
                              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {t('appointments.confirmAppointment')}
                            </button>
                          )}
                          {(appt.status === 'pending' || appt.status === 'confirmed') && (
                            <button
                              onClick={() => setShowCancelDialog(appt.id)}
                              disabled={updatingId === appt.id}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {t('appointments.cancelAppointment')}
                            </button>
                          )}
                          {appt.status === 'confirmed' && (
                            <>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, 'completed')}
                                disabled={updatingId === appt.id}
                                className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {t('appointments.completeAppointment')}
                              </button>
                              <button
                                onClick={() => handleStatusUpdate(appt.id, 'no_show')}
                                disabled={updatingId === appt.id}
                                className="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                              >
                                {t('appointments.markNoShow')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {page} / {totalPages}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('appointments.cancelAppointment')}
            </h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('appointments.cancellationReason')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
              rows={3}
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowCancelDialog(null); setCancelReason(''); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={() => handleStatusUpdate(showCancelDialog, 'cancelled', cancelReason)}
                disabled={updatingId === showCancelDialog}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {t('appointments.cancelAppointment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================
// Tab 2: Calendar View
// ==========================================
function AppointmentCalendar() {
  const { t } = useI18n();
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff));
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8:00 - 19:00

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const fetchWeekAppointments = useCallback(async () => {
    setIsLoading(true);
    const dateFrom = weekStart.toISOString().split('T')[0];
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    const dateTo = endDate.toISOString().split('T')[0];
    try {
      const response = await api.getAppointments({ dateFrom, dateTo, limit: 100 });
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setAppointments(Array.isArray(data) ? data : data.items || []);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching calendar appointments:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { fetchWeekAppointments(); }, [fetchWeekAppointments]);

  const navigateWeek = (direction: number) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * 7);
      return d;
    });
  };

  const getAppointmentsForSlot = (day: Date, hour: number) => {
    const dayStr = day.toISOString().split('T')[0];
    return appointments.filter(appt => {
      const apptDate = appt.date?.split('T')[0] || appt.date;
      if (apptDate !== dayStr) return false;
      const startHour = parseInt(appt.startTime?.split(':')[0] || '0', 10);
      return startHour === hour;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-200 dark:bg-yellow-800 border-yellow-400';
      case 'confirmed': return 'bg-blue-200 dark:bg-blue-800 border-blue-400';
      case 'completed': return 'bg-green-200 dark:bg-green-800 border-green-400';
      case 'cancelled': return 'bg-red-200 dark:bg-red-800 border-red-400';
      case 'no_show': return 'bg-gray-200 dark:bg-gray-700 border-gray-400';
      default: return 'bg-gray-200 dark:bg-gray-700 border-gray-400';
    }
  };

  const dayNames = [
    t('appointments.monday'), t('appointments.tuesday'), t('appointments.wednesday'),
    t('appointments.thursday'), t('appointments.friday'), t('appointments.saturday'), t('appointments.sunday'),
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigateWeek(-1)}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {weekDays[0].toLocaleDateString()} - {weekDays[6].toLocaleDateString()}
        </h3>
        <button
          onClick={() => navigateWeek(1)}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr>
                <th className="w-16 px-2 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                  {t('appointments.time')}
                </th>
                {weekDays.map((day, i) => (
                  <th key={i} className="px-2 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                    <div>{dayNames[i]}</div>
                    <div className="text-gray-900 dark:text-white font-semibold">{day.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => (
                <tr key={hour} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 text-center align-top">
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </td>
                  {weekDays.map((day, i) => {
                    const slotAppointments = getAppointmentsForSlot(day, hour);
                    return (
                      <td key={i} className="px-1 py-1 border-r border-gray-200 dark:border-gray-700 last:border-r-0 align-top h-16">
                        {slotAppointments.map((appt) => (
                          <div
                            key={appt.id}
                            className={clsx(
                              'text-xs p-1 rounded border-l-2 mb-1 truncate',
                              getStatusColor(appt.status)
                            )}
                            title={`${appt.customerName} - ${appt.startTime}-${appt.endTime}`}
                          >
                            <p className="font-medium truncate text-gray-900 dark:text-white">{appt.customerName}</p>
                            <p className="text-gray-600 dark:text-gray-400">{appt.startTime}</p>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Tab 3: Availability Settings
// ==========================================
function AvailabilitySettings() {
  const { t } = useI18n();

  const dayNames = [
    t('appointments.monday'), t('appointments.tuesday'), t('appointments.wednesday'),
    t('appointments.thursday'), t('appointments.friday'), t('appointments.saturday'), t('appointments.sunday'),
  ];

  const defaultHours: BusinessHour[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    isOpen: i < 5,
    openTime: '08:00',
    closeTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    slotDuration: 30,
  }));

  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(defaultHours);
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHours, setIsLoadingHours] = useState(true);
  const [newDayOff, setNewDayOff] = useState({ date: '', reason: '', allDay: true });

  const fetchBusinessHours = useCallback(async () => {
    setIsLoadingHours(true);
    try {
      const response = await api.getBusinessHours();
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        if (Array.isArray(data) && data.length > 0) {
          setBusinessHours(data);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching business hours:', error);
      }
    } finally {
      setIsLoadingHours(false);
    }
  }, []);

  const fetchDaysOff = useCallback(async () => {
    try {
      const response = await api.getDaysOff();
      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setDaysOff(Array.isArray(data) ? data : data.items || []);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching days off:', error);
      }
    }
  }, []);

  useEffect(() => { fetchBusinessHours(); }, [fetchBusinessHours]);
  useEffect(() => { fetchDaysOff(); }, [fetchDaysOff]);

  const handleSaveHours = async () => {
    setIsSaving(true);
    try {
      const response = await api.setBusinessHours(businessHours);
      if (response.success) {
        toast.success(t('appointments.hoursSaved'));
      } else {
        toast.error(response.error || 'Error');
      }
    } catch {
      toast.error('Error saving hours');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDayOff = async () => {
    if (!newDayOff.date) return;
    try {
      const response = await api.addDayOff({
        date: newDayOff.date,
        reason: newDayOff.reason || undefined,
        allDay: newDayOff.allDay,
      });
      if (response.success) {
        toast.success('Day off added');
        setNewDayOff({ date: '', reason: '', allDay: true });
        fetchDaysOff();
      } else {
        toast.error(response.error || 'Error');
      }
    } catch {
      toast.error('Error adding day off');
    }
  };

  const handleRemoveDayOff = async (id: string) => {
    try {
      const response = await api.removeDayOff(id);
      if (response.success) {
        toast.success('Day off removed');
        fetchDaysOff();
      } else {
        toast.error(response.error || 'Error');
      }
    } catch {
      toast.error('Error removing day off');
    }
  };

  const updateHour = (index: number, field: keyof BusinessHour, value: any) => {
    setBusinessHours(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  if (isLoadingHours) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Business Hours */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('appointments.businessHours')}
          </h2>
          <button
            onClick={handleSaveHours}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {t('appointments.saveHours')}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.dayOfWeek')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.isOpen')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.openTime')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.closeTime')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.breakStart')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.breakEnd')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('appointments.slotDuration')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {businessHours.map((bh, index) => (
                <tr key={index} className={clsx(!bh.isOpen && 'opacity-50')}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {dayNames[index]}
                  </td>
                  <td className="px-4 py-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bh.isOpen}
                        onChange={(e) => updateHour(index, 'isOpen', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      value={bh.openTime}
                      onChange={(e) => updateHour(index, 'openTime', e.target.value)}
                      disabled={!bh.isOpen}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      value={bh.closeTime}
                      onChange={(e) => updateHour(index, 'closeTime', e.target.value)}
                      disabled={!bh.isOpen}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      value={bh.breakStart || ''}
                      onChange={(e) => updateHour(index, 'breakStart', e.target.value || undefined)}
                      disabled={!bh.isOpen}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      value={bh.breakEnd || ''}
                      onChange={(e) => updateHour(index, 'breakEnd', e.target.value || undefined)}
                      disabled={!bh.isOpen}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={bh.slotDuration}
                      onChange={(e) => updateHour(index, 'slotDuration', parseInt(e.target.value))}
                      disabled={!bh.isOpen}
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    >
                      <option value={15}>15 {t('appointments.minutes')}</option>
                      <option value={30}>30 {t('appointments.minutes')}</option>
                      <option value={45}>45 {t('appointments.minutes')}</option>
                      <option value={60}>60 {t('appointments.minutes')}</option>
                      <option value={90}>90 {t('appointments.minutes')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Days Off */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('appointments.daysOff')}
          </h2>
        </div>
        <div className="p-6">
          {/* Add day off form */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('appointments.date')}</label>
              <input
                type="date"
                value={newDayOff.date}
                onChange={(e) => setNewDayOff(prev => ({ ...prev, date: e.target.value }))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('appointments.reason')}</label>
              <input
                type="text"
                value={newDayOff.reason}
                onChange={(e) => setNewDayOff(prev => ({ ...prev, reason: e.target.value }))}
                placeholder={t('appointments.reason')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={newDayOff.allDay}
                onChange={(e) => setNewDayOff(prev => ({ ...prev, allDay: e.target.checked }))}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
              />
              <label className="text-sm text-gray-700 dark:text-gray-300">{t('appointments.allDay')}</label>
            </div>
            <button
              onClick={handleAddDayOff}
              disabled={!newDayOff.date}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('appointments.addDayOff')}
            </button>
          </div>

          {/* Days off list */}
          {daysOff.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('appointments.daysOff')}: 0</p>
          ) : (
            <div className="space-y-2">
              {daysOff.map((dayOff) => (
                <div key={dayOff.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(dayOff.date).toLocaleDateString()}
                      {dayOff.allDay && <span className="ml-2 text-xs text-gray-500">({t('appointments.allDay')})</span>}
                    </p>
                    {dayOff.reason && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{dayOff.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveDayOff(dayOff.id)}
                    className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
