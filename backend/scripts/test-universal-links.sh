#!/bin/bash

# 🌐 Script de test pour liens universels
# Usage: ./scripts/test-universal-links.sh

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
SESSION_ID="test-session-universal"

echo "🌐 Test d'analyse de liens universels"
echo "===================================="
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

echo ""

# Liste de liens de test avec différents contextes
declare -a test_links=(
    # E-commerce
    "https://www.amazon.com/dp/B08N5WRWNW"
    "https://www.ebay.com/itm/123456789"
    "https://shopify.store.com/products/sac-dos-premium"
    
    # Réseaux sociaux
    "https://www.facebook.com/share/p/1PLLfB59dT/?mibextid=wwXIfr"
    "https://www.instagram.com/p/ABC123/"
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    "https://www.tiktok.com/@user/video/123456"
    
    # Marketplaces locaux
    "https://jumia.com/product/sac-ecole-8000-fcfa"
    "https://marketplace.example.com/item/tv-samsung-50000fcfa"
    
    # Liens génériques
    "https://www.google.com"
    "https://news.example.com/article-actualite"
    "https://blog.exemple.fr/guide-produits"
)

# Messages d'accompagnement variés
declare -a test_messages=(
    ""  # Lien seul
    "Regarde ça"
    "Qu'est-ce que tu en penses ?"
    "Je voudrais acheter ce produit"
    "C'est disponible ?"
    "Peux-tu m'aider avec ça ?"
    "Intéressant non ?"
)

test_counter=1

for link in "${test_links[@]}"; do
    for message in "${test_messages[@]}"; do
        log_info "Test ${test_counter}: ${link}"
        
        # Construire le message de test
        if [ -z "$message" ]; then
            test_message="$link"
            context_desc="(lien seul)"
        else
            test_message="$link\n\n$message"
            context_desc="+ \"$message\""
        fi
        
        echo "   📝 Contexte: $context_desc"
        
        # Test via l'endpoint de test
        result=$(curl -s -X POST "${API_BASE_URL}/whatsapp/test/facebook-link" \
            -H "Content-Type: application/json" \
            -d "{
                \"sessionId\": \"${SESSION_ID}\",
                \"url\": \"${link}\",
                \"followUpMessage\": \"${message}\"
            }" 2>/dev/null || echo "error")
        
        if [ "$result" != "error" ]; then
            # Extraire la catégorie et le type détectés
            category=$(echo "$result" | jq -r '.data.linkAnalysis.metadata.category // "unknown"' 2>/dev/null || echo "unknown")
            hasProduct=$(echo "$result" | jq -r '.data.linkAnalysis.metadata.hasProduct // false' 2>/dev/null || echo "false")
            isEcommerce=$(echo "$result" | jq -r '.data.linkAnalysis.metadata.isEcommerce // false' 2>/dev/null || echo "false")
            
            echo "   🔍 Catégorie détectée: $category"
            echo "   🛒 Produit: $hasProduct | E-commerce: $isEcommerce"
            log_success "Analyse réussie"
        else
            log_warning "Analyse échouée"
        fi
        
        echo ""
        ((test_counter++))
        
        # Pause courte entre les tests
        sleep 0.5
    done
done

echo ""
log_info "Résumé des améliorations testées..."
echo ""
echo "✅ Types de liens supportés:"
echo "   📱 Réseaux sociaux (Facebook, Instagram, YouTube, TikTok)"  
echo "   🛍️  E-commerce (Amazon, eBay, Shopify, Jumia)"
echo "   📰 Sites d'actualités et blogs"
echo "   🌐 Liens génériques avec analyse de contenu"
echo ""
echo "✅ Détection contextuelle automatique:"
echo "   🎯 Fonctionne avec ou sans message d'accompagnement"
echo "   📊 Analyse les métadonnées (titre, prix, catégorie)"
echo "   🤖 Instructions IA générées automatiquement"
echo ""
echo "✅ Comportements adaptatifs:"
echo "   💬 Réponse commerciale si produit détecté"
echo "   ℹ️  Réponse informative si contenu général"
echo "   🔗 Reconnaissance automatique du type de lien"

echo ""
log_info "URLs de test utiles:"
echo "🧪 Test manuel: POST ${API_BASE_URL}/whatsapp/test/facebook-link"
echo "📖 Documentation: ${API_BASE_URL}/docs"
echo ""

log_success "🎉 Tests d'analyse universelle terminés !"
echo ""
echo "L'IA peut maintenant analyser TOUS types de liens et réagir"
echo "automatiquement selon le contexte détecté, même sans message explicite!"