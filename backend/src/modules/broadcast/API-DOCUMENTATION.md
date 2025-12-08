# WazeApp External API Documentation

## Overview

L'API externe WazeApp vous permet d'envoyer des messages WhatsApp, gérer vos contacts, templates et campagnes de manière programmatique. L'accès à l'API est disponible pour les abonnés **Pro** et **Enterprise**.

## URL de base

```
https://api.wazeapp.xyz/api/v1/external
```

## Authentification

Toutes les requêtes API nécessitent une clé API dans le header `X-API-Key`:

```bash
curl -X GET https://api.wazeapp.xyz/api/v1/external/health \
  -H "X-API-Key: wz_live_votre_cle_api"
```

Les clés API peuvent être créées depuis le dashboard WazeApp dans **Clés API**.

## Permissions

Chaque clé API a des permissions spécifiques:

| Permission | Description |
|------------|-------------|
| `send:message` | Envoyer des messages WhatsApp |
| `contacts:read` | Lire la liste des contacts |
| `contacts:write` | Créer/modifier des contacts |
| `templates:read` | Lire les templates |
| `campaigns:read` | Lire les campagnes |
| `campaigns:write` | Créer/gérer les campagnes |
| `webhooks:manage` | Gérer les webhooks |

---

## Endpoints

### Health Check

Vérifier le statut de l'API et valider votre clé.

```http
GET /health
```

**Réponse:**
```json
{
  "success": true,
  "status": "healthy",
  "organizationId": "uuid",
  "permissions": ["send:message", "contacts:read"],
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

## Envoi de Messages

### Envoyer des messages (en file d'attente)

Envoyer des messages à un ou plusieurs destinataires avec délai.

```http
POST /send
```

**Permission requise:** `send:message`

**Body avec template:**
```json
{
  "sessionId": "uuid-de-votre-session-whatsapp",
  "recipients": ["+237612345678", "+237698765432"],
  "templateId": "uuid-du-template",
  "variables": {
    "nom": "Jean",
    "entreprise": "WazeApp"
  },
  "delayMs": 3000
}
```

**Body avec message personnalisé:**
```json
{
  "sessionId": "uuid",
  "recipients": ["+237612345678"],
  "message": {
    "type": "text",
    "text": "Bonjour! Ceci est un message test."
  }
}
```

**Types de messages supportés:**
- `text` - Message texte
- `image` - Image avec caption optionnel
- `video` - Vidéo avec caption optionnel
- `audio` - Fichier audio
- `document` - Document

**Réponse:**
```json
{
  "success": true,
  "totalRecipients": 2,
  "queued": 2,
  "failed": 0,
  "results": [
    { "recipient": "+237612345678", "success": true, "status": "queued" },
    { "recipient": "+237698765432", "success": true, "status": "queued" }
  ]
}
```

### Envoyer un message immédiatement

Envoyer un seul message sans file d'attente.

```http
POST /send/immediate
```

**Permission requise:** `send:message`

**Body:**
```json
{
  "sessionId": "uuid",
  "to": "+237612345678",
  "message": "Bonjour!",
  "type": "text"
}
```

**Pour les messages média:**
```json
{
  "sessionId": "uuid",
  "to": "+237612345678",
  "type": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Regardez cette image!"
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "messageId": "whatsapp_message_id",
    "status": "sent"
  }
}
```

---

## Contacts

### Lister les contacts

```http
GET /contacts
```

**Permission requise:** `contacts:read`

**Paramètres de requête:**
| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | number | Numéro de page (défaut: 1) |
| `limit` | number | Éléments par page (défaut: 50) |
| `tags` | string | Tags séparés par virgule |
| `search` | string | Recherche par nom ou téléphone |
| `isValidWhatsApp` | boolean | Filtrer par validation WhatsApp |
| `isSubscribed` | boolean | Filtrer par statut d'abonnement |

**Réponse:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "phoneNumber": "+237612345678",
      "name": "Jean Dupont",
      "email": "jean@example.com",
      "company": "Acme Inc",
      "tags": ["client", "vip"],
      "isValidWhatsApp": true,
      "isSubscribed": true,
      "createdAt": "2025-01-15T12:00:00.000Z"
    }
  ],
  "total": 150
}
```

### Créer un contact

```http
POST /contacts
```

**Permission requise:** `contacts:write`

**Body:**
```json
{
  "phoneNumber": "+237612345678",
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "company": "Acme Inc",
  "tags": ["client"]
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "phoneNumber": "+237612345678",
    "name": "Jean Dupont",
    "isSubscribed": true,
    "createdAt": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## Templates

### Lister les templates

```http
GET /templates
```

**Permission requise:** `templates:read`

**Réponse:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Bienvenue",
      "type": "text",
      "category": "welcome",
      "content": "Bonjour {nom}! Bienvenue chez {entreprise}.",
      "variables": ["nom", "entreprise"],
      "usageCount": 150
    }
  ]
}
```

### Obtenir un template

```http
GET /templates/:id
```

**Permission requise:** `templates:read`

---

## Campagnes

### Lister les campagnes

```http
GET /campaigns
```

**Permission requise:** `campaigns:read`

**Réponse:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Promo Nouvel An",
      "status": "completed",
      "stats": {
        "total": 500,
        "sent": 498,
        "delivered": 480,
        "read": 350,
        "failed": 2
      },
      "scheduledAt": "2025-01-01T00:00:00.000Z",
      "completedAt": "2025-01-01T01:30:00.000Z"
    }
  ]
}
```

### Obtenir une campagne

```http
GET /campaigns/:id
```

**Permission requise:** `campaigns:read`

### Obtenir les statistiques d'une campagne

```http
GET /campaigns/:id/stats
```

**Permission requise:** `campaigns:read`

**Réponse:**
```json
{
  "success": true,
  "data": {
    "total": 500,
    "pending": 0,
    "sent": 498,
    "delivered": 480,
    "read": 350,
    "failed": 2,
    "deliveryRate": 96.4,
    "readRate": 72.9,
    "failureRate": 0.4
  }
}
```

### Créer une campagne

```http
POST /campaigns
```

**Permission requise:** `campaigns:write`

**Body avec filtre de contacts:**
```json
{
  "name": "Campagne Bienvenue",
  "sessionId": "uuid",
  "templateId": "uuid",
  "contactFilter": {
    "tags": ["nouveau_client"]
  },
  "scheduledAt": "2025-01-20T10:00:00.000Z",
  "delayBetweenMessages": 3000,
  "startImmediately": false
}
```

**Body avec contacts spécifiques:**
```json
{
  "name": "Campagne VIP",
  "sessionId": "uuid",
  "templateId": "uuid",
  "contactIds": ["contact-uuid-1", "contact-uuid-2"],
  "startImmediately": true
}
```

### Démarrer une campagne

```http
POST /campaigns/:id/start
```

**Permission requise:** `campaigns:write`

### Mettre en pause une campagne

```http
POST /campaigns/:id/pause
```

**Permission requise:** `campaigns:write`

### Annuler une campagne

```http
POST /campaigns/:id/cancel
```

**Permission requise:** `campaigns:write`

---

## Webhooks

### Lister les webhooks configurés

```http
GET /webhooks
```

**Permission requise:** `webhooks:manage`

**Réponse:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Statut de livraison",
      "url": "https://votre-app.com/webhook",
      "events": ["message.sent", "message.delivered", "message.failed"],
      "isActive": true,
      "totalTriggered": 1500,
      "totalSuccess": 1498
    }
  ]
}
```

### Événements Webhook

| Événement | Description |
|-----------|-------------|
| `message.sent` | Message envoyé à WhatsApp |
| `message.delivered` | Message délivré au destinataire |
| `message.read` | Message lu par le destinataire |
| `message.failed` | Échec de livraison |
| `campaign.started` | Campagne démarrée |
| `campaign.completed` | Campagne terminée |
| `campaign.failed` | Campagne échouée |

### Payload Webhook

Les webhooks sont envoyés en POST avec un body JSON:

```json
{
  "event": "message.delivered",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "data": {
    "messageId": "uuid",
    "campaignId": "uuid",
    "recipient": "+237612345678",
    "status": "delivered"
  }
}
```

---

## Limites

### Limites API

| Plan | Requêtes/Minute | Messages/Jour |
|------|-----------------|---------------|
| Pro | 60 | 2 000 |
| Enterprise | 120 | 5 000 |

---

## Erreurs

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

### Codes d'erreur

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Clé API invalide ou manquante |
| `FORBIDDEN` | 403 | Permissions insuffisantes |
| `NOT_FOUND` | 404 | Ressource non trouvée |
| `BAD_REQUEST` | 400 | Données de requête invalides |
| `RATE_LIMITED` | 429 | Trop de requêtes |

---

## Bonnes pratiques

1. **Délai entre messages**: Respectez un délai minimum de 3 secondes entre les messages pour éviter les blocages WhatsApp
2. **Validation des contacts**: Validez les numéros WhatsApp avant d'envoyer des campagnes
3. **Gestion des erreurs**: Vérifiez toujours le statut de la réponse et gérez les erreurs

---

## Support

- Email: support@wazeapp.xyz
- Dashboard: https://app.wazeapp.xyz
