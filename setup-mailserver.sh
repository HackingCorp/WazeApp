#!/bin/bash

# WazeApp Mail Server Setup Script
# This script sets up docker-mailserver for wazeapp.xyz

set -e

echo "🚀 WazeApp Mail Server Setup"
echo "================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create directories
echo -e "${GREEN}📁 Creating mailserver directories...${NC}"
mkdir -p mailserver/{mail-data,mail-state,mail-logs,config}

# Download setup script
echo -e "${GREEN}📥 Downloading docker-mailserver setup script...${NC}"
curl -o mailserver/setup.sh https://raw.githubusercontent.com/docker-mailserver/docker-mailserver/master/setup.sh
chmod +x mailserver/setup.sh

# Create email accounts
echo -e "${GREEN}📧 Creating email accounts...${NC}"
echo ""
echo "We'll create the following accounts:"
echo "  - noreply@wazeapp.xyz (for system emails)"
echo "  - support@wazeapp.xyz (for customer support)"
echo "  - admin@wazeapp.xyz (for admin)"
echo ""

# Function to create email account
create_email_account() {
    local EMAIL=$1
    local PASSWORD=$2

    echo -e "${YELLOW}Creating account: ${EMAIL}${NC}"
    docker exec wazeapp-mailserver setup email add ${EMAIL} ${PASSWORD} 2>/dev/null || \
    ./mailserver/setup.sh email add ${EMAIL} ${PASSWORD}
}

# Generate random passwords
NOREPLY_PASS=$(openssl rand -base64 24)
SUPPORT_PASS=$(openssl rand -base64 24)
ADMIN_PASS=$(openssl rand -base64 24)

echo "Generated passwords (save these securely!):"
echo "  noreply@wazeapp.xyz: ${NOREPLY_PASS}"
echo "  support@wazeapp.xyz: ${SUPPORT_PASS}"
echo "  admin@wazeapp.xyz: ${ADMIN_PASS}"
echo ""

# Save passwords to file
cat > mailserver/passwords.txt <<EOF
# WazeApp Mail Server Credentials
# Generated on $(date)

noreply@wazeapp.xyz: ${NOREPLY_PASS}
support@wazeapp.xyz: ${SUPPORT_PASS}
admin@wazeapp.xyz: ${ADMIN_PASS}

# SMTP Configuration for Backend:
SMTP_HOST=wazeapp-mailserver (or localhost if on same server)
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=noreply@wazeapp.xyz
SMTP_PASSWORD=${NOREPLY_PASS}
EMAIL_FROM=noreply@wazeapp.xyz
EMAIL_FROM_NAME=WazeApp
EOF

chmod 600 mailserver/passwords.txt

# Create DKIM keys
echo -e "${GREEN}🔐 DKIM keys will be generated on first start${NC}"

# DNS Configuration instructions
cat > mailserver/DNS-CONFIGURATION.md <<'EOF'
# DNS Configuration for wazeapp.xyz Mail Server

## Required DNS Records

### 1. MX Record (Mail Exchange)
```
Type: MX
Name: @
Priority: 10
Value: mail.wazeapp.xyz
```

### 2. A Record (Mail Server)
```
Type: A
Name: mail
Value: 94.250.201.167
```

### 3. SPF Record (Sender Policy Framework)
```
Type: TXT
Name: @
Value: v=spf1 mx a ip4:94.250.201.167 ~all
```

### 4. DKIM Record (DomainKeys Identified Mail)
After starting the mailserver, get the DKIM key with:
```bash
docker exec wazeapp-mailserver cat /tmp/docker-mailserver/opendkim/keys/wazeapp.xyz/mail.txt
```

Then create:
```
Type: TXT
Name: mail._domainkey
Value: [content from the command above]
```

### 5. DMARC Record (Domain-based Message Authentication)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:admin@wazeapp.xyz; ruf=mailto:admin@wazeapp.xyz; fo=1
```

### 6. PTR Record (Reverse DNS)
Contact your hosting provider (Contabo) to set:
```
94.250.201.167 → mail.wazeapp.xyz
```

## Verification

After adding DNS records, verify with:
```bash
# Check MX record
dig MX wazeapp.xyz +short

# Check SPF record
dig TXT wazeapp.xyz +short

# Check DKIM record
dig TXT mail._domainkey.wazeapp.xyz +short

# Check DMARC record
dig TXT _dmarc.wazeapp.xyz +short
```

## Testing Email Delivery

Use these tools to test:
- https://www.mail-tester.com/
- https://mxtoolbox.com/emailhealth/
EOF

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure DNS records (see mailserver/DNS-CONFIGURATION.md)"
echo "2. Start the mailserver: docker-compose -f docker-compose.mailserver.yml up -d"
echo "3. Create email accounts (they'll be created on first start)"
echo "4. Get DKIM key and add to DNS"
echo "5. Test email sending"
echo ""
echo -e "${GREEN}Credentials saved to: mailserver/passwords.txt${NC}"
echo -e "${GREEN}DNS instructions saved to: mailserver/DNS-CONFIGURATION.md${NC}"
