'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Zap, Radio, Camera, CalendarClock, Users, BarChart3, UserCircle, Loader2, Send, Trash2, Plus,
  RefreshCw, Link as LinkIcon, Shield, Phone, Mic, Eye, Tag, CheckCircle, XCircle, Play,
} from 'lucide-react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types (mirror of the backend DTOs, kept loose on purpose)
// ---------------------------------------------------------------------------

interface Session { id: string; name: string; status: string; phoneNumber?: string }

interface Automation {
  autoRead?: boolean;
  rejectCalls?: boolean;
  rejectCallsMessage?: string;
  voiceReplies?: { enabled: boolean; voice?: string; onlyWhenClientUsesVoice?: boolean };
  presenceTracking?: boolean;
  acknowledgeReaction?: string;
  labelOnNewConversation?: string;
  disappearingSeconds?: number;
}

interface Group {
  id: string; subject: string; description?: string | null; size: number; announcementOnly: boolean; locked: boolean;
  joinApproval: boolean; participants: Array<{ id: string; admin: string | null }>;
}

interface ScheduledPost {
  id: string; kind: string; target?: string | null; content: any; audience?: any; scheduledAt: string; cron?: string | null;
  status: string; result?: any; error?: string | null; lastRunAt?: string | null;
}

interface Poll { id: string; chatJid: string; question: string; options: string[]; votes: Record<string, string[]>; voterCount: number; createdAt: string }

type Tab = 'automation' | 'channels' | 'status' | 'scheduled' | 'groups' | 'polls' | 'profile';

const TABS: Array<{ id: Tab; name: string; icon: any }> = [
  { id: 'automation', name: 'Automatisations', icon: Zap },
  { id: 'channels', name: 'Chaînes', icon: Radio },
  { id: 'status', name: 'Statuts', icon: Camera },
  { id: 'scheduled', name: 'Programmations', icon: CalendarClock },
  { id: 'groups', name: 'Groupes', icon: Users },
  { id: 'polls', name: 'Sondages', icon: BarChart3 },
  { id: 'profile', name: 'Profil', icon: UserCircle },
];

const VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];

const unwrap = <T,>(res: any): T => (res?.data?.data ?? res?.data ?? res) as T;

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
        {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx('relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600')}
      >
        <span className={clsx('inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:border-emerald-500 focus:outline-none';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700';

/** Text + optional media, shared by channel, status, group and scheduling forms. */
function ContentEditor({ value, onChange, withStatusStyle }: { value: any; onChange: (v: any) => void; withStatusStyle?: boolean }) {
  return (
    <div className="space-y-3">
      <Field label="Texte">
        <textarea rows={4} className={inputCls} value={value.text || ''} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="Votre message…" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Média (URL publique)" hint="Image, vidéo, document ou audio">
          <input className={inputCls} value={value.mediaUrl || ''} onChange={(e) => onChange({ ...value, mediaUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Type de média">
          <select className={inputCls} value={value.mediaType || 'image'} onChange={(e) => onChange({ ...value, mediaType: e.target.value })}>
            <option value="image">Image</option><option value="video">Vidéo</option><option value="document">Document</option><option value="audio">Audio</option>
          </select>
        </Field>
        <Field label="Nom de fichier (documents)">
          <input className={inputCls} value={value.fileName || ''} onChange={(e) => onChange({ ...value, fileName: e.target.value })} />
        </Field>
      </div>
      {withStatusStyle && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Couleur de fond (statut texte)">
            <input type="color" className="h-10 w-full rounded-lg border border-gray-200 dark:border-gray-600" value={value.backgroundColor || '#1B5E20'} onChange={(e) => onChange({ ...value, backgroundColor: e.target.value })} />
          </Field>
          <Field label="Police (0-5)">
            <input type="number" min={0} max={5} className={inputCls} value={value.font ?? 0} onChange={(e) => onChange({ ...value, font: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </div>
  );
}

const toMediaPayload = (c: any) => ({
  text: c.text || undefined,
  media: c.mediaUrl ? { url: c.mediaUrl, type: c.mediaType || 'image', caption: c.text || undefined, fileName: c.fileName || undefined } : undefined,
  backgroundColor: c.backgroundColor,
  font: c.font,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WhatsAppAutomationPage() {
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [tab, setTab] = useState<Tab>((searchParams?.get('tab') as Tab) || 'automation');
  const [loading, setLoading] = useState(true);

  const base = useMemo(() => (sessionId ? `/whatsapp/sessions/${sessionId}` : ''), [sessionId]);
  const session = sessions.find((s) => s.id === sessionId);
  const connected = session?.status === 'connected';

  useEffect(() => {
    api.get('/whatsapp/sessions').then((res) => {
      const list = unwrap<Session[]>(res) || [];
      setSessions(Array.isArray(list) ? list : []);
      const wanted = searchParams?.get('session');
      const first = (Array.isArray(list) ? list : []).find((s) => s.id === wanted) || (Array.isArray(list) ? list : [])[0];
      if (first) setSessionId(first.id);
    }).finally(() => setLoading(false));
  }, [searchParams]);

  if (loading) return <div className="p-8 flex items-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Chargement…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Automatisations WhatsApp</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Chaînes, statuts, groupes, sondages et comportements automatiques — par session.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={inputCls + ' md:w-72'} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.status === 'connected' ? '● connectée' : '○ ' + s.status}</option>)}
          </select>
        </div>
      </div>

      {!sessions.length && <div className="p-6 rounded-xl bg-amber-50 text-amber-800">Aucune session WhatsApp. Créez-en une d'abord.</div>}

      {sessionId && (
        <>
          {!connected && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
              Cette session n'est pas connectée : les réglages sont modifiables, mais les actions (publier, créer, envoyer) échoueront tant qu'elle n'est pas en ligne.
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px', tab === t.id ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
                <t.icon className="w-4 h-4" /> {t.name}
              </button>
            ))}
          </div>

          {tab === 'automation' && <AutomationTab base={base} />}
          {tab === 'channels' && <ChannelsTab base={base} />}
          {tab === 'status' && <StatusTab base={base} />}
          {tab === 'scheduled' && <ScheduledTab base={base} />}
          {tab === 'groups' && <GroupsTab base={base} />}
          {tab === 'polls' && <PollsTab base={base} />}
          {tab === 'profile' && <ProfileTab base={base} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automation settings
// ---------------------------------------------------------------------------

function AutomationTab({ base }: { base: string }) {
  const [settings, setSettings] = useState<Automation>({});
  const [labels, setLabels] = useState<Array<{ labelId: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`${base}/automation`).then((r) => setSettings(unwrap<Automation>(r) || {}));
    api.get(`${base}/labels`).then((r) => setLabels(unwrap<any[]>(r) || [])).catch(() => {});
  }, [base]);

  const save = async () => {
    setSaving(true);
    const res = await api.put(`${base}/automation`, settings);
    setSaving(false);
    if (res.success) toast.success('Réglages enregistrés'); else toast.error(res.error || 'Échec');
  };

  const voice = settings.voiceReplies || { enabled: false };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Eye className="w-4 h-4" /> Conversation</h3>
        <Toggle label="Accusés de lecture automatiques" hint="Marque lus (✓✓ bleus) les messages traités par la plateforme." checked={!!settings.autoRead} onChange={(v) => setSettings({ ...settings, autoRead: v })} />
        <Toggle label="Suivi de présence" hint="Mémorise la dernière présence connue des contacts (en ligne, vu à…)." checked={!!settings.presenceTracking} onChange={(v) => setSettings({ ...settings, presenceTracking: v })} />
        <div className="py-3 space-y-2">
          <Field label="Réaction d'accusé de réception" hint="Emoji envoyé en réaction à chaque message reçu. Vide = désactivé.">
            <input className={inputCls} maxLength={8} value={settings.acknowledgeReaction || ''} onChange={(e) => setSettings({ ...settings, acknowledgeReaction: e.target.value })} placeholder="👍" />
          </Field>
          <Field label="Étiquette à la création d'une conversation">
            <select className={inputCls} value={settings.labelOnNewConversation || ''} onChange={(e) => setSettings({ ...settings, labelOnNewConversation: e.target.value || undefined })}>
              <option value="">— aucune —</option>
              {labels.map((l) => <option key={l.labelId} value={l.labelId}>{l.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Phone className="w-4 h-4" /> Appels</h3>
        <Toggle label="Rejeter automatiquement les appels" hint="Appels vocaux et vidéo refusés dès réception." checked={!!settings.rejectCalls} onChange={(v) => setSettings({ ...settings, rejectCalls: v })} />
        <div className="py-3">
          <Field label="Message envoyé après un appel refusé" hint="Une fois par appelant et par 24 h. Vide = aucun message.">
            <textarea rows={3} className={inputCls} value={settings.rejectCallsMessage || ''} onChange={(e) => setSettings({ ...settings, rejectCallsMessage: e.target.value })} placeholder="Nous ne prenons pas les appels sur ce numéro, écrivez-nous ici 🙂" />
          </Field>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Mic className="w-4 h-4" /> Réponses vocales</h3>
        <Toggle label="Répondre en note vocale" hint="L'IA répond en audio (synthèse vocale OpenAI) au lieu du texte." checked={!!voice.enabled} onChange={(v) => setSettings({ ...settings, voiceReplies: { ...voice, enabled: v } })} />
        <Toggle label="Seulement si le client a envoyé un vocal" checked={!!voice.onlyWhenClientUsesVoice} onChange={(v) => setSettings({ ...settings, voiceReplies: { ...voice, onlyWhenClientUsesVoice: v } })} />
        <div className="py-3">
          <Field label="Voix">
            <select className={inputCls} value={voice.voice || 'alloy'} onChange={(e) => setSettings({ ...settings, voiceReplies: { ...voice, voice: e.target.value } })}>
              {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Shield className="w-4 h-4" /> Confidentialité</h3>
        <div className="py-3">
          <Field label="Messages éphémères par défaut" hint="Appliqué aux nouvelles conversations.">
            <select className={inputCls} value={settings.disappearingSeconds ?? 0} onChange={(e) => setSettings({ ...settings, disappearingSeconds: Number(e.target.value) })}>
              <option value={0}>Désactivé</option><option value={86400}>24 heures</option><option value={604800}>7 jours</option><option value={7776000}>90 jours</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="lg:col-span-2 flex justify-end">
        <button className={btnPrimary} onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Enregistrer</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

function ChannelsTab({ base }: { base: string }) {
  const [channelId, setChannelId] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('wa:channel') || '' : ''));
  const [channel, setChannel] = useState<any>(null);
  const [content, setContent] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [known, setKnown] = useState<any[]>([]);

  const loadKnown = useCallback(() => {
    api.get(`${base}/channels`).then((r) => setKnown(unwrap<any[]>(r) || [])).catch(() => {});
  }, [base]);
  useEffect(() => { loadKnown(); }, [loadKnown]);

  const load = useCallback(async () => {
    if (!channelId) return;
    const res = await api.get(`${base}/channels/${encodeURIComponent(channelId)}`);
    if (res.success) { setChannel(unwrap(res)); try { localStorage.setItem('wa:channel', channelId); } catch {} }
    else toast.error(res.error || 'Chaîne introuvable');
  }, [base, channelId]);

  const publish = async () => {
    if (!channel?.id) return toast.error('Chargez une chaîne d\'abord');
    setBusy(true);
    const res = await api.post(`${base}/channels/${encodeURIComponent(channel.id)}/publish`, toMediaPayload(content));
    setBusy(false);
    if (res.success) { toast.success('Publié sur la chaîne'); setContent({}); } else toast.error(res.error || 'Échec de publication');
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await api.post(`${base}/channels`, { name: newName.trim(), description: newDesc.trim() || undefined });
    setBusy(false);
    if (res.success) { const c = unwrap<any>(res); toast.success('Chaîne créée'); setChannel(c); setChannelId(c.id); setNewName(''); setNewDesc(''); loadKnown(); }
    else toast.error(res.error || 'Échec de création');
  };

  const loadHistory = async () => {
    if (!channel?.id) return;
    const res = await api.get(`${base}/channels/${encodeURIComponent(channel.id)}/messages?count=20`);
    if (res.success) setHistory(unwrap<any>(res)?.messages || unwrap<any>(res) || []); else toast.error(res.error || 'Historique indisponible');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Chaîne</h3>
          <Field label="JID ou lien d'invitation" hint="Ex. 120363…@newsletter ou https://whatsapp.com/channel/…">
            <input className={inputCls} value={channelId} onChange={(e) => setChannelId(e.target.value)} />
          </Field>
          <button className={btnGhost} onClick={load}><LinkIcon className="w-4 h-4" /> Charger</button>
          {channel && (
            <div className="text-sm space-y-1 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="font-medium text-gray-900 dark:text-white">{channel.name}</div>
              <div className="text-gray-500">{channel.subscribers} abonné(s) · rôle : {channel.role || '?'}</div>
              {channel.inviteLink && <a className="text-emerald-600 text-xs" href={channel.inviteLink} target="_blank" rel="noreferrer">{channel.inviteLink}</a>}
              <div className="text-xs text-gray-400 break-all">{channel.id}</div>
            </div>
          )}
        </div>
        {channel?.id && <ChannelAdminsPanel base={base} channel={channel} />}
        {known.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900 dark:text-white">Chaînes connues</h3><button className={btnGhost} onClick={loadKnown}><RefreshCw className="w-4 h-4" /></button></div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
              {known.map((c: any) => (
                <li key={c.id}>
                  <button className={clsx('w-full text-left py-2', channel?.id === c.id ? 'text-emerald-600' : 'text-gray-700 dark:text-gray-300')} onClick={() => { setChannelId(c.id); setChannel(c.error ? null : c); }}>
                    {c.name || c.id.split('@')[0]} {c.subscribers !== undefined && !c.error && <span className="text-xs text-gray-400">· {c.subscribers} abonné(s) · {c.role || ''}</span>}
                    {c.error && <span className="text-xs text-red-500"> · indisponible</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Créer une chaîne</h3>
          <input className={inputCls} placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className={inputCls} placeholder="Description (optionnel)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <button className={btnPrimary} onClick={create} disabled={busy || !newName.trim()}><Plus className="w-4 h-4" /> Créer</button>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Publier maintenant</h3>
          <ContentEditor value={content} onChange={setContent} />
          <div className="flex justify-end">
            <button className={btnPrimary} onClick={publish} disabled={busy || !channel}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publier</button>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Dernières publications</h3>
            <button className={btnGhost} onClick={loadHistory} disabled={!channel}><RefreshCw className="w-4 h-4" /> Charger</button>
          </div>
          {!history.length ? <p className="text-sm text-gray-400">Rien à afficher.</p> : (
            <ul className="space-y-2 text-sm">
              {history.map((m: any, i: number) => (
                <li key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="text-gray-900 dark:text-white whitespace-pre-wrap">{m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || '[média]'}</div>
                  <div className="text-xs text-gray-400 mt-1">{m.reactions?.length ? `${m.reactions.length} réaction(s)` : ''} {m.views_count ? `· ${m.views_count} vues` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelAdminsPanel({ base, channel }: { base: string; channel: any }) {
  const [info, setInfo] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const url = `${base}/channels/${encodeURIComponent(channel.id)}`;

  const refresh = useCallback(() => {
    api.get(`${url}/admins`).then((r) => setInfo(r.success ? unwrap(r) : null)).catch(() => setInfo(null));
  }, [url]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (path: string, body: any, okMsg: string) => {
    if (!phone.trim()) return toast.error('Indiquez un numéro WhatsApp');
    setBusy(true);
    const res = await api.post(`${url}/${path}`, body);
    setBusy(false);
    if (res.success) { toast.success(okMsg); setPhone(''); setMessage(''); refresh(); } else toast.error(res.error || 'Refusé par WhatsApp');
  };

  const canManage = info?.canManage !== false;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Shield className="w-4 h-4" /> Administrateurs</h3>
        <button className={btnGhost} onClick={refresh}><RefreshCw className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-gray-500">
        {info?.adminCount != null ? `${info.adminCount} / ${info.maxAdmins} administrateur(s)` : 'Nombre indisponible'} · votre rôle : {info?.role || channel.role || '?'}
      </p>
      {!canManage && <p className="text-xs text-amber-600">Seul le propriétaire de la chaîne peut inviter ou rétrograder des administrateurs.</p>}
      <Field label="Numéro WhatsApp" hint="Format international, ex. 237690000000. La personne reçoit une invitation à accepter sur son téléphone (valable 7 jours).">
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2376…" disabled={!canManage} />
      </Field>
      <Field label="Message d'accompagnement (optionnel)">
        <input className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} disabled={!canManage} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy || !canManage} onClick={() => run('admins/invite', { phone: phone.trim(), message: message.trim() || undefined }, 'Invitation envoyée, en attente d\'acceptation')}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Inviter comme admin
        </button>
        <button className={btnGhost} disabled={busy || !canManage} onClick={() => run('admins/demote', { phone: phone.trim() }, 'Administrateur rétrogradé')}>
          <XCircle className="w-4 h-4" /> Rétrograder
        </button>
        <button className={clsx(btnGhost, 'text-red-600')} disabled={busy || !canManage} onClick={() => { if (window.confirm(`Transférer la propriété de la chaîne à ${phone.trim()} ? Vous resterez administrateur mais ne pourrez plus la supprimer ni gérer ses admins.`)) run('owner', { phone: phone.trim() }, 'Propriété transférée'); }}>
          <Users className="w-4 h-4" /> Transférer la propriété
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

function AudiencePicker({ base, value, onChange }: { base: string; value: any; onChange: (v: any) => void }) {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    if (value.type === 'jids') { setSize((value.jids || []).length); return; }
    api.get(`${base}/status/audience-size?type=${value.type}${value.tags ? `&tags=${encodeURIComponent(value.tags)}` : ''}`).then((r) => setSize(unwrap<any>(r)?.viewers ?? null)).catch(() => setSize(null));
  }, [base, value.type, value.tags, value.jids]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[['optin', 'Liste opt-in'], ['contacts', 'Tous les contacts'], ['jids', 'Liste manuelle']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => onChange({ ...value, type: k })} className={clsx('px-3 py-2 rounded-lg border text-sm', value.type === k ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300')}>{label}</button>
        ))}
      </div>
      {value.type === 'optin' && (
        <Field label="Restreindre aux tags (séparés par des virgules)" hint="Vide = tous les abonnés de la liste opt-in.">
          <input className={inputCls} value={value.tags || ''} onChange={(e) => onChange({ ...value, tags: e.target.value })} placeholder="sino,client" />
        </Field>
      )}
      {value.type === 'jids' && (
        <Field label="Numéros (un par ligne)">
          <textarea rows={4} className={inputCls} value={(value.jids || []).join('\n')} onChange={(e) => onChange({ ...value, jids: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
      )}
      <p className="text-xs text-gray-500">Audience estimée : <strong>{size === null ? '…' : size}</strong> contact(s). Seuls ceux qui ont enregistré votre numéro verront le statut.</p>
    </div>
  );
}

function StatusTab({ base }: { base: string }) {
  const [content, setContent] = useState<any>({});
  const [audience, setAudience] = useState<any>({ type: 'optin' });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);

  const publish = async () => {
    setBusy(true);
    const res = await api.post(`${base}/status`, { ...toMediaPayload(content), audience: { type: audience.type, jids: audience.jids, tags: audience.tags ? audience.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined } });
    setBusy(false);
    if (res.success) { setLast(unwrap(res)); toast.success('Statut publié'); setContent({}); } else toast.error(res.error || 'Échec');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Contenu</h3>
        <ContentEditor value={content} onChange={setContent} withStatusStyle />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Audience</h3>
        <AudiencePicker base={base} value={audience} onChange={setAudience} />
        <div className="flex justify-end pt-2">
          <button className={btnPrimary} onClick={publish} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Publier le statut</button>
        </div>
        {last && <p className="text-xs text-emerald-600">Publié vers {last.viewers} contact(s) en {last.batches} lot(s).</p>}
        <p className="text-xs text-gray-400">Un statut est chiffré pour chaque destinataire : comptez quelques secondes par centaine de contacts. Il expire après 24 h.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled posts
// ---------------------------------------------------------------------------

function ScheduledTab({ base }: { base: string }) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [kind, setKind] = useState<'channel' | 'status' | 'group' | 'chat'>('channel');
  const [target, setTarget] = useState('');
  const [content, setContent] = useState<any>({});
  const [audience, setAudience] = useState<any>({ type: 'optin' });
  const [when, setWhen] = useState('');
  const [cron, setCron] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`${base}/scheduled-posts`).then((r) => setPosts(unwrap<ScheduledPost[]>(r) || [])), [base]);
  useEffect(() => { load(); }, [load]);

  const schedule = async () => {
    if (!when) return toast.error('Choisissez une date');
    setBusy(true);
    const res = await api.post(`${base}/scheduled-posts`, {
      kind, target: kind === 'status' ? undefined : target,
      ...toMediaPayload(content),
      audience: kind === 'status' ? { type: audience.type, jids: audience.jids, tags: audience.tags ? audience.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined } : undefined,
      scheduledAt: new Date(when).toISOString(), cron: cron.trim() || undefined,
    });
    setBusy(false);
    if (res.success) { toast.success('Publication programmée'); setContent({}); setWhen(''); setCron(''); load(); } else toast.error(res.error || 'Échec');
  };

  const cancel = async (id: string) => { const r = await api.delete(`${base}/scheduled-posts/${id}`); if (r.success) { toast.success('Annulée'); load(); } else toast.error(r.error || 'Échec'); };
  const runNow = async (id: string) => { const r = await api.post(`${base}/scheduled-posts/${id}/run`); if (r.success) { toast.success('Publiée'); load(); } else toast.error(r.error || 'Échec'); };

  const statusCls: Record<string, string> = { scheduled: 'bg-blue-100 text-blue-700', running: 'bg-amber-100 text-amber-700', done: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-600' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Programmer</h3>
        <Field label="Type">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="channel">Chaîne</option><option value="status">Statut</option><option value="group">Groupe</option><option value="chat">Conversation</option>
          </select>
        </Field>
        {kind !== 'status' && (
          <Field label={kind === 'channel' ? 'JID de la chaîne' : kind === 'group' ? 'ID du groupe' : 'Numéro du contact'}>
            <input className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        )}
        {kind === 'status' && <AudiencePicker base={base} value={audience} onChange={setAudience} />}
        <ContentEditor value={content} onChange={setContent} withStatusStyle={kind === 'status'} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date et heure"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Récurrence (cron, optionnel)" hint='Ex. "0 9 * * 1" = lundi 9 h'><input className={inputCls} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1" /></Field>
        </div>
        <div className="flex justify-end"><button className={btnPrimary} onClick={schedule} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Programmer</button></div>
      </div>
      <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-gray-900 dark:text-white">Publications</h3><button className={btnGhost} onClick={load}><RefreshCw className="w-4 h-4" /></button></div>
        {!posts.length ? <p className="text-sm text-gray-400">Aucune publication programmée.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {posts.map((p) => (
              <li key={p.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs', statusCls[p.status] || 'bg-gray-100')}>{p.status}</span>
                    <span className="font-medium text-gray-900 dark:text-white capitalize">{p.kind}</span>
                    {p.target && <span className="text-xs text-gray-400 truncate">{p.target}</span>}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{p.content?.text || p.content?.mediaUrl}</div>
                  <div className="text-xs text-gray-400">{new Date(p.scheduledAt).toLocaleString('fr-FR')} {p.cron ? `· cron ${p.cron}` : ''} {p.error ? `· ${p.error}` : ''}</div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {p.status !== 'done' && p.status !== 'cancelled' && <button className={btnGhost} title="Publier maintenant" onClick={() => runNow(p.id)}><Play className="w-4 h-4" /></button>}
                  {p.status !== 'done' && p.status !== 'cancelled' && <button className={btnGhost} title="Annuler" onClick={() => cancel(p.id)}><XCircle className="w-4 h-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function GroupsTab({ base }: { base: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newMembers, setNewMembers] = useState('');
  const [message, setMessage] = useState<any>({});
  const [invite, setInvite] = useState<string | null>(null);
  const [requests, setRequests] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.get(`${base}/groups`);
    setLoading(false);
    if (r.success) setGroups(unwrap<Group[]>(r) || []); else toast.error(r.error || 'Groupes indisponibles');
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>, ok: string) => { const r = await fn(); if (r.success) { toast.success(ok); load(); if (selected) refresh(selected.id); } else toast.error(r.error || 'Échec'); };
  const refresh = async (id: string) => { const r = await api.get(`${base}/groups/${encodeURIComponent(id)}`); if (r.success) setSelected(unwrap(r)); };
  const participants = (txt: string) => txt.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-gray-900 dark:text-white">Mes groupes ({groups.length})</h3><button className={btnGhost} onClick={load}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button></div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {groups.map((g) => (
              <li key={g.id}><button onClick={() => { setSelected(g); setInvite(null); setRequests([]); }} className={clsx('w-full text-left py-2 text-sm', selected?.id === g.id ? 'text-emerald-600' : 'text-gray-700 dark:text-gray-300')}>{g.subject} <span className="text-xs text-gray-400">· {g.size}</span></button></li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Créer un groupe</h3>
          <input className={inputCls} placeholder="Nom du groupe" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
          <textarea rows={3} className={inputCls} placeholder="Membres (numéros, un par ligne)" value={newMembers} onChange={(e) => setNewMembers(e.target.value)} />
          <button className={btnPrimary} disabled={!newSubject || !participants(newMembers).length} onClick={() => act(() => api.post(`${base}/groups`, { subject: newSubject, participants: participants(newMembers) }), 'Groupe créé')}><Plus className="w-4 h-4" /> Créer</button>
          <p className="text-xs text-gray-400">Ajoutez des personnes qui vous connaissent : les ajouts massifs d'inconnus font bannir le numéro.</p>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-4">
        {!selected ? <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-gray-400 text-sm">Sélectionnez un groupe.</div> : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-semibold text-gray-900 dark:text-white">{selected.subject}</h3><p className="text-xs text-gray-400 break-all">{selected.id}</p>{selected.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{selected.description}</p>}</div>
                <button className={btnGhost} onClick={() => act(() => api.delete(`${base}/groups/${encodeURIComponent(selected.id)}`), 'Groupe quitté')}><Trash2 className="w-4 h-4" /> Quitter</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <Toggle label="Admins seuls écrivent" checked={selected.announcementOnly} onChange={(v) => act(() => api.put(`${base}/groups/${encodeURIComponent(selected.id)}`, { announcementOnly: v }), 'Réglage appliqué')} />
                <Toggle label="Infos verrouillées" checked={selected.locked} onChange={(v) => act(() => api.put(`${base}/groups/${encodeURIComponent(selected.id)}`, { locked: v }), 'Réglage appliqué')} />
                <Toggle label="Approbation des entrées" checked={selected.joinApproval} onChange={(v) => act(() => api.put(`${base}/groups/${encodeURIComponent(selected.id)}`, { joinApproval: v }), 'Réglage appliqué')} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnGhost} onClick={async () => { const r = await api.get(`${base}/groups/${encodeURIComponent(selected.id)}/invite`); if (r.success) setInvite(unwrap<any>(r).link); else toast.error(r.error || 'Échec'); }}><LinkIcon className="w-4 h-4" /> Lien d'invitation</button>
                <button className={btnGhost} onClick={async () => { const r = await api.get(`${base}/groups/${encodeURIComponent(selected.id)}/invite?revoke=true`); if (r.success) { setInvite(unwrap<any>(r).link); toast.success('Ancien lien révoqué'); } else toast.error(r.error || 'Échec'); }}>Révoquer le lien</button>
                <button className={btnGhost} onClick={async () => { const r = await api.get(`${base}/groups/${encodeURIComponent(selected.id)}/requests`); if (r.success) setRequests(unwrap<any[]>(r) || []); else toast.error(r.error || 'Échec'); }}>Demandes d'adhésion</button>
              </div>
              {invite && <p className="text-xs text-emerald-600 break-all">{invite}</p>}
              {requests.length > 0 && (
                <ul className="text-sm space-y-1">
                  {requests.map((r: any) => (
                    <li key={r.jid} className="flex items-center justify-between"><span>{r.jid}</span><span className="flex gap-1"><button className={btnGhost} onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/requests`, { participants: [r.jid], action: 'approve' }), 'Approuvé')}>Approuver</button><button className={btnGhost} onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/requests`, { participants: [r.jid], action: 'reject' }), 'Refusé')}>Refuser</button></span></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Membres ({selected.participants.length})</h3>
              <ul className="max-h-48 overflow-y-auto text-sm divide-y divide-gray-100 dark:divide-gray-700">
                {selected.participants.map((p) => (
                  <li key={p.id} className="py-1.5 flex items-center justify-between"><span className="text-gray-700 dark:text-gray-300">{p.id.split('@')[0]} {p.admin && <span className="text-xs text-emerald-600">({p.admin})</span>}</span>
                    <span className="flex gap-1">
                      <button className="text-xs text-gray-500 hover:text-emerald-600" onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/participants`, { participants: [p.id], action: p.admin ? 'demote' : 'promote' }), 'Fait')}>{p.admin ? 'Rétrograder' : 'Promouvoir'}</button>
                      <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/participants`, { participants: [p.id], action: 'remove' }), 'Retiré')}>Retirer</button>
                    </span></li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Ajouter des numéros (virgules)" value={members} onChange={(e) => setMembers(e.target.value)} />
                <button className={btnPrimary} disabled={!participants(members).length} onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/participants`, { participants: participants(members), action: 'add' }), 'Ajouté(s)').then(() => setMembers(''))}><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Publier dans le groupe</h3>
              <ContentEditor value={message} onChange={setMessage} />
              <div className="flex justify-end"><button className={btnPrimary} onClick={() => act(() => api.post(`${base}/groups/${encodeURIComponent(selected.id)}/messages`, toMediaPayload(message)), 'Envoyé').then(() => setMessage({}))}><Send className="w-4 h-4" /> Envoyer</button></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

function PollsTab({ base }: { base: string }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [chat, setChat] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`${base}/polls`).then((r) => setPolls(unwrap<Poll[]>(r) || [])), [base]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const opts = options.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!chat || !question || opts.length < 2) return toast.error('Destinataire, question et au moins 2 options');
    setBusy(true);
    const r = await api.post(`${base}/messages/poll`, { chat, question, options: opts, selectableCount: multi ? 0 : 1 });
    setBusy(false);
    if (r.success) { toast.success('Sondage envoyé'); setQuestion(''); setOptions(''); load(); } else toast.error(r.error || 'Échec');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Nouveau sondage</h3>
        <Field label="Destinataire (numéro ou id de groupe)"><input className={inputCls} value={chat} onChange={(e) => setChat(e.target.value)} /></Field>
        <Field label="Question"><input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="Options (une par ligne, 2 à 12)"><textarea rows={4} className={inputCls} value={options} onChange={(e) => setOptions(e.target.value)} /></Field>
        <Toggle label="Choix multiples" checked={multi} onChange={setMulti} />
        <div className="flex justify-end"><button className={btnPrimary} onClick={send} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer</button></div>
      </div>
      <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-gray-900 dark:text-white">Résultats</h3><button className={btnGhost} onClick={load}><RefreshCw className="w-4 h-4" /></button></div>
        {!polls.length ? <p className="text-sm text-gray-400">Aucun sondage.</p> : polls.map((p) => {
          const total = Math.max(1, p.voterCount);
          return (
            <div key={p.id} className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div className="flex justify-between text-sm"><span className="font-medium text-gray-900 dark:text-white">{p.question}</span><span className="text-xs text-gray-400">{p.voterCount} vote(s) · {p.chatJid.split('@')[0]}</span></div>
              <div className="mt-2 space-y-1">
                {p.options.map((o) => { const n = (p.votes?.[o] || []).length; return (
                  <div key={o} className="text-xs">
                    <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>{o}</span><span>{n}</span></div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full"><div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${Math.round((n / total) * 100)}%` }} /></div>
                  </div>
                ); })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileTab({ base }: { base: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [blockTarget, setBlockTarget] = useState('');

  const load = useCallback(async () => {
    const r = await api.get(`${base}/profile`);
    if (r.success) { const p = unwrap<any>(r); setProfile(p); setName(p?.name || ''); setAbout(p?.about || ''); }
    const b = await api.get(`${base}/contacts/blocklist`); if (b.success) setBlocklist(unwrap<string[]>(b) || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    const r = await api.put(`${base}/profile`, { name: name || undefined, about, pictureUrl: pictureUrl || undefined });
    setBusy(false);
    if (r.success) { toast.success('Profil mis à jour'); setPictureUrl(''); load(); } else toast.error(r.error || 'Échec');
  };
  const block = async (contact: string, value: boolean) => { const r = await api.post(`${base}/contacts/block`, { contact, block: value }); if (r.success) { toast.success(value ? 'Bloqué' : 'Débloqué'); setBlockTarget(''); load(); } else toast.error(r.error || 'Échec'); };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Profil WhatsApp</h3>
        {profile?.pictureUrl && <img src={profile.pictureUrl} alt="" className="w-20 h-20 rounded-full object-cover" />}
        <Field label="Nom affiché"><input className={inputCls} maxLength={25} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="À propos"><input className={inputCls} maxLength={139} value={about} onChange={(e) => setAbout(e.target.value)} /></Field>
        <Field label="Nouvelle photo (URL)"><input className={inputCls} value={pictureUrl} onChange={(e) => setPictureUrl(e.target.value)} placeholder="https://…/photo.jpg" /></Field>
        <div className="flex justify-end"><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Enregistrer</button></div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Shield className="w-4 h-4" /> Contacts bloqués ({blocklist.length})</h3>
        <div className="flex gap-2"><input className={inputCls} placeholder="Numéro à bloquer" value={blockTarget} onChange={(e) => setBlockTarget(e.target.value)} /><button className={btnPrimary} disabled={!blockTarget} onClick={() => block(blockTarget, true)}>Bloquer</button></div>
        <ul className="max-h-64 overflow-y-auto text-sm divide-y divide-gray-100 dark:divide-gray-700">
          {blocklist.map((j) => <li key={j} className="py-1.5 flex justify-between"><span>{j.split('@')[0]}</span><button className="text-xs text-gray-500 hover:text-emerald-600" onClick={() => block(j, false)}>Débloquer</button></li>)}
        </ul>
      </div>
    </div>
  );
}
