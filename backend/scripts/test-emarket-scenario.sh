#!/bin/bash

# 🧪 Script de test pour reproduire le scénario E-Market
# Usage: ./scripts/test-emarket-scenario.sh

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
API_BASE_URL="http://localhost:3100/api/v1"
FACEBOOK_URL="https://www.facebook.com/share/p/1PLLfB59dT/?mibextid=wwXIfr"
SESSION_ID="test-session-123"

echo "🧪 Test du scénario E-Market Facebook"
echo "======================================"
echo ""

# 1. Vérifier que l'application fonctionne
log_info "1. Vérification de l'application..."
if curl -s "${API_BASE_URL}/health" > /dev/null; then
    log_success "Application en ligne"
else
    log_error "Application non accessible sur ${API_BASE_URL}"
    log_info "Démarrez l'application avec: npm run start:dev"
    exit 1
fi

# 2. Vérifier les services de vision
log_info "2. Vérification des services de vision..."
VISION_STATUS=$(curl -s "${API_BASE_URL}/whatsapp/vision/status" || echo "error")
if [ "$VISION_STATUS" != "error" ]; then
    log_success "Services de vision disponibles"
    echo "$VISION_STATUS" | jq '.' 2>/dev/null || echo "$VISION_STATUS"
else
    log_warning "Services de vision non configurés (fonctionnera en mode de base)"
fi

echo ""

# 3. Test d'analyse du lien Facebook
log_info "3. Test d'analyse du lien Facebook E-Market..."
LINK_TEST=$(curl -s -X POST "${API_BASE_URL}/whatsapp/test/facebook-link" \
    -H "Content-Type: application/json" \
    -d "{
        \"sessionId\": \"${SESSION_ID}\",
        \"url\": \"${FACEBOOK_URL}\",
        \"followUpMessage\": \"Je voudrais acheter ce produit\"
    }" || echo "error")

if [ "$LINK_TEST" != "error" ]; then
    log_success "Analyse du lien Facebook réussie"
    echo "$LINK_TEST" | jq '.' 2>/dev/null || echo "$LINK_TEST"
else
    log_error "Échec de l'analyse du lien Facebook"
fi

echo ""

# 4. Simulation du message complet
log_info "4. Simulation du message WhatsApp complet..."
SIMULATION=$(curl -s -X POST "${API_BASE_URL}/whatsapp/debug/simulate-incoming" \
    -H "Content-Type: application/json" \
    -d "{
        \"sessionId\": \"${SESSION_ID}\",
        \"fromNumber\": \"+237123456789\",
        \"message\": \"${FACEBOOK_URL}\\n\\nJe voudrais acheter ce produit\",
        \"isGroup\": false,
        \"timestamp\": \"$(date -Iseconds)\"
    }" || echo "error")

if [ "$SIMULATION" != "error" ]; then
    log_success "Simulation du message WhatsApp réussie"
    echo "$SIMULATION" | jq '.' 2>/dev/null || echo "$SIMULATION"
else
    log_warning "Simulation échouée - session peut-être manquante"
    log_info "Créez une session de test d'abord via l'interface web"
fi

echo ""

# 5. Tests additionnels
log_info "5. Tests additionnels..."

# Test avec URL générique
log_info "   - Test avec URL e-commerce générique..."
GENERIC_TEST=$(curl -s -X POST "${API_BASE_URL}/whatsapp/test/facebook-link" \
    -H "Content-Type: application/json" \
    -d "{
        \"sessionId\": \"${SESSION_ID}\",
        \"url\": \"https://example-store.com/product/sac-dos-8000-fcfa\",
        \"followUpMessage\": \"C'est disponible ?\"
    }" || echo "error")

if [ "$GENERIC_TEST" != "error" ]; then
    log_success "Test URL générique réussi"
else
    log_warning "Test URL générique échoué"
fi

# Test analyse d'image
log_info "   - Test d'analyse d'image..."
IMAGE_TEST=$(curl -s "${API_BASE_URL}/whatsapp/vision/test" || echo "error")
if [ "$IMAGE_TEST" != "error" ]; then
    log_success "Test d'analyse d'image réussi"
else
    log_warning "Test d'analyse d'image échoué"
fi

echo ""

# 6. Recommandations
log_info "6. Recommandations pour améliorer les performances..."
echo ""
echo "Pour de meilleures performances :"
echo "  📦 Installez Ollama + LLaVA: ./scripts/install-vision.sh --ollama-only"
echo "  🔑 Configurez OpenAI GPT-4V: OPENAI_API_KEY dans .env"
echo "  🧪 Testez avec de vraies sessions WhatsApp via l'interface web"
echo ""

# 7. URLs utiles
log_info "7. URLs utiles pour tests manuels..."
echo ""
echo "🌐 Interface web: http://localhost:3100"
echo "📖 Documentation API: http://localhost:3100/api/v1/docs"
echo "🔍 Status vision: ${API_BASE_URL}/whatsapp/vision/status"
echo "🧪 Test lien Facebook: POST ${API_BASE_URL}/whatsapp/test/facebook-link"
echo "⚡ Simulation message: POST ${API_BASE_URL}/whatsapp/debug/simulate-incoming"
echo ""

# 8. Exemple de payload pour test manuel
log_info "8. Exemple de payload pour test manuel..."
cat << 'EOF'

Testez avec curl :

curl -X POST http://localhost:3100/api/v1/whatsapp/test/facebook-link \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "url": "https://www.facebook.com/share/p/1PLLfB59dT/?mibextid=wwXIfr",
    "followUpMessage": "Je voudrais acheter ce produit"
  }'

EOF

log_success "🎉 Test du scénario E-Market terminé !"
echo ""
echo "Consultez les logs de l'application pour voir le détail des analyses."
echo "Les améliorations devraient maintenant mieux gérer :"
echo "  ✅ Les liens Facebook E-Market avec métadonnées"
echo "  ✅ Les demandes d'achat contextuelles"
echo "  ✅ L'extraction de prix et détails produits"
echo "  ✅ Les réponses personnalisées selon le média"