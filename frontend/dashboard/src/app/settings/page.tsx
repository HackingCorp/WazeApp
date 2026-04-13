'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Building2,
  Shield,
  Bell,
  Globe,
  Palette,
  Save,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { requestNotificationPermission } from '@/lib/browserNotification';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type SettingsTab = 'profile' | 'organization' | 'preferences' | 'security' | 'notifications';

interface UserProfile {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
  organizations: Array<{
    id: string;
    name: string;
    role: string;
    createdAt: string;
  }>;
}

export default function SettingsPage() {
  const { t, locale, setLocale, availableLocales } = useI18n();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
  });

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    browserNotifications: false,
    escalationSound: true,
    escalationToast: true,
  });

  const clearAllNotifications = useNotificationStore((s) => s.clearAll);

  useEffect(() => {
    loadProfile();
    // Check current browser notification permission
    if ('Notification' in window) {
      setNotifPrefs((prev) => ({
        ...prev,
        browserNotifications: Notification.permission === 'granted',
      }));
    }
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const response = await api.getProfile();
      if (response.success) {
        setProfile(response.data);
        setProfileForm({
          firstName: response.data.user.firstName || '',
          lastName: response.data.user.lastName || '',
        });
      }
    } catch (error) {
      toast.error(t('settings.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const response = await api.updateProfile(profileForm);
      if (response.success) {
        toast.success(t('settings.profileSaved'));
        loadProfile();
      } else {
        toast.error(t('settings.saveFailed'));
      }
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t('settings.passwordMismatch'));
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error(t('settings.passwordTooShort'));
      return;
    }
    try {
      setIsSaving(true);
      const response = await api.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      if (response.success) {
        toast.success(t('settings.passwordChanged'));
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast.error(response.error || t('settings.saveFailed'));
      }
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnableBrowserNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifPrefs((prev) => ({
      ...prev,
      browserNotifications: permission === 'granted',
    }));
    if (permission === 'granted') {
      toast.success(t('settings.notificationsEnabled'));
    } else {
      toast.error(t('settings.notificationsDenied'));
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: t('settings.profile'), icon: User },
    { id: 'organization', label: t('settings.organization'), icon: Building2 },
    { id: 'preferences', label: t('settings.preferences'), icon: Palette },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'security', label: t('settings.security'), icon: Shield },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('settings.title')}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t('settings.subtitle')}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar tabs */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                      activeTab === tab.id
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('settings.profile')}
                </h2>
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings.firstName')}
                      </label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings.lastName')}
                      </label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('settings.email')}
                    </label>
                    <input
                      type="email"
                      value={profile?.user.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {t('settings.memberSince')}: {profile?.user.createdAt ? new Date(profile.user.createdAt).toLocaleDateString() : '-'}
                    </span>
                    {profile?.user.emailVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-400 rounded-full">
                        <Check className="w-3 h-3" />
                        {t('settings.emailVerified')}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? t('settings.saving') : t('settings.saveChanges')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Organization Tab */}
            {activeTab === 'organization' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('settings.organization')}
                </h2>
                {profile?.organizations && profile.organizations.length > 0 ? (
                  <div className="space-y-4">
                    {profile.organizations.map((org) => (
                      <div
                        key={org.id}
                        className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {t('settings.joined')} {new Date(org.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-400 rounded-full capitalize">
                          {org.role}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                    {t('settings.noOrganization')}
                  </p>
                )}
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                {/* Language */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    <Globe className="w-5 h-5 inline-block mr-2" />
                    {t('settings.language')}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {availableLocales.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => setLocale(lang.code)}
                        className={clsx(
                          'flex items-center gap-3 p-3 rounded-lg border-2 transition-colors',
                          locale === lang.code
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        <span className="text-2xl">{lang.flag}</span>
                        <span className={clsx(
                          'font-medium',
                          locale === lang.code
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-gray-700 dark:text-gray-300'
                        )}>
                          {lang.name}
                        </span>
                        {locale === lang.code && (
                          <Check className="w-4 h-4 text-green-600 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    <Palette className="w-5 h-5 inline-block mr-2" />
                    {t('settings.themeTitle')}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((themeOption) => (
                      <button
                        key={themeOption}
                        onClick={() => setTheme(themeOption)}
                        className={clsx(
                          'flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-colors',
                          theme === themeOption
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        <span className={clsx(
                          'font-medium capitalize',
                          theme === themeOption
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-gray-700 dark:text-gray-300'
                        )}>
                          {t(`header.theme.${themeOption}`)}
                        </span>
                        {theme === themeOption && (
                          <Check className="w-4 h-4 text-green-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  {t('settings.notifications')}
                </h2>
                <div className="space-y-6">
                  {/* Browser Notifications */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t('settings.browserNotifications')}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.browserNotificationsDesc')}
                      </p>
                    </div>
                    {notifPrefs.browserNotifications ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-400 rounded-full">
                        <Check className="w-4 h-4" />
                        {t('settings.enabled')}
                      </span>
                    ) : (
                      <button
                        onClick={handleEnableBrowserNotifications}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                      >
                        {t('settings.enable')}
                      </button>
                    )}
                  </div>

                  {/* Clear Notifications */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t('settings.clearNotifications')}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.clearNotificationsDesc')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        clearAllNotifications();
                        toast.success(t('settings.notificationsCleared'));
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      {t('settings.clearAll')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Change Password */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                    {t('settings.changePassword')}
                  </h2>
                  <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings.currentPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings.newPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.new ? 'text' : 'password'}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('settings.confirmPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-end pt-4">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        {isSaving ? t('settings.saving') : t('settings.changePassword')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Danger Zone */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-red-200 dark:border-red-900">
                  <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">
                    {t('settings.dangerZone')}
                  </h2>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t('settings.signOut')}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('settings.signOutDesc')}
                      </p>
                    </div>
                    <button
                      onClick={logout}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      {t('settings.signOut')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
