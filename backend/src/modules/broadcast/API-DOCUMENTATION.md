# WazeApp Broadcast API Documentation

## Overview

The Broadcast API allows you to manage contacts, create message templates, run campaigns, and send WhatsApp messages programmatically. The External API is available for **Pro** and **Enterprise** plan subscribers.

## Authentication

### API Key Authentication

All External API requests require an API key passed in the `X-API-Key` header:

```bash
curl -X GET https://api.wazeapp.xyz/api/v1/external/health \
  -H "X-API-Key: wz_live_your_api_key_here"
```

API keys can be created and managed from the WazeApp dashboard under **Settings > API Keys**.

### Permissions

Each API key has specific permissions:

| Permission | Description |
|------------|-------------|
| `send:message` | Send WhatsApp messages |
| `contacts:read` | Read contacts list |
| `contacts:write` | Create/update contacts |
| `templates:read` | Read message templates |
| `templates:write` | Create/update templates |
| `campaigns:read` | Read campaigns and stats |
| `campaigns:write` | Create/manage campaigns |
| `webhooks:manage` | Manage webhook configurations |
| `broadcast:read` | Read all broadcast data |
| `broadcast:write` | Write all broadcast data |

---

## External API Endpoints

Base URL: `https://api.wazeapp.xyz/api/v1/external`

### Health Check

Check API status and validate your API key.

```http
GET /health
```

**Response:**
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

## Sending Messages

### Send Messages (Queued)

Send messages to one or multiple recipients with rate limiting.

```http
POST /send
```

**Headers:**
- `X-API-Key`: Your API key (required)

**Body:**
```json
{
  "sessionId": "uuid",
  "recipients": ["+237612345678", "+237698765432"],
  "templateId": "uuid",
  "variables": {
    "nom": "Jean",
    "entreprise": "WazeApp"
  },
  "delayMs": 3000
}
```

Or with custom message:
```json
{
  "sessionId": "uuid",
  "recipients": ["+237612345678"],
  "message": {
    "type": "text",
    "text": "Hello! This is a test message."
  }
}
```

**Supported message types:**
- `text` - Plain text message
- `image` - Image with optional caption
- `video` - Video with optional caption
- `audio` - Audio file
- `document` - Document file
- `location` - Location coordinates
- `contact` - Contact card

**Response:**
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

### Send Message Immediately

Send a single message immediately without queuing.

```http
POST /send/immediate
```

**Body:**
```json
{
  "sessionId": "uuid",
  "to": "+237612345678",
  "message": "Hello!",
  "type": "text"
}
```

For media messages:
```json
{
  "sessionId": "uuid",
  "to": "+237612345678",
  "type": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Check out this image!"
}
```

**Response:**
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

### List Contacts

```http
GET /contacts?page=1&limit=50&tags=client,vip&search=john
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50) |
| `tags` | string | Comma-separated tags |
| `search` | string | Search by name or phone |
| `isValidWhatsApp` | boolean | Filter by WhatsApp validation |
| `isSubscribed` | boolean | Filter by subscription status |

**Response:**
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

### Create Contact

```http
POST /contacts
```

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

**Response:**
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

### List Templates

```http
GET /templates
```

**Response:**
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
      "isSystem": true,
      "usageCount": 150
    }
  ]
}
```

### Get Template

```http
GET /templates/:id
```

---

## Campaigns

### List Campaigns

```http
GET /campaigns
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "New Year Promotion",
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

### Get Campaign

```http
GET /campaigns/:id
```

### Get Campaign Statistics

```http
GET /campaigns/:id/stats
```

**Response:**
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

### Create Campaign

```http
POST /campaigns
```

**Body:**
```json
{
  "name": "Welcome Campaign",
  "sessionId": "uuid",
  "templateId": "uuid",
  "contactFilter": {
    "tags": ["new_customer"]
  },
  "scheduledAt": "2025-01-20T10:00:00.000Z",
  "delayBetweenMessages": 3000,
  "startImmediately": false
}
```

Or with specific contacts:
```json
{
  "name": "VIP Campaign",
  "sessionId": "uuid",
  "templateId": "uuid",
  "contactIds": ["contact-uuid-1", "contact-uuid-2"],
  "startImmediately": true
}
```

### Start Campaign

```http
POST /campaigns/:id/start
```

### Pause Campaign

```http
POST /campaigns/:id/pause
```

### Cancel Campaign

```http
POST /campaigns/:id/cancel
```

---

## Webhooks

### List Webhooks

```http
GET /webhooks
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Delivery Status",
      "url": "https://yourapp.com/webhook",
      "events": ["message.sent", "message.delivered", "message.failed"],
      "isActive": true,
      "totalTriggered": 1500,
      "totalSuccess": 1498
    }
  ]
}
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `message.sent` | Message was sent to WhatsApp |
| `message.delivered` | Message was delivered to recipient |
| `message.read` | Message was read by recipient |
| `message.failed` | Message delivery failed |
| `campaign.started` | Campaign started |
| `campaign.completed` | Campaign completed |
| `campaign.failed` | Campaign failed |
| `contact.verified` | Contact WhatsApp verified |
| `contact.unsubscribed` | Contact unsubscribed |

### Webhook Payload

Webhooks are sent as POST requests with JSON body:

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

### Webhook Signature

Each webhook request includes a signature header for verification:

```
X-Webhook-Signature: sha256=abc123...
```

Verify the signature:
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' +
    crypto.createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  return signature === expectedSignature;
}
```

---

## Dashboard API Endpoints

These endpoints are for dashboard use (JWT authentication required).

Base URL: `https://api.wazeapp.xyz/api/v1/broadcast`

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/contacts` | List contacts |
| POST | `/contacts` | Create contact |
| POST | `/contacts/import` | Import contacts (file upload) |
| GET | `/contacts/:id` | Get contact |
| PUT | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| POST | `/contacts/bulk-delete` | Delete multiple contacts |
| POST | `/contacts/add-tags` | Add tags to contacts |
| GET | `/contacts/tags` | Get all unique tags |
| POST | `/contacts/validate/:sessionId` | Validate WhatsApp numbers |
| GET | `/contacts/export` | Export contacts |
| GET | `/contacts/stats` | Contact statistics |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Create template |
| GET | `/templates/:id` | Get template |
| PUT | `/templates/:id` | Update template |
| DELETE | `/templates/:id` | Delete template |
| POST | `/templates/:id/preview` | Preview template with variables |

### Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/campaigns` | List campaigns |
| POST | `/campaigns` | Create campaign |
| GET | `/campaigns/:id` | Get campaign |
| PUT | `/campaigns/:id` | Update campaign |
| DELETE | `/campaigns/:id` | Delete campaign |
| POST | `/campaigns/:id/start` | Start campaign |
| POST | `/campaigns/:id/pause` | Pause campaign |
| POST | `/campaigns/:id/resume` | Resume campaign |
| POST | `/campaigns/:id/cancel` | Cancel campaign |
| GET | `/campaigns/:id/stats` | Campaign statistics |
| GET | `/campaigns/:id/messages` | Campaign messages |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Create webhook |
| GET | `/webhooks/:id` | Get webhook |
| PUT | `/webhooks/:id` | Update webhook |
| DELETE | `/webhooks/:id` | Delete webhook |
| POST | `/webhooks/:id/test` | Test webhook |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Create API key |
| GET | `/api-keys/:id` | Get API key |
| PUT | `/api-keys/:id` | Update API key |
| DELETE | `/api-keys/:id` | Delete API key |
| POST | `/api-keys/:id/toggle` | Enable/disable API key |

---

## Rate Limits

### External API

| Plan | Requests/Minute | Messages/Day |
|------|-----------------|--------------|
| Pro | 60 | 2,000 |
| Enterprise | 120 | 5,000 |

### Contact Limits

| Plan | Max Contacts |
|------|--------------|
| Free | 50 |
| Standard | 1,000 |
| Pro | 5,000 |
| Enterprise | 10,000 |

### Campaign Limits

| Plan | Campaigns/Month | Messages/Day |
|------|-----------------|--------------|
| Free | 2 | 50 |
| Standard | 20 | 500 |
| Pro | 100 | 2,000 |
| Enterprise | Unlimited | 5,000 |

---

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `BAD_REQUEST` | 400 | Invalid request data |
| `RATE_LIMITED` | 429 | Too many requests |
| `LIMIT_EXCEEDED` | 403 | Plan limit exceeded |

---

## Best Practices

1. **Rate Limiting**: Respect the delay between messages (minimum 3 seconds) to avoid WhatsApp bans
2. **Webhook Reliability**: Implement retry logic for webhook handlers
3. **Contact Validation**: Validate WhatsApp numbers before campaigns
4. **Template Variables**: Test templates with all variables before campaigns
5. **Error Handling**: Always check response status and handle errors gracefully

---

## Support

- Email: support@wazeapp.xyz
- Documentation: https://docs.wazeapp.xyz
- Dashboard: https://app.wazeapp.xyz
