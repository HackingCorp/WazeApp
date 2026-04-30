# ✅ Serveur Mail WazeApp - Configuration Complète

## 📊 État du Déploiement

✅ **Serveur mail opérationnel** : mail.wazeapp.ai
✅ **3 comptes email créés**
✅ **Clés DKIM générées**
✅ **Services actifs** : Postfix, Dovecot, OpenDKIM

---

## 🔐 Identifiants des Comptes Email

### Compte noreply (pour les emails système)
```
Email: noreply@wazeapp.ai
Mot de passe: /6vft3CdgBS56ou9hZftxt72jTfiFWts
```

### Compte support (pour le support client)
```
Email: support@wazeapp.ai
Mot de passe: EjH39kWyn1LZAxPbMfEVoUsF3mS05vz6
```

### Compte admin (pour l'administration)
```
Email: admin@wazeapp.ai
Mot de passe: oV2MENn5XImkv7xUk3fjYgvvIbnoUP46
```

---

## ⚙️ Configuration SMTP pour le Backend

Ajoutez ces variables d'environnement au service backend WazeApp :

```bash
# Configuration SMTP
SMTP_HOST=94.250.201.167  # ou mail.wazeapp.ai (après configuration DNS)
SMTP_PORT=3587
SMTP_SECURE=false          # false car pas de SSL pour le moment
SMTP_USER=noreply@wazeapp.ai
SMTP_PASS=/6vft3CdgBS56ou9hZftxt72jTfiFWts
SMTP_FROM=noreply@wazeapp.ai
SMTP_FROM_NAME=WazeApp

# URL de l'application (pour les liens dans les emails)
APP_URL=https://wazeapp.ai
DASHBOARD_URL=https://app.wazeapp.ai
```

---

## 🌐 Configuration DNS Requise

### 1. Enregistrement MX (Mail Exchange) - PRIORITAIRE ⭐

```
Type: MX
Nom: @
Priorité: 10
Valeur: mail.wazeapp.ai
TTL: 3600
```

### 2. Enregistrement A (pour mail.wazeapp.ai)

```
Type: A
Nom: mail
Valeur: 94.250.201.167
TTL: 3600
```

### 3. Enregistrement SPF (Sender Policy Framework)

```
Type: TXT
Nom: @
Valeur: v=spf1 mx a ip4:94.250.201.167 ~all
TTL: 3600
```

### 4. Enregistrement DKIM (DomainKeys Identified Mail)

```
Type: TXT
Nom: mail._domainkey
Valeur: v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoDjkUJ4zfRZuIfkperJyISKwCLsa7AXWGB6pi0PbBCxhIrq6Kg4+smfOmxSgDTIdIguPiiVLg/Z5KNaFmoEiBfxowPwdUdPM0AXRram4jnhAgBWAXOEf3worNLDjfy1DjtoFiEhfAaHUY6hPQpu3hxz5KbfhJWRzvDkR1LOTL9NZ0jOaNiCjh5+Ax5aN3eIRvaAUcT6ZohSBsbMfBtYbX2s4aIA+iaQmUt/37w64mBCLiqZxDmshnybnhsEls6gnor7hSkikMM0hyvv3kbXvazJCIJkRvXttx09NnCFfCC8y3TuWX+LIPSiEd/IVgwEoB61b1mZfKk4lijA0SEKJtwIDAQAB
TTL: 3600
```

**Note** : Si votre DNS n'accepte pas une valeur aussi longue, vous pouvez essayer cette version formatée :
```
"v=DKIM1; h=sha256; k=rsa; " "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoDjkUJ4zfRZuIfkperJyISKwCLsa7AXWGB6pi0PbBCxhIrq6Kg4+smfOmxSgDTIdIguPiiVLg/Z5KNaFmoEiBfxowPwdUdPM0AXRram4jnhAgBWAXOEf3worNLDjfy1DjtoFiEhfAaHUY6hPQpu3hxz5KbfhJWRzvDkR1LOTL9NZ0jOaNiCjh5+Ax5aN3eIRvaAUcT6ZohSBsbMfBtYbX2s4aIA+iaQmUt/37w64mBCLiqZxDmshnybnhsEls6gnor7hSkikMM0hyvv3kbXvazJCIJkRvXttx09NnCFfCC8y3TuWX+LIPSiEd/IVgwEoB61b1mZfKk4lijA0SEKJtwIDAQAB"
```

### 5. Enregistrement DMARC (Domain-based Message Authentication)

```
Type: TXT
Nom: _dmarc
Valeur: v=DMARC1; p=quarantine; rua=mailto:admin@wazeapp.ai; ruf=mailto:admin@wazeapp.ai; fo=1; adkim=r; aspf=r
TTL: 3600
```

### 6. Enregistrement PTR (Reverse DNS) - À demander à Contabo

Contactez le support Contabo pour configurer le PTR :
```
94.250.201.167 → mail.wazeapp.ai
```

---

## 🔍 Vérification des Enregistrements DNS

Une fois les enregistrements DNS configurés, vérifiez-les avec :

```bash
# Vérifier MX
dig MX wazeapp.ai +short

# Vérifier SPF
dig TXT wazeapp.ai +short

# Vérifier DKIM
dig TXT mail._domainkey.wazeapp.ai +short

# Vérifier DMARC
dig TXT _dmarc.wazeapp.ai +short

# Vérifier l'enregistrement A de mail
dig A mail.wazeapp.ai +short
```

---

## 🧪 Test de l'Envoi d'Emails

### Test depuis le serveur

```bash
# Se connecter au serveur
ssh root@94.250.201.167

# Envoyer un email de test
docker exec wazeapp-mailserver setup email test
```

### Test avec un client SMTP

Utilisez des outils comme :
- https://www.mail-tester.com/ (score de délivrabilité)
- https://mxtoolbox.com/emailhealth/
- Thunderbird ou autre client email

---

## 📝 Accès au Webmail (Rainloop)

**URL** : http://94.250.201.167:8888

**Configuration IMAP** :
- Serveur: 94.250.201.167
- Port: 3993
- Sécurité: STARTTLS
- Nom d'utilisateur: noreply@wazeapp.ai (ou autre compte)
- Mot de passe: [voir ci-dessus]

---

## 🛠️ Commandes Utiles

### Gérer les comptes email

```bash
# Lister les comptes
docker exec wazeapp-mailserver setup email list

# Ajouter un compte
docker exec wazeapp-mailserver setup email add user@wazeapp.ai PASSWORD

# Supprimer un compte
docker exec wazeapp-mailserver setup email del user@wazeapp.ai

# Changer le mot de passe
docker exec wazeapp-mailserver setup email update user@wazeapp.ai NEW_PASSWORD
```

### Voir les logs

```bash
# Logs du serveur mail
docker logs wazeapp-mailserver

# Logs en temps réel
docker logs -f wazeapp-mailserver

# Logs Postfix seulement
docker exec wazeapp-mailserver tail -f /var/log/mail/mail.log
```

### Redémarrer le serveur

```bash
cd /opt/wazeapp-mailserver
docker-compose restart
```

---

## ⚠️ Notes Importantes

### SSL/TLS
Le serveur fonctionne actuellement **SANS SSL** pour éviter les problèmes de certificats.

**Pour activer SSL avec Let's Encrypt plus tard** :
1. Assurez-vous que mail.wazeapp.ai pointe vers 94.250.201.167
2. Modifiez le docker-compose.yml : `SSL_TYPE=letsencrypt`
3. Redémarrez : `docker-compose restart`

### Ports Utilisés
- **3025** : SMTP (au lieu de 25 standard)
- **3587** : SMTP Submission (au lieu de 587 standard)
- **3465** : SMTPS (au lieu de 465 standard)
- **3993** : IMAPS (au lieu de 993 standard)
- **8888** : Webmail Rainloop

### Firewall
Assurez-vous que ces ports sont ouverts dans le firewall.

---

## 📦 Prochaines Étapes

1. ✅ Configurer les enregistrements DNS (MX, SPF, DKIM, DMARC, PTR)
2. ✅ Attendre la propagation DNS (jusqu'à 48h)
3. ✅ Tester l'envoi d'emails
4. ✅ Intégrer avec le backend WazeApp
5. ✅ Configurer SSL/TLS avec Let's Encrypt (optionnel)

---

## 📞 Support

**Emplacement des fichiers** :
- Configuration: `/opt/wazeapp-mailserver/`
- Credentials: `/opt/wazeapp-mailserver/mailserver/credentials.env`
- Docker Compose: `/opt/wazeapp-mailserver/docker-compose.yml`

**Container Docker** :
- Nom: `wazeapp-mailserver`
- Image: `ghcr.io/docker-mailserver/docker-mailserver:latest`

---

✅ **Le serveur mail est prêt à être utilisé !**
