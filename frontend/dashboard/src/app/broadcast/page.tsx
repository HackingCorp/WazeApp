'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radio,
  Users,
  FileText,
  Send,
  Upload,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Edit,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Tag,
  Phone,
  Mail,
  Building,
  X,
  AlertCircle,
  Calendar,
  Repeat,
  MessageSquare,
  Image,
  Video,
  File,
  MapPin,
  UserCircle,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';

type TabType = 'contacts' | 'templates' | 'campaigns';

interface Contact {
  id: string;
  phoneNumber: string;
  name: string;
  email?: string;
  company?: string;
  tags?: string[];
  isValidWhatsApp?: boolean;
  isSubscribed: boolean;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  type: string;
  category: string;
  content: string;
  variables?: string[];
  isSystem: boolean;
  usageCount: number;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  stats: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    read: number;
  };
  scheduledAt?: string;
  createdAt: string;
}

interface WhatsAppSession {
  id: string;
  name: string;
  phoneNumber?: string;
  status: string;
}

const templateCategories = [
  { value: 'welcome', label: 'Bienvenue' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'reminder', label: 'Rappel' },
  { value: 'notification', label: 'Notification' },
  { value: 'follow_up', label: 'Suivi' },
  { value: 'thank_you', label: 'Remerciement' },
  { value: 'custom', label: 'Personnalisé' },
];

const templateTypes = [
  { value: 'text', label: 'Texte', icon: MessageSquare },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'video', label: 'Vidéo', icon: Video },
  { value: 'document', label: 'Document', icon: File },
  { value: 'location', label: 'Localisation', icon: MapPin },
  { value: 'contact', label: 'Contact', icon: UserCircle },
];

export default function BroadcastPage() {
  const [activeTab, setActiveTab] = useState<TabType>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactStats, setContactStats] = useState({ total: 0, limit: 50, validated: 0, subscribed: 0 });

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importTagInput, setImportTagInput] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [validateWhatsApp, setValidateWhatsApp] = useState(false);
  const [importSessionId, setImportSessionId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add contact state
  const [newContact, setNewContact] = useState({
    phoneNumber: '',
    name: '',
    email: '',
    company: '',
    tags: [] as string[],
  });
  const [addContactTagInput, setAddContactTagInput] = useState('');
  const [addingContact, setAddingContact] = useState(false);

  // Template state
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    type: 'text' as string,
    category: 'custom',
    content: '',
    caption: '',
    mediaUrl: '',
  });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Campaign state
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    sessionId: '',
    templateId: '',
    useCustomMessage: false,
    customMessage: {
      type: 'text',
      content: '',
    },
    useContactFilter: false,
    contactFilter: {
      tags: [] as string[],
      isValidWhatsApp: true,
    },
    selectedContactIds: [] as string[],
    scheduleLater: false,
    scheduledAt: '',
    recurrenceType: 'none' as string,
    delayBetweenMessages: 3000,
  });
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaignFilterTagInput, setCampaignFilterTagInput] = useState('');

  // Fetch functions
  const fetchContacts = useCallback(async () => {
    try {
      const response = await api.getBroadcastContacts({ search: searchTerm });
      if (response.success) {
        setContacts(response.data?.data || response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  }, [searchTerm]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await api.getBroadcastTemplates();
      if (response.success) {
        setTemplates(response.data?.data || response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const response = await api.getBroadcastCampaigns();
      if (response.success) {
        setCampaigns(response.data?.data || response.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    }
  }, []);

  const fetchContactStats = useCallback(async () => {
    try {
      const response = await api.getBroadcastContactStats();
      if (response.success) {
        setContactStats(response.data || { total: 0, limit: 50, validated: 0, subscribed: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch contact stats:', error);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.getWhatsAppSessions();
      if (response.success) {
        const sessionList = response.data?.data || response.data || [];
        setSessions(sessionList.filter((s: WhatsAppSession) => s.status === 'connected'));
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchContacts(),
      fetchTemplates(),
      fetchCampaigns(),
      fetchContactStats(),
      fetchSessions(),
    ]).finally(() => setLoading(false));
  }, [fetchContacts, fetchTemplates, fetchCampaigns, fetchContactStats, fetchSessions]);

  // Handle import contacts
  const handleImport = async () => {
    if (!importFile) return;

    setImporting(true);
    setImportResult(null);

    try {
      const response = await api.importBroadcastContacts(importFile, {
        tags: importTags,
        skipDuplicates,
        validateWhatsApp,
        sessionId: validateWhatsApp ? importSessionId : undefined,
      });

      if (response.success) {
        setImportResult(response.data);
        await fetchContacts();
        await fetchContactStats();
      } else {
        setImportResult({ error: response.error || 'Import failed' });
      }
    } catch (error) {
      setImportResult({ error: 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  // Handle add contact
  const handleAddContact = async () => {
    if (!newContact.phoneNumber || !newContact.name) return;

    setAddingContact(true);
    try {
      const response = await api.createBroadcastContact({
        phoneNumber: newContact.phoneNumber,
        name: newContact.name,
        email: newContact.email || undefined,
        company: newContact.company || undefined,
        tags: newContact.tags.length > 0 ? newContact.tags : undefined,
      });

      if (response.success) {
        setShowAddContactModal(false);
        setNewContact({ phoneNumber: '', name: '', email: '', company: '', tags: [] });
        await fetchContacts();
        await fetchContactStats();
      }
    } catch (error) {
      console.error('Failed to add contact:', error);
    } finally {
      setAddingContact(false);
    }
  };

  // Handle create template
  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) return;

    setCreatingTemplate(true);
    try {
      const response = await api.createBroadcastTemplate({
        name: newTemplate.name,
        description: newTemplate.description || undefined,
        type: newTemplate.type as any,
        category: newTemplate.category,
        content: newTemplate.content,
        caption: newTemplate.caption || undefined,
        mediaUrl: newTemplate.mediaUrl || undefined,
      });

      if (response.success) {
        setShowCreateTemplateModal(false);
        setNewTemplate({
          name: '',
          description: '',
          type: 'text',
          category: 'custom',
          content: '',
          caption: '',
          mediaUrl: '',
        });
        await fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to create template:', error);
    } finally {
      setCreatingTemplate(false);
    }
  };

  // Handle create campaign
  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.sessionId) return;
    if (!newCampaign.templateId && !newCampaign.useCustomMessage) return;

    setCreatingCampaign(true);
    try {
      const response = await api.createBroadcastCampaign({
        name: newCampaign.name,
        description: newCampaign.description || undefined,
        sessionId: newCampaign.sessionId,
        templateId: !newCampaign.useCustomMessage ? newCampaign.templateId : undefined,
        customMessage: newCampaign.useCustomMessage
          ? {
              type: newCampaign.customMessage.type,
              content: newCampaign.customMessage.content,
            }
          : undefined,
        contactFilter: newCampaign.useContactFilter
          ? {
              tags: newCampaign.contactFilter.tags.length > 0 ? newCampaign.contactFilter.tags : undefined,
              isValidWhatsApp: newCampaign.contactFilter.isValidWhatsApp,
            }
          : undefined,
        contactIds: !newCampaign.useContactFilter && newCampaign.selectedContactIds.length > 0
          ? newCampaign.selectedContactIds
          : undefined,
        scheduledAt: newCampaign.scheduleLater && newCampaign.scheduledAt
          ? new Date(newCampaign.scheduledAt).toISOString()
          : undefined,
        recurrenceType: newCampaign.recurrenceType as any,
        delayBetweenMessages: newCampaign.delayBetweenMessages,
      });

      if (response.success) {
        setShowCreateCampaignModal(false);
        setNewCampaign({
          name: '',
          description: '',
          sessionId: '',
          templateId: '',
          useCustomMessage: false,
          customMessage: { type: 'text', content: '' },
          useContactFilter: false,
          contactFilter: { tags: [], isValidWhatsApp: true },
          selectedContactIds: [],
          scheduleLater: false,
          scheduledAt: '',
          recurrenceType: 'none',
          delayBetweenMessages: 3000,
        });
        await fetchCampaigns();
      }
    } catch (error) {
      console.error('Failed to create campaign:', error);
    } finally {
      setCreatingCampaign(false);
    }
  };

  // Handle campaign actions
  const handleStartCampaign = async (id: string) => {
    try {
      await api.startBroadcastCampaign(id);
      await fetchCampaigns();
    } catch (error) {
      console.error('Failed to start campaign:', error);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await api.pauseBroadcastCampaign(id);
      await fetchCampaigns();
    } catch (error) {
      console.error('Failed to pause campaign:', error);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Supprimer ce contact ?')) return;
    try {
      await api.deleteBroadcastContact(id);
      await fetchContacts();
      await fetchContactStats();
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Supprimer ce template ?')) return;
    try {
      await api.deleteBroadcastTemplate(id);
      await fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  // File drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setImportFile(files[0]);
    }
  };

  const tabs = [
    { id: 'contacts' as TabType, name: 'Contacts', icon: Users, count: contacts.length },
    { id: 'templates' as TabType, name: 'Templates', icon: FileText, count: templates.length },
    { id: 'campaigns' as TabType, name: 'Campagnes', icon: Send, count: campaigns.length },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'paused':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'text':
        return 'bg-blue-100 text-blue-800';
      case 'image':
        return 'bg-purple-100 text-purple-800';
      case 'video':
        return 'bg-pink-100 text-pink-800';
      case 'document':
        return 'bg-orange-100 text-orange-800';
      case 'location':
        return 'bg-green-100 text-green-800';
      case 'contact':
        return 'bg-cyan-100 text-cyan-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Extract variables from content
  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{([^}]+)\}/g);
    return matches ? [...new Set(matches.map((m) => m.slice(1, -1)))] : [];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Radio className="w-7 h-7 text-green-600" />
            Broadcast
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Envoyez des messages WhatsApp en masse
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'contacts' && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Importer
              </button>
              <button
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter Contact
              </button>
            </>
          )}
          {activeTab === 'templates' && (
            <button
              onClick={() => setShowCreateTemplateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouveau Template
            </button>
          )}
          {activeTab === 'campaigns' && (
            <button
              onClick={() => setShowCreateCampaignModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Campagne
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Contacts</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {contactStats.total} / {contactStats.limit}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Templates</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{templates.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Campagnes</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{campaigns.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Messages envoyés</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {campaigns.reduce((acc, c) => acc + (c.stats?.sent || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={`Rechercher ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Filter className="w-4 h-4" />
          Filtrer
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-green-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {contacts.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Aucun contact
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Importez vos contacts pour commencer
                  </p>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Upload className="w-4 h-4" />
                    Importer des contacts
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Numéro
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Tags
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        WhatsApp
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                              <span className="text-green-700 dark:text-green-400 font-medium">
                                {contact.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{contact.name}</p>
                              {contact.company && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">{contact.company}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 dark:text-white">{contact.phoneNumber}</p>
                          {contact.email && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">{contact.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {contact.tags?.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {contact.isValidWhatsApp === true && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              Vérifié
                            </span>
                          )}
                          {contact.isValidWhatsApp === false && (
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircle className="w-4 h-4" />
                              Non valide
                            </span>
                          )}
                          {(contact.isValidWhatsApp === null || contact.isValidWhatsApp === undefined) && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <Clock className="w-4 h-4" />
                              Non vérifié
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Aucun template
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Créez des templates de messages réutilisables
                  </p>
                  <button
                    onClick={() => setShowCreateTemplateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" />
                    Créer un template
                  </button>
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">{template.name}</h3>
                          {template.isSystem && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                              Système
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                      {!template.isSystem && (
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeColor(template.type)}`}>
                        {template.type}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {template.category}
                      </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 mb-3">
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                        {template.content}
                      </p>
                    </div>
                    {template.variables && template.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.variables.map((variable) => (
                          <span
                            key={variable}
                            className="px-2 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                          >
                            {`{${variable}}`}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                      <span>Utilisé {template.usageCount} fois</span>
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowPreviewModal(true);
                        }}
                        className="text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        Aperçu
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <Send className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Aucune campagne
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Créez votre première campagne de broadcast
                  </p>
                  <button
                    onClick={() => setShowCreateCampaignModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" />
                    Créer une campagne
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Campagne
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Progression
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Planifié
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {campaigns.map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{campaign.name}</p>
                            {campaign.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{campaign.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-full max-w-xs">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-500 dark:text-gray-400">
                                {campaign.stats?.sent || 0} / {campaign.stats?.total || 0}
                              </span>
                              <span className="text-gray-900 dark:text-white font-medium">
                                {campaign.stats?.total
                                  ? Math.round(((campaign.stats?.sent || 0) / campaign.stats.total) * 100)
                                  : 0}
                                %
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-600 rounded-full"
                                style={{
                                  width: `${
                                    campaign.stats?.total
                                      ? ((campaign.stats?.sent || 0) / campaign.stats.total) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {campaign.scheduledAt ? (
                            <span className="text-gray-900 dark:text-white">
                              {new Date(campaign.scheduledAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                              <button
                                onClick={() => handleStartCampaign(campaign.id)}
                                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600"
                                title="Démarrer"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {campaign.status === 'running' && (
                              <button
                                onClick={() => handlePauseCampaign(campaign.id)}
                                className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded text-orange-600"
                                title="Pause"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Importer des contacts
              </h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportResult(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importResult ? (
              <div className="space-y-4">
                {importResult.error ? (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertCircle className="w-5 h-5" />
                      <span>Erreur: {importResult.error}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Import réussi!</span>
                    </div>
                    <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
                      <p>Total traités: {importResult.totalProcessed || 0}</p>
                      <p>Créés: {importResult.created || 0}</p>
                      <p>Mis à jour: {importResult.updated || 0}</p>
                      <p>Ignorés: {importResult.skipped || 0}</p>
                      {importResult.errors?.length > 0 && (
                        <p className="text-red-600">Erreurs: {importResult.errors.length}</p>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportResult(null);
                  }}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors ${
                    importFile
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    accept=".csv,.xlsx,.xls,.json"
                    className="hidden"
                  />
                  {importFile ? (
                    <div>
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <p className="text-gray-900 dark:text-white font-medium">{importFile.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(importFile.size / 1024).toFixed(1)} KB
                      </p>
                      <button
                        onClick={() => setImportFile(null)}
                        className="mt-2 text-red-600 hover:text-red-700 text-sm"
                      >
                        Supprimer
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-300 mb-2">
                        Glissez-déposez votre fichier ici
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Formats supportés: CSV, Excel, JSON
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Parcourir
                      </button>
                    </>
                  )}
                </div>

                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tags à appliquer
                    </label>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {importTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center gap-1"
                        >
                          {tag}
                          <button
                            onClick={() => setImportTags(importTags.filter((t) => t !== tag))}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={importTagInput}
                        onChange={(e) => setImportTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && importTagInput.trim()) {
                            setImportTags([...importTags, importTagInput.trim()]);
                            setImportTagInput('');
                          }
                        }}
                        placeholder="Ajouter un tag..."
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => {
                          if (importTagInput.trim()) {
                            setImportTags([...importTags, importTagInput.trim()]);
                            setImportTagInput('');
                          }
                        }}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Ignorer les doublons (numéros existants)
                    </span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={validateWhatsApp}
                      onChange={(e) => setValidateWhatsApp(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Valider les numéros WhatsApp après import
                    </span>
                  </label>

                  {validateWhatsApp && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Session WhatsApp pour validation
                      </label>
                      <select
                        value={importSessionId}
                        onChange={(e) => setImportSessionId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Sélectionner une session</option>
                        {sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name} ({session.phoneNumber || 'Non connecté'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Importer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Ajouter un contact
              </h2>
              <button
                onClick={() => setShowAddContactModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Numéro de téléphone *
                </label>
                <input
                  type="tel"
                  value={newContact.phoneNumber}
                  onChange={(e) => setNewContact({ ...newContact, phoneNumber: e.target.value })}
                  placeholder="+237612345678"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom *
                </label>
                <input
                  type="text"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  placeholder="Jean Dupont"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  placeholder="jean@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Entreprise
                </label>
                <input
                  type="text"
                  value={newContact.company}
                  onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                  placeholder="Acme Inc"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {newContact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() =>
                          setNewContact({
                            ...newContact,
                            tags: newContact.tags.filter((t) => t !== tag),
                          })
                        }
                        className="hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addContactTagInput}
                    onChange={(e) => setAddContactTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && addContactTagInput.trim()) {
                        setNewContact({
                          ...newContact,
                          tags: [...newContact.tags, addContactTagInput.trim()],
                        });
                        setAddContactTagInput('');
                      }
                    }}
                    placeholder="Ajouter un tag..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => {
                      if (addContactTagInput.trim()) {
                        setNewContact({
                          ...newContact,
                          tags: [...newContact.tags, addContactTagInput.trim()],
                        });
                        setAddContactTagInput('');
                      }
                    }}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddContactModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newContact.phoneNumber || !newContact.name || addingContact}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addingContact && <RefreshCw className="w-4 h-4 animate-spin" />}
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Nouveau template
              </h2>
              <button
                onClick={() => setShowCreateTemplateModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom du template *
                </label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="Ex: Bienvenue client"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  placeholder="Description du template..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type *
                  </label>
                  <select
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {templateTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Catégorie *
                  </label>
                  <select
                    value={newTemplate.category}
                    onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {templateCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contenu du message *
                </label>
                <textarea
                  value={newTemplate.content}
                  onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                  placeholder="Bonjour {nom}, bienvenue chez {entreprise}!"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Utilisez {'{variable}'} pour les variables dynamiques
                </p>
              </div>

              {extractVariables(newTemplate.content).length > 0 && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Variables détectées:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {extractVariables(newTemplate.content).map((variable) => (
                      <span
                        key={variable}
                        className="px-2 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      >
                        {`{${variable}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {newTemplate.type !== 'text' && newTemplate.type !== 'location' && newTemplate.type !== 'contact' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL du média
                    </label>
                    <input
                      type="url"
                      value={newTemplate.mediaUrl}
                      onChange={(e) => setNewTemplate({ ...newTemplate, mediaUrl: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Légende (caption)
                    </label>
                    <textarea
                      value={newTemplate.caption}
                      onChange={(e) => setNewTemplate({ ...newTemplate, caption: e.target.value })}
                      placeholder="Description de l'image..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateTemplateModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplate.name || !newTemplate.content || creatingTemplate}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingTemplate && <RefreshCw className="w-4 h-4 animate-spin" />}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Nouvelle campagne
              </h2>
              <button
                onClick={() => setShowCreateCampaignModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900 dark:text-white">Informations de base</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nom de la campagne *
                  </label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    placeholder="Ex: Promotion Noël 2024"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newCampaign.description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                    placeholder="Description de la campagne..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session WhatsApp *
                  </label>
                  <select
                    value={newCampaign.sessionId}
                    onChange={(e) => setNewCampaign({ ...newCampaign, sessionId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Sélectionner une session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name} ({session.phoneNumber || 'Non connecté'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Message */}
              <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="font-medium text-gray-900 dark:text-white">Message</h3>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!newCampaign.useCustomMessage}
                      onChange={() => setNewCampaign({ ...newCampaign, useCustomMessage: false })}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Utiliser un template
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={newCampaign.useCustomMessage}
                      onChange={() => setNewCampaign({ ...newCampaign, useCustomMessage: true })}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Message personnalisé
                    </span>
                  </label>
                </div>

                {!newCampaign.useCustomMessage ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Template *
                    </label>
                    <select
                      value={newCampaign.templateId}
                      onChange={(e) => setNewCampaign({ ...newCampaign, templateId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Sélectionner un template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} ({template.type})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Message *
                    </label>
                    <textarea
                      value={newCampaign.customMessage.content}
                      onChange={(e) =>
                        setNewCampaign({
                          ...newCampaign,
                          customMessage: { ...newCampaign.customMessage, content: e.target.value },
                        })
                      }
                      placeholder="Votre message..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Recipients */}
              <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="font-medium text-gray-900 dark:text-white">Destinataires</h3>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!newCampaign.useContactFilter}
                      onChange={() => setNewCampaign({ ...newCampaign, useContactFilter: false })}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Tous les contacts ({contacts.length})
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={newCampaign.useContactFilter}
                      onChange={() => setNewCampaign({ ...newCampaign, useContactFilter: true })}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Filtrer par tags
                    </span>
                  </label>
                </div>

                {newCampaign.useContactFilter && (
                  <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tags à cibler
                      </label>
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {newCampaign.contactFilter.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center gap-1"
                          >
                            {tag}
                            <button
                              onClick={() =>
                                setNewCampaign({
                                  ...newCampaign,
                                  contactFilter: {
                                    ...newCampaign.contactFilter,
                                    tags: newCampaign.contactFilter.tags.filter((t) => t !== tag),
                                  },
                                })
                              }
                              className="hover:text-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={campaignFilterTagInput}
                          onChange={(e) => setCampaignFilterTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && campaignFilterTagInput.trim()) {
                              setNewCampaign({
                                ...newCampaign,
                                contactFilter: {
                                  ...newCampaign.contactFilter,
                                  tags: [...newCampaign.contactFilter.tags, campaignFilterTagInput.trim()],
                                },
                              });
                              setCampaignFilterTagInput('');
                            }
                          }}
                          placeholder="Ajouter un tag..."
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={() => {
                            if (campaignFilterTagInput.trim()) {
                              setNewCampaign({
                                ...newCampaign,
                                contactFilter: {
                                  ...newCampaign.contactFilter,
                                  tags: [...newCampaign.contactFilter.tags, campaignFilterTagInput.trim()],
                                },
                              });
                              setCampaignFilterTagInput('');
                            }
                          }}
                          className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newCampaign.contactFilter.isValidWhatsApp}
                        onChange={(e) =>
                          setNewCampaign({
                            ...newCampaign,
                            contactFilter: {
                              ...newCampaign.contactFilter,
                              isValidWhatsApp: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Uniquement les numéros WhatsApp vérifiés
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Scheduling */}
              <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="font-medium text-gray-900 dark:text-white">Planification</h3>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newCampaign.scheduleLater}
                    onChange={(e) => setNewCampaign({ ...newCampaign, scheduleLater: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Planifier pour plus tard
                  </span>
                </label>

                {newCampaign.scheduleLater && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Date et heure
                      </label>
                      <input
                        type="datetime-local"
                        value={newCampaign.scheduledAt}
                        onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Récurrence
                      </label>
                      <select
                        value={newCampaign.recurrenceType}
                        onChange={(e) => setNewCampaign({ ...newCampaign, recurrenceType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="none">Aucune</option>
                        <option value="daily">Quotidienne</option>
                        <option value="weekly">Hebdomadaire</option>
                        <option value="monthly">Mensuelle</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Délai entre les messages (ms)
                  </label>
                  <input
                    type="number"
                    value={newCampaign.delayBetweenMessages}
                    onChange={(e) =>
                      setNewCampaign({ ...newCampaign, delayBetweenMessages: parseInt(e.target.value) || 3000 })
                    }
                    min={3000}
                    step={1000}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Minimum 3000ms (3 secondes) pour éviter les blocages WhatsApp
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <button
                onClick={() => setShowCreateCampaignModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={
                  !newCampaign.name ||
                  !newCampaign.sessionId ||
                  (!newCampaign.templateId && !newCampaign.useCustomMessage) ||
                  (newCampaign.useCustomMessage && !newCampaign.customMessage.content) ||
                  creatingCampaign
                }
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingCampaign && <RefreshCw className="w-4 h-4 animate-spin" />}
                Créer la campagne
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showPreviewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Aperçu: {selectedTemplate.name}
              </h2>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedTemplate(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
              <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4 max-w-[80%] ml-auto">
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                  {selectedTemplate.content}
                </p>
                {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Variables: {selectedTemplate.variables.join(', ')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedTemplate(null);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
