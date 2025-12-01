# Configuration des Systèmes de Paiement

Ce document récapitule les variables d'environnement nécessaires pour les systèmes de paiement S3P et E-nkap.

## Variables d'environnement à ajouter

### S3P (Smobilpay) - Mobile Money

```bash
# S3P Configuration - Production
S3P_BASE_URL=https://s3pv2cm.smobilpay.com/v2
S3P_API_KEY=9183eee1-bf8b-49cb-bffc-d466706d3aef
S3P_API_SECRET=c5821829-a9db-4cf1-9894-65e3caffaa62
S3P_NOTIFICATION_PHONE=237691371922
S3P_NOTIFICATION_EMAIL=lontsi05@gmail.com
```

**Service IDs Production:**
- Orange Money: `30056`
- MTN Mobile Money: `20056`

**Service IDs Staging (tests):**
- Orange Money: `30053`
- MTN Mobile Money: `20053`

### E-nkap - Paiements Multi-canaux

```bash
# E-nkap Configuration - Production
ENKAP_BASE_URL=https://api-v2.enkap.cm
ENKAP_CONSUMER_KEY=wXRF_8iU7h9UNiBG4zNYFdCQPwga
ENKAP_CONSUMER_SECRET=rD9fRGJkVVs8TZtfjJ0VTD7taOsa
ENKAP_RETURN_URL=https://wazeapp.xyz/checkout/success
ENKAP_NOTIFICATION_URL=https://api.wazeapp.xyz/api/v1/payments/enkap/webhook
ENKAP_CURRENCY=XAF
ENKAP_LANG=fr
```

## Endpoints API disponibles

### S3P (Mobile Money)

#### Initier un paiement S3P
```http
POST /api/v1/payments/s3p/initiate
Authorization: Bearer {token}
Content-Type: application/json

{
  "amount": 5000,
  "customerPhone": "237670000000",
  "paymentType": "orange",
  "customerName": "Jean Dupont",
  "description": "Abonnement WazeApp Pro"
}
```

#### Vérifier un paiement S3P
```http
POST /api/v1/payments/s3p/verify
Authorization: Bearer {token}
Content-Type: application/json

{
  "transactionRef": "WAZEAPP-1234567890"
}
```

#### Test de connectivité S3P
```http
GET /api/v1/payments/s3p/ping
```

### E-nkap (Multi-canaux)

#### Initier un paiement E-nkap
```http
POST /api/v1/payments/enkap/initiate
Authorization: Bearer {token}
Content-Type: application/json

{
  "merchantReference": "WAZEAPP-ORDER-123456",
  "customerName": "Jean Dupont",
  "customerEmail": "jean.dupont@example.com",
  "customerPhone": "237670000000",
  "totalAmount": 5000,
  "currency": "XAF",
  "description": "Abonnement WazeApp",
  "items": [
    {
      "id": "1",
      "name": "Abonnement Pro",
      "quantity": 1,
      "price": 5000
    }
  ]
}
```

#### Vérifier le statut E-nkap
```http
GET /api/v1/payments/enkap/status?txid=TX-123456
Authorization: Bearer {token}
```

#### Webhook E-nkap
```http
POST /api/v1/payments/enkap/webhook
Content-Type: application/json

{
  "txid": "TX-123456",
  "status": "COMPLETED",
  "paymentStatus": "CONFIRMED",
  "merchantReference": "WAZEAPP-ORDER-123456"
}
```

#### Test de token E-nkap
```http
GET /api/v1/payments/enkap/test-token
```

## Différences entre S3P et E-nkap

### S3P
- **Type**: Mobile Money uniquement (Orange, MTN)
- **Format téléphone**: Sans code pays (6XXXXXXXX)
- **Authentification**: HMAC-SHA1
- **Flux**: Push notification mobile direct

### E-nkap
- **Type**: Multi-canaux (Cartes bancaires + Mobile Money)
- **Format téléphone**: Avec code pays (237XXXXXXXXX)
- **Authentification**: OAuth2
- **Flux**: Page de paiement hosted avec redirection

## Recommandation

Utiliser les deux systèmes en parallèle :
- **E-nkap** comme solution principale (multi-canaux)
- **S3P** comme solution de backup/alternative pour Mobile Money

## Notes de déploiement

1. Les clés API sont celles de production (emarket237.com)
2. Les webhooks E-nkap doivent être accessibles en HTTPS
3. Les URLs de retour doivent pointer vers votre domaine
4. S3P utilise des Service IDs différents pour staging/production

## Sécurité

⚠️ **IMPORTANT**: Ces clés API sont sensibles et ne doivent JAMAIS être commitées dans le code source.
Elles doivent être stockées comme variables d'environnement sur le serveur de déploiement.
