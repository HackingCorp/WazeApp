#!/bin/bash

# Configuration
SERVER_IP="94.250.201.167"
SERVER_USER="root"
SERVER_PASSWORD="Lontsi05@"
REMOTE_PATH="/opt/apps/wazeapp"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"; }
info() { echo -e "${BLUE}[INFO] $1${NC}"; }

ssh_exec() {
    SSH_ASKPASS=/usr/bin/false DISPLAY=:0 sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no "$SERVER_USER@$SERVER_IP" "$1"
}

scp_copy() {
    SSH_ASKPASS=/usr/bin/false DISPLAY=:0 sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no -r "$1" "$SERVER_USER@$SERVER_IP:$2"
}

log "Starting quick deployment..."

# Build and save image
log "Building backend image..."
docker build -t wazeapp-backend:latest .

log "Saving image..."
docker save wazeapp-backend:latest | gzip > backend-image.tar.gz

log "Transferring image to server..."
scp_copy "backend-image.tar.gz" "$REMOTE_PATH/"

log "Loading image on server..."
ssh_exec "cd $REMOTE_PATH && docker load < backend-image.tar.gz && rm backend-image.tar.gz"

log "Starting backend service..."
ssh_exec "cd $REMOTE_PATH && docker run -d --name wazeapp-backend-test -p 3100:3100 --env-file .env wazeapp-backend:latest"

log "Deployment completed!"
ssh_exec "docker ps | grep wazeapp"

rm backend-image.tar.gz