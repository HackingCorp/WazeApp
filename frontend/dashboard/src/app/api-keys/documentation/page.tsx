'use client';

import { useI18n } from '@/providers/I18nProvider';
import { ArrowLeft, Copy, Check, ExternalLink, ClipboardCopy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// Version texte/markdown complète de la documentation, pour le bouton
// « Copier toute la documentation ».
const FULL_DOCUMENTATION = `# Documentation API Externe WazeApp

URL de base: https://api.wazeapp.ai/api/v1/external

## Authentification
Toutes les requêtes nécessitent une clé API dans le header X-API-Key:
  curl -X GET https://api.wazeapp.ai/api/v1/external/health -H "X-API-Key: wz_live_votre_cle_api"

Chaque clé API est liée à une seule session WhatsApp : le sessionId n'a pas besoin d'être fourni, il est déterminé automatiquement par la clé.

## Endpoints principaux

### GET /health
Vérifie l'état de l'API.

### POST /send  (permission: send:message)
Envoyer des messages à un ou plusieurs destinataires.
Body (message personnalisé):
{
  "recipients": ["+237612345678"],
  "message": { "type": "text", "text": "Bonjour!" },
  "idempotencyKey": "colis-12345-rappel-7"
}
Champs optionnels: delayMs (défaut 3000), idempotencyKey (fortement recommandé, voir Idempotence).
Types supportés: text, image, video, audio, document.

### POST /send/immediate  (permission: send:message)
Envoyer un message immédiatement (un seul destinataire). Si la session est déconnectée, le message est mis en file d'attente.
Body:
{ "to": "+237612345678", "message": "Bonjour!", "type": "text", "idempotencyKey": "colis-12345-rappel-7" }

## Idempotence & déduplication
Pour éviter qu'un client reçoive plusieurs fois la même notification, ajoutez une clé idempotencyKey sur /send et /send/immediate.
- Clé stable et unique par notification logique (ex: colis-12345-rappel-7).
- Tout appel répété avec la même clé pour le même destinataire dans les 24h est dédupliqué (statut "deduplicated").
- Indépendant du contenu: fonctionne même si le texte change (URL de suivi dynamique, numéro de rappel...).
- Sans idempotencyKey: repli par hash du contenu sur 5 minutes seulement.
Format de clé recommandé: <type>-<id>-<étape>, ex: colis-12345-rappel-7, commande-987-confirmation.

### POST /validate-numbers  (permission: send:message)
Valider si des numéros sont enregistrés sur WhatsApp. Maximum 100 numéros par requête.

## Contacts
- GET /contacts — lister les contacts
- POST /contacts — créer un contact

## Templates
- GET /templates — lister les templates
- GET /templates/:id — obtenir un template

## Campagnes
- GET /campaigns, GET /campaigns/:id, GET /campaigns/:id/stats
- POST /campaigns — créer
- POST /campaigns/:id/start | /pause | /cancel

## Webhooks
- GET /webhooks — lister les webhooks configurés
Événements: message.sent, message.delivered, message.read, message.failed.

## Limites
Respectez un délai minimum de 3 secondes entre les messages. Limite par destinataire: 100 messages/heure.

## Bonnes pratiques
1. Délai minimum de 3s entre les messages.
2. Validez les numéros WhatsApp avant les campagnes.
3. Vérifiez toujours le statut de la réponse et gérez les erreurs.
4. Envoyez toujours une idempotencyKey stable pour les notifications automatisées (rappels, confirmations).
`;

export default function ApiDocumentationPage() {
  const { t } = useI18n();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({ code, id, language = 'bash' }: { code: string; id: string; language?: string }) => (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copiedCode === id ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-300" />
        )}
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/api-keys"
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux clés API
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Documentation API Externe
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Guide complet pour utiliser l'API WazeApp
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(FULL_DOCUMENTATION, 'full-doc')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition self-start shrink-0"
          >
            {copiedCode === 'full-doc' ? (
              <>
                <Check className="w-4 h-4" /> Copié !
              </>
            ) : (
              <>
                <ClipboardCopy className="w-4 h-4" /> Copier toute la documentation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Base URL */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">URL de base</h2>
          <CodeBlock
            code="https://api.wazeapp.ai/api/v1/external"
            id="base-url"
          />
        </section>

        {/* Authentication */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Authentification</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Toutes les requêtes API nécessitent une clé API dans le header <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">X-API-Key</code>:
          </p>
          <CodeBlock
            code={`curl -X GET https://api.wazeapp.ai/api/v1/external/health \\
  -H "X-API-Key: wz_live_votre_cle_api"`}
            id="auth-example"
          />
        </section>

        {/* API Key = Session */}
        <section className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6">
          <h2 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-4">🔐 Clé API = Session WhatsApp</h2>
          <p className="text-green-700 dark:text-green-300 mb-4">
            <strong>Important:</strong> Chaque clé API est liée à <strong>une seule session WhatsApp</strong>.
            Cela signifie que:
          </p>
          <ul className="space-y-2 text-green-700 dark:text-green-300 mb-4">
            <li className="flex items-start gap-2">
              <span>•</span>
              <span>Vous n'avez <strong>plus besoin</strong> de spécifier le <code className="bg-green-100 dark:bg-green-800 px-1 rounded">sessionId</code> dans vos requêtes - il est déterminé automatiquement par votre clé API</span>
            </li>
            <li className="flex items-start gap-2">
              <span>•</span>
              <span>Une clé API ne peut envoyer des messages que via sa session WhatsApp assignée</span>
            </li>
            <li className="flex items-start gap-2">
              <span>•</span>
              <span>Pour utiliser plusieurs sessions, créez plusieurs clés API (une par session)</span>
            </li>
          </ul>
          <p className="text-sm text-green-600 dark:text-green-400">
            Vous pouvez assigner ou modifier la session liée à une clé API depuis le <a href="/api-keys" className="underline">tableau de bord des clés API</a>.
          </p>
        </section>

        {/* Permissions */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Permissions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Permission</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-300">
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">send:message</code></td>
                  <td className="py-3 px-4">Envoyer des messages WhatsApp</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">contacts:read</code></td>
                  <td className="py-3 px-4">Lire la liste des contacts</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">contacts:write</code></td>
                  <td className="py-3 px-4">Créer/modifier des contacts</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">templates:read</code></td>
                  <td className="py-3 px-4">Lire les templates</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">campaigns:read</code></td>
                  <td className="py-3 px-4">Lire les campagnes</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">campaigns:write</code></td>
                  <td className="py-3 px-4">Créer/gérer les campagnes</td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">webhooks:manage</code></td>
                  <td className="py-3 px-4">Gérer les webhooks</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Endpoints */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Endpoints</h2>

          {/* Health Check */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /health
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-3">Vérifier le statut de l'API et valider votre clé.</p>
            <CodeBlock
              code={`// Réponse
{
  "success": true,
  "data": {
    "status": "healthy",
    "organizationId": "uuid",
    "permissions": ["send:message", "contacts:read"]
  },
  "timestamp": "2025-01-15T12:00:00.000Z",
  "path": "/api/v1/external/health"
}`}
              id="health-response"
              language="json"
            />
          </div>

          {/* WhatsApp Sessions */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /sessions
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Obtenir les informations de la session WhatsApp liée à votre clé API.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>send:message</code></p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Cet endpoint retourne uniquement la session WhatsApp assignée à votre clé API.
              Vous n'avez <strong>pas besoin de spécifier le sessionId</strong> dans vos requêtes d'envoi.
            </p>
            <CodeBlock
              code={`// Réponse
{
  "success": true,
  "data": {
    "id": "uuid-session",
    "name": "Support Client",
    "phoneNumber": "+237612345678",
    "status": "connected",
    "isConnected": true,
    "isActive": true,
    "lastSeenAt": "2025-01-15T12:00:00.000Z"
  },
  "timestamp": "2025-01-15T12:00:00.000Z",
  "path": "/api/v1/external/sessions"
}`}
              id="sessions-response"
              language="json"
            />
          </div>

          {/* Send Messages */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
              /send
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Envoyer des messages à un ou plusieurs destinataires.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>send:message</code></p>
            <CodeBlock
              code={`// Avec template
{
  "recipients": ["+237612345678", "+237698765432"],
  "templateId": "uuid-template",
  "variables": {
    "nom": "Jean",
    "entreprise": "WazeApp"
  },
  "delayMs": 3000
}

// Avec message personnalisé
{
  "recipients": ["+237612345678"],
  "message": {
    "type": "text",
    "text": "Bonjour! Ceci est un message test."
  },
  "idempotencyKey": "colis-12345-rappel-7"
}

// Note: Le sessionId n'est plus requis - il est déterminé
// automatiquement par votre clé API
// idempotencyKey (optionnel, fortement recommandé): évite les
// doublons — voir la section "Idempotence & déduplication"`}
              id="send-request"
              language="json"
            />
            <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2">Réponse</h4>
            <CodeBlock
              code={`{
  "totalRecipients": 2,
  "queued": 2,
  "failed": 0,
  "results": [
    { "recipient": "+237612345678", "success": true, "status": "queued" },
    { "recipient": "+237698765432", "success": true, "status": "queued" }
  ]
}`}
              id="send-response"
              language="json"
            />
          </div>

          {/* Send Immediate */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
              /send/immediate
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Envoyer un message immédiatement (un seul destinataire).</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>send:message</code></p>
            <CodeBlock
              code={`{
  "to": "+237612345678",
  "message": "Bonjour!",
  "type": "text",
  "idempotencyKey": "colis-12345-rappel-7"
}

// Pour les médias
{
  "to": "+237612345678",
  "type": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Regardez cette image!"
}

// Note: Le sessionId n'est plus requis
// idempotencyKey (optionnel, fortement recommandé) évite les doublons`}
              id="send-immediate"
              language="json"
            />
            <h4 className="text-md font-medium text-gray-800 dark:text-gray-200 mt-4 mb-2">Réponse</h4>
            <CodeBlock
              code={`{
  "success": true,
  "messageId": "3EB0A1B2C3D4E5F6",
  "status": "server_ack"
}

// Statuts possibles:
// "pending"    - Message en cours d'envoi
// "server_ack" - Reçu par le serveur WhatsApp
// "delivered"  - Délivré au destinataire
// "read"       - Lu par le destinataire
// "played"     - Audio/vidéo lu
// "error"      - Erreur d'envoi

// Si la session est déconnectée (avec queueIfDisconnected: true):
{
  "success": true,
  "status": "queued",
  "message": "Session is disconnected. Message queued for delivery when session reconnects.",
  "messageId": "uuid",
  "queuePosition": 3,
  "sessionStatus": "disconnected"
}`}
              id="send-immediate-response"
              language="json"
            />
          </div>

          {/* Idempotency */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              🔁 Idempotence &amp; déduplication
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-3">
              Pour éviter qu&apos;un client reçoive plusieurs fois la même notification, ajoutez une clé{' '}
              <code>idempotencyKey</code> sur <code>/send</code> et <code>/send/immediate</code>.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-600 dark:text-gray-300 mb-3 text-sm">
              <li>Utilisez une clé <strong>stable et unique par notification logique</strong> (ex. <code>colis-12345-rappel-7</code>).</li>
              <li>Tout appel répété avec la <strong>même clé pour le même destinataire dans les 24 h</strong> est dédupliqué : le message n&apos;est envoyé qu&apos;une fois (statut <code>deduplicated</code>).</li>
              <li>La déduplication est <strong>indépendante du contenu</strong> : elle fonctionne même si le texte change (URL de suivi dynamique, numéro de rappel, etc.).</li>
              <li>Sans <code>idempotencyKey</code>, un repli par hash du contenu s&apos;applique sur <strong>5 minutes</strong> seulement — insuffisant si le contenu varie ou si les envois sont espacés.</li>
            </ul>
            <CodeBlock
              code={`// Un rappel renvoyé plusieurs fois n'est livré qu'une seule fois
{
  "recipients": ["+237612345678"],
  "message": {
    "type": "text",
    "text": "Rappel: votre colis vous attend. Suivi: https://kut.es/aB3"
  },
  "idempotencyKey": "colis-12345-rappel-7"
}

// Réponse si un doublon est détecté:
{
  "totalRecipients": 1,
  "queued": 0,
  "failed": 0,
  "results": [
    { "recipient": "+237612345678", "success": true, "status": "deduplicated" }
  ]
}

// Format de clé recommandé: <type>-<id>-<étape>
// ex: colis-12345-rappel-7, commande-987-confirmation`}
              id="idempotency-example"
              language="json"
            />
          </div>

          {/* Validate Phone Numbers */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
              /validate-numbers
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Valider si des numéros de téléphone sont enregistrés sur WhatsApp.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>send:message</code></p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Utilisez cet endpoint pour vérifier si vos contacts ont WhatsApp avant d'envoyer des messages.
              <strong className="text-gray-700 dark:text-gray-300"> Maximum 100 numéros par requête.</strong>
            </p>
            <CodeBlock
              code={`// Requête - sessionId n'est plus requis
{
  "phoneNumbers": [
    "237691371922",
    "237670000000",
    "237699999999"
  ]
}

// Réponse
{
  "success": true,
  "data": {
    "total": 3,
    "valid": 2,
    "invalid": 1,
    "results": [
      {
        "phoneNumber": "237691371922",
        "isValid": true,
        "jid": "237691371922@s.whatsapp.net"
      },
      {
        "phoneNumber": "237670000000",
        "isValid": true,
        "jid": "237670000000@s.whatsapp.net"
      },
      {
        "phoneNumber": "237699999999",
        "isValid": false
      }
    ]
  },
  "timestamp": "2025-01-15T12:00:00.000Z",
  "path": "/api/v1/external/validate-numbers"
}`}
              id="validate-numbers"
              language="json"
            />
          </div>

          {/* Contacts */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /contacts
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Lister les contacts avec filtrage et pagination.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>contacts:read</code></p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Paramètres: <code>page</code>, <code>limit</code>, <code>tags</code>, <code>search</code>, <code>isValidWhatsApp</code>, <code>isSubscribed</code>
            </p>
          </div>

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
              /contacts
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Créer un nouveau contact.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>contacts:write</code></p>
            <CodeBlock
              code={`{
  "phoneNumber": "+237612345678",
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "company": "Acme Inc",
  "tags": ["client"]
}`}
              id="create-contact"
              language="json"
            />
          </div>

          {/* Templates */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /templates
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Lister tous les templates de messages.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>templates:read</code></p>
          </div>

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /templates/:id
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Obtenir un template par son ID.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>templates:read</code></p>
          </div>

          {/* Campaigns */}
          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /campaigns
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Lister toutes les campagnes.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>campaigns:read</code></p>
          </div>

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /campaigns/:id/stats
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Obtenir les statistiques d'une campagne.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>campaigns:read</code></p>
            <CodeBlock
              code={`// Réponse
{
  "success": true,
  "data": {
    "total": 500,
    "sent": 498,
    "delivered": 480,
    "read": 350,
    "failed": 2,
    "deliveryRate": 96.4,
    "readRate": 72.9
  }
}`}
              id="campaign-stats"
              language="json"
            />
          </div>

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
              /campaigns
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Créer une nouvelle campagne.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>campaigns:write</code></p>
            <CodeBlock
              code={`{
  "name": "Campagne Bienvenue",
  "templateId": "uuid",
  "contactFilter": {
    "tags": ["nouveau_client"]
  },
  "delayBetweenMessages": 3000,
  "startImmediately": true
}

// Note: La session utilisée est celle liée à votre clé API`}
              id="create-campaign"
              language="json"
            />
          </div>

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Actions sur les campagnes</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
                <code className="text-gray-700 dark:text-gray-300">/campaigns/:id/start</code>
                <span className="text-gray-500">- Démarrer une campagne</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
                <code className="text-gray-700 dark:text-gray-300">/campaigns/:id/pause</code>
                <span className="text-gray-500">- Mettre en pause</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded">POST</span>
                <code className="text-gray-700 dark:text-gray-300">/campaigns/:id/cancel</code>
                <span className="text-gray-500">- Annuler</span>
              </div>
            </div>
          </div>

          {/* Webhooks */}
          <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
              /webhooks
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-1">Lister les webhooks configurés.</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Permission requise: <code>webhooks:manage</code></p>
          </div>
        </section>

        {/* Delivery tracking */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Suivi de livraison</h2>

          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              <strong>Important :</strong> une réponse <code>200</code> à l&apos;envoi signifie que WhatsApp a
              <strong> accepté</strong> le message, pas qu&apos;il a été <strong>livré</strong>. La livraison est
              confirmée de façon <strong>asynchrone</strong>, quelques secondes plus tard. Un message peut être
              accepté puis échouer à la livraison : c&apos;est le cas typique d&apos;un numéro qui n&apos;a jamais
              écrit à votre session. Utilisez les endpoints ci-dessous pour connaître le sort réel de vos messages.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
                /messages/:messageId/status
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                Statut de livraison d&apos;un message envoyé. Le <code>messageId</code> est celui renvoyé par
                l&apos;envoi. Disponible pendant <strong>24 heures</strong> après l&apos;envoi.
              </p>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "messageId": "3EB0083D9979E67E225D62",
  "sessionId": "8d1b14a0-93fe-40fb-a99b-8f2092199b48",
  "to": "237673261308",
  "status": "delivered",
  "sentAt": "2026-08-14T06:55:05.000Z",
  "deliveredAt": "2026-08-14T06:55:06.000Z",
  "readAt": null,
  "failedAt": null
}`}
              </pre>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">status</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-900 dark:text-white">Signification</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-300">
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 px-3"><code>sent</code></td>
                      <td className="py-2 px-3">Accepté par WhatsApp, livraison pas encore confirmée</td>
                    </tr>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 px-3"><code>delivered</code></td>
                      <td className="py-2 px-3">Reçu sur le téléphone du destinataire (✓✓)</td>
                    </tr>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2 px-3"><code>read</code></td>
                      <td className="py-2 px-3">Lu par le destinataire (✓✓ bleu)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3"><code>failed</code></td>
                      <td className="py-2 px-3">
                        Non livré. Souvent un destinataire qui n&apos;a jamais écrit à votre session, ou un numéro
                        injoignable. Un réessai automatique est déjà tenté en interne.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded">GET</span>
                /delivery-health
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                Compteurs de livraison du jour pour la session liée à votre clé. À surveiller : si
                <code> deliveryRate</code> s&apos;effondre alors que la session est connectée, vos messages ne
                partent plus réellement — inutile de continuer à envoyer.
              </p>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "sessionId": "8d1b14a0-93fe-40fb-a99b-8f2092199b48",
  "sent": 128,
  "delivered": 96,
  "read": 24,
  "failed": 8,
  "deliveryRate": 0.9375,
  "degraded": false
}`}
              </pre>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                <code>deliveryRate</code> vaut <code>null</code> tant que le volume du jour est trop faible pour
                être significatif. <code>degraded: true</code> signale une session connectée qui ne livre plus.
              </p>
            </div>
          </div>
        </section>

        {/* Rate Limits */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Limites</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Plan</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Requêtes/Minute</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Messages/Jour</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-300">
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4 font-medium">Pro</td>
                  <td className="py-3 px-4">60</td>
                  <td className="py-3 px-4">2 000</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Enterprise</td>
                  <td className="py-3 px-4">120</td>
                  <td className="py-3 px-4">5 000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Error Codes */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Codes d'erreur</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Code</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">HTTP</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-300">
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>UNAUTHORIZED</code></td>
                  <td className="py-3 px-4">401</td>
                  <td className="py-3 px-4">Clé API invalide ou manquante</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>FORBIDDEN</code></td>
                  <td className="py-3 px-4">403</td>
                  <td className="py-3 px-4">Permissions insuffisantes</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>NOT_FOUND</code></td>
                  <td className="py-3 px-4">404</td>
                  <td className="py-3 px-4">Ressource non trouvée</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>BAD_REQUEST</code></td>
                  <td className="py-3 px-4">400</td>
                  <td className="py-3 px-4">Données invalides</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>NO_SESSION_ASSIGNED</code></td>
                  <td className="py-3 px-4">400</td>
                  <td className="py-3 px-4">Aucune session WhatsApp n'est liée à cette clé API</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>SESSION_NOT_CONNECTED</code></td>
                  <td className="py-3 px-4">400</td>
                  <td className="py-3 px-4">La session WhatsApp liée n'est pas connectée</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4"><code>COLD_CONTACT_BLOCKED</code></td>
                  <td className="py-3 px-4">400</td>
                  <td className="py-3 px-4">
                    Le destinataire n&apos;a jamais écrit à cette session et le quota quotidien de contacts
                    froids est atteint. Protection anti-restriction WhatsApp — voir Bonnes pratiques.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4"><code>RATE_LIMITED</code></td>
                  <td className="py-3 px-4">429</td>
                  <td className="py-3 px-4">Trop de requêtes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Best Practices */}
        <section className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-6">
          <h2 className="text-xl font-semibold text-amber-800 dark:text-amber-200 mb-4">Bonnes pratiques</h2>
          <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200 text-sm">
              <strong>La règle qui compte avant toutes les autres :</strong> écrire à des personnes qui ne vous
              ont jamais écrit est <strong>la première cause de restriction puis de bannissement</strong> d&apos;un
              numéro WhatsApp. Le déclencheur est le <strong>volume</strong> : de l&apos;ordre de 15 à 20 contacts
              froids dans une journée suffit. Un numéro banni n&apos;est pas récupérable — construisez votre
              activité sur des conversations entrantes.
            </p>
          </div>

          <ul className="space-y-3 text-amber-700 dark:text-amber-300">
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">1.</span>
              <span>
                <strong>Privilégiez l&apos;entrant :</strong> faites en sorte que le client écrive en premier
                (lien <code>wa.me</code> sur votre site et vos publicités, QR code, bouton &laquo;&nbsp;Contactez-nous
                sur WhatsApp&nbsp;&raquo;). Répondre à quelqu&apos;un qui vous a écrit est sans risque et se livre
                de façon fiable.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">2.</span>
              <span>
                <strong>Limitez les contacts froids :</strong> si vous devez initier, restez sous une dizaine par
                jour et par session, espacez-les, et arrêtez si le taux de réponse est faible. Un
                <code> COLD_CONTACT_BLOCKED</code> n&apos;est pas un bug : c&apos;est la protection qui préserve
                votre numéro.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">3.</span>
              <span>
                <strong>Ne confondez pas accepté et livré :</strong> un <code>200</code> à l&apos;envoi ne garantit
                rien. Vérifiez <code>GET /messages/:messageId/status</code> quelques secondes après, et traitez
                <code> failed</code> comme un échec réel (ne renvoyez pas en boucle : cela aggrave le risque).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">4.</span>
              <span>
                <strong>Surveillez la santé de la session :</strong> interrogez <code>GET /delivery-health</code>
                régulièrement. Une session <code>connected</code> peut cesser de livrer&nbsp;; si
                <code> degraded</code> passe à <code>true</code>, suspendez vos envois et reconnectez la session
                plutôt que d&apos;insister.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">5.</span>
              <span>
                <strong>Rythme humain :</strong> gardez au moins 3 secondes entre deux messages et évitez les
                rafales à heure fixe. La plateforme ajoute déjà un indicateur de saisie et une pause variable,
                mais un envoi massif et régulier reste détectable.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">6.</span>
              <span>
                <strong>Idempotence :</strong> envoyez toujours une <code>idempotencyKey</code> sur vos appels
                d&apos;envoi. En cas de rejeu réseau, elle évite d&apos;expédier deux fois le même message au
                client.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 font-semibold">7.</span>
              <span>
                <strong>Validez avant les campagnes :</strong> vérifiez que les numéros existent sur WhatsApp
                avant un envoi de masse, et retirez de vos listes tout contact dont les messages échouent.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
