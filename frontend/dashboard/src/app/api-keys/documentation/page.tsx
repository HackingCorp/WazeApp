'use client';

import { useI18n } from '@/providers/I18nProvider';
import { ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Documentation API Externe
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Guide complet pour utiliser l'API WazeApp
        </p>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* Base URL */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">URL de base</h2>
          <CodeBlock
            code="https://api.wazeapp.xyz/api/v1/external"
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
            code={`curl -X GET https://api.wazeapp.xyz/api/v1/external/health \\
  -H "X-API-Key: wz_live_votre_cle_api"`}
            id="auth-example"
          />
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
  "status": "healthy",
  "organizationId": "uuid",
  "permissions": ["send:message", "contacts:read"],
  "timestamp": "2025-01-15T12:00:00.000Z"
}`}
              id="health-response"
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
  "sessionId": "uuid-session-whatsapp",
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
  "sessionId": "uuid",
  "recipients": ["+237612345678"],
  "message": {
    "type": "text",
    "text": "Bonjour! Ceci est un message test."
  }
}`}
              id="send-request"
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
  "sessionId": "uuid",
  "to": "+237612345678",
  "message": "Bonjour!",
  "type": "text"
}

// Pour les médias
{
  "sessionId": "uuid",
  "to": "+237612345678",
  "type": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Regardez cette image!"
}`}
              id="send-immediate"
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
  "sessionId": "uuid",
  "templateId": "uuid",
  "contactFilter": {
    "tags": ["nouveau_client"]
  },
  "delayBetweenMessages": 3000,
  "startImmediately": true
}`}
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
          <ul className="space-y-2 text-amber-700 dark:text-amber-300">
            <li className="flex items-start gap-2">
              <span className="mt-1">1.</span>
              <span><strong>Délai entre messages:</strong> Respectez un délai minimum de 3 secondes entre les messages pour éviter les blocages WhatsApp</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">2.</span>
              <span><strong>Validation des contacts:</strong> Validez les numéros WhatsApp avant d'envoyer des campagnes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1">3.</span>
              <span><strong>Gestion des erreurs:</strong> Vérifiez toujours le statut de la réponse et gérez les erreurs</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
