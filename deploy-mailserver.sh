#!/bin/bash

# Deploy WazeApp Mail Server to remote server
# Usage: ./deploy-mailserver.sh

set -e

SERVER="root@94.250.201.167"
PASSWORD="Lontsi05@"
REMOTE_DIR="/opt/wazeapp-mailserver"

echo "🚀 Deploying WazeApp Mail Server"
echo "================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create remote directory
echo -e "${GREEN}📁 Creating remote directory...${NC}"
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${SERVER} "mkdir -p ${REMOTE_DIR}"

# Copy docker-compose file
echo -e "${GREEN}📤 Copying configuration files...${NC}"
sshpass -p "${PASSWORD}" scp -o StrictHostKeyChecking=no \
    docker-compose.mailserver.yml \
    ${SERVER}:${REMOTE_DIR}/docker-compose.yml

# Copy setup script
sshpass -p "${PASSWORD}" scp -o StrictHostKeyChecking=no \
    setup-mailserver.sh \
    ${SERVER}:${REMOTE_DIR}/setup.sh

# Execute setup on remote server
echo -e "${GREEN}⚙️  Running setup on remote server...${NC}"
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${SERVER} << 'ENDSSH'
cd /opt/wazeapp-mailserver

# Make setup script executable
chmod +x setup.sh

# Create directories
mkdir -p mailserver/{mail-data,mail-state,mail-logs,config}

# Generate passwords
NOREPLY_PASS=$(openssl rand -base64 24)
SUPPORT_PASS=$(openssl rand -base64 24)
ADMIN_PASS=$(openssl rand -base64 24)

echo "Generated credentials:"
echo "noreply@wazeapp.ai: ${NOREPLY_PASS}"
echo "support@wazeapp.ai: ${SUPPORT_PASS}"
echo "admin@wazeapp.ai: ${ADMIN_PASS}"

# Save credentials
cat > mailserver/credentials.env <<EOF
# WazeApp Mail Server Credentials
# Generated on $(date)

SMTP_HOST=localhost
SMTP_PORT=3587
SMTP_SECURE=true
SMTP_USER=noreply@wazeapp.ai
SMTP_PASS=${NOREPLY_PASS}
SMTP_FROM=noreply@wazeapp.ai
SMTP_FROM_NAME=WazeApp

# Email accounts:
# noreply@wazeapp.ai: ${NOREPLY_PASS}
# support@wazeapp.ai: ${SUPPORT_PASS}
# admin@wazeapp.ai: ${ADMIN_PASS}
EOF

chmod 600 mailserver/credentials.env

echo ""
echo "✅ Setup completed!"
echo "Credentials saved to: ${REMOTE_DIR}/mailserver/credentials.env"

# Start mailserver
echo ""
echo "🚀 Starting mailserver..."
docker-compose up -d

echo ""
echo "⏳ Waiting for mailserver to start (30 seconds)..."
sleep 30

# Create email accounts
echo ""
echo "📧 Creating email accounts..."

# Wait for container to be fully ready
docker exec wazeapp-mailserver setup email add noreply@wazeapp.ai "${NOREPLY_PASS}" || true
docker exec wazeapp-mailserver setup email add support@wazeapp.ai "${SUPPORT_PASS}" || true
docker exec wazeapp-mailserver setup email add admin@wazeapp.ai "${ADMIN_PASS}" || true

echo ""
echo "🔐 Getting DKIM key (add this to DNS)..."
echo "----------------------------------------"
sleep 5
docker exec wazeapp-mailserver cat /tmp/docker-mailserver/opendkim/keys/wazeapp.ai/mail.txt 2>/dev/null || echo "DKIM key not ready yet, try later with: docker exec wazeapp-mailserver cat /tmp/docker-mailserver/opendkim/keys/wazeapp.ai/mail.txt"

echo ""
echo "✅ Mail server deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Configure DNS records (see output above)"
echo "2. Add DKIM key to DNS (mail._domainkey.wazeapp.ai)"
echo "3. Verify with: docker logs wazeapp-mailserver"
echo "4. Test sending: docker exec wazeapp-mailserver setup email test"
echo ""
echo "Credentials file: ${REMOTE_DIR}/mailserver/credentials.env"

ENDSSH

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""
echo "To view logs:"
echo "  sshpass -p '${PASSWORD}' ssh ${SERVER} 'docker logs wazeapp-mailserver'"
echo ""
echo "To get credentials:"
echo "  sshpass -p '${PASSWORD}' ssh ${SERVER} 'cat ${REMOTE_DIR}/mailserver/credentials.env'"
