#!/bin/bash

# 🎯 Script d'installation automatique des services de vision open source
# Usage: ./scripts/install-vision.sh [options]

set -e  # Arrêter en cas d'erreur

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

# Variables
OLLAMA_INSTALLED=false
TESSERACT_INSTALLED=false
LLAVA_INSTALLED=false

# Fonction d'aide
show_help() {
    echo "🎯 Installation des services de vision open source pour WazeApp"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Afficher cette aide"
    echo "  --ollama-only       Installer seulement Ollama + LLaVA"
    echo "  --tesseract-only    Installer seulement Tesseract OCR"
    echo "  --check             Vérifier seulement les installations existantes"
    echo "  --skip-model        Skiper l'installation du modèle LLaVA"
    echo ""
    echo "Exemples:"
    echo "  $0                  # Installation complète"
    echo "  $0 --ollama-only    # Installer seulement Ollama"
    echo "  $0 --check          # Vérifier le statut"
    echo ""
}

# Vérifier les installations existantes
check_installations() {
    log_info "Vérification des installations existantes..."
    
    # Vérifier Ollama
    if command -v ollama &> /dev/null; then
        OLLAMA_INSTALLED=true
        log_success "Ollama est installé"
        
        # Vérifier les modèles LLaVA
        if ollama list | grep -q "llava"; then
            LLAVA_INSTALLED=true
            log_success "Modèle LLaVA détecté"
        else
            log_warning "Ollama installé mais pas de modèle LLaVA"
        fi
    else
        log_warning "Ollama n'est pas installé"
    fi
    
    # Vérifier Tesseract
    if command -v tesseract &> /dev/null; then
        TESSERACT_INSTALLED=true
        log_success "Tesseract OCR est installé"
    else
        log_warning "Tesseract OCR n'est pas installé"
    fi
    
    # Vérifier Node.js dependencies
    if [ -f "package.json" ]; then
        if npm list tesseract.js &> /dev/null; then
            log_success "Tesseract.js (Node.js) est installé"
        else
            log_warning "Tesseract.js (Node.js) n'est pas installé"
        fi
    fi
}

# Installer Ollama
install_ollama() {
    if [ "$OLLAMA_INSTALLED" = true ]; then
        log_info "Ollama déjà installé, passage à l'étape suivante"
        return
    fi
    
    log_info "Installation d'Ollama..."
    
    # Détecter l'OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            log_info "Installation d'Ollama via Homebrew..."
            brew install ollama
        else
            log_error "Homebrew n'est pas installé. Installez-le depuis https://brew.sh/"
            log_info "Ou téléchargez Ollama manuellement depuis https://ollama.ai/download"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        log_info "Installation d'Ollama via script officiel..."
        curl -fsSL https://ollama.ai/install.sh | sh
    else
        log_error "OS non supporté pour l'installation automatique"
        log_info "Téléchargez Ollama manuellement depuis https://ollama.ai/download"
        exit 1
    fi
    
    log_success "Ollama installé avec succès"
    OLLAMA_INSTALLED=true
}

# Démarrer Ollama
start_ollama() {
    log_info "Démarrage du service Ollama..."
    
    # Vérifier si Ollama est déjà en cours d'exécution
    if curl -s http://localhost:11434/api/tags &> /dev/null; then
        log_success "Ollama est déjà en cours d'exécution"
        return
    fi
    
    # Démarrer Ollama en arrière-plan
    log_info "Lancement d'Ollama en arrière-plan..."
    nohup ollama serve > /dev/null 2>&1 &
    
    # Attendre que le service soit prêt
    log_info "Attente du démarrage du service Ollama..."
    for i in {1..30}; do
        if curl -s http://localhost:11434/api/tags &> /dev/null; then
            log_success "Service Ollama prêt"
            return
        fi
        sleep 1
    done
    
    log_error "Impossible de démarrer le service Ollama"
    exit 1
}

# Installer le modèle LLaVA
install_llava() {
    if [ "$LLAVA_INSTALLED" = true ]; then
        log_info "Modèle LLaVA déjà installé"
        return
    fi
    
    log_info "Installation du modèle LLaVA (cela peut prendre 5-10 minutes)..."
    log_warning "Le modèle LLaVA fait environ 4GB, assurez-vous d'avoir assez d'espace disque"
    
    # Proposer le choix du modèle
    echo ""
    echo "Quel modèle LLaVA souhaitez-vous installer ?"
    echo "1) llava:7b (4GB) - Recommandé pour la plupart des cas"
    echo "2) llava:13b (7GB) - Meilleure qualité, nécessite plus de RAM"
    echo "3) llava:latest (alias vers 7b)"
    echo ""
    read -p "Votre choix (1-3, défaut: 1): " choice
    
    case $choice in
        2)
            MODEL="llava:13b"
            ;;
        3)
            MODEL="llava:latest"
            ;;
        *)
            MODEL="llava:7b"
            ;;
    esac
    
    log_info "Installation de $MODEL..."
    if ollama pull "$MODEL"; then
        log_success "Modèle $MODEL installé avec succès"
        LLAVA_INSTALLED=true
    else
        log_error "Échec de l'installation du modèle $MODEL"
        exit 1
    fi
}

# Installer Tesseract
install_tesseract() {
    if [ "$TESSERACT_INSTALLED" = true ]; then
        log_info "Tesseract déjà installé"
        return
    fi
    
    log_info "Installation de Tesseract OCR..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install tesseract tesseract-lang
        else
            log_error "Homebrew requis pour installer Tesseract sur macOS"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng
        elif command -v yum &> /dev/null; then
            sudo yum install -y tesseract tesseract-langpack-fra tesseract-langpack-eng
        else
            log_error "Gestionnaire de paquets non supporté"
            exit 1
        fi
    fi
    
    log_success "Tesseract OCR installé avec succès"
    TESSERACT_INSTALLED=true
}

# Installer les dépendances Node.js
install_node_dependencies() {
    log_info "Installation des dépendances Node.js..."
    
    if [ -f "package.json" ]; then
        log_info "Installation de tesseract.js..."
        if npm install tesseract.js --legacy-peer-deps; then
            log_success "tesseract.js installé avec succès"
        else
            log_warning "Échec de l'installation de tesseract.js (non critique)"
        fi
    else
        log_warning "package.json non trouvé, skipping dépendances Node.js"
    fi
}

# Tester les installations
test_installations() {
    log_info "Test des installations..."
    
    # Test Ollama
    if [ "$OLLAMA_INSTALLED" = true ]; then
        log_info "Test d'Ollama..."
        if ollama list | grep -q "llava"; then
            log_success "Ollama + LLaVA fonctionnels"
        else
            log_warning "Ollama installé mais modèle LLaVA non trouvé"
        fi
    fi
    
    # Test Tesseract
    if [ "$TESSERACT_INSTALLED" = true ]; then
        log_info "Test de Tesseract..."
        if tesseract --version &> /dev/null; then
            log_success "Tesseract OCR fonctionnel"
        else
            log_warning "Problème avec Tesseract OCR"
        fi
    fi
}

# Afficher le résumé final
show_summary() {
    echo ""
    echo "============================================"
    log_success "🎉 Installation terminée !"
    echo "============================================"
    echo ""
    echo "Services installés :"
    [ "$OLLAMA_INSTALLED" = true ] && echo "  ✅ Ollama + LLaVA (vision AI)"
    [ "$TESSERACT_INSTALLED" = true ] && echo "  ✅ Tesseract OCR (extraction de texte)"
    echo ""
    echo "Prochaines étapes :"
    echo "  1. Redémarrez votre application WazeApp"
    echo "  2. Testez avec: npm run vision:test"
    echo "  3. Vérifiez le statut: GET /api/v1/whatsapp/vision/status"
    echo ""
    echo "Configuration recommandée dans .env :"
    echo "  OLLAMA_BASE_URL=http://localhost:11434"
    echo "  # OPENAI_API_KEY=sk-... (optionnel, fallback)"
    echo ""
    echo "Pour plus d'infos, consultez VISION-OPEN-SOURCE-SETUP.md"
}

# Script principal
main() {
    echo "🎯 Installation des services de vision open source"
    echo "=================================================="
    echo ""
    
    # Parser les arguments
    OLLAMA_ONLY=false
    TESSERACT_ONLY=false
    CHECK_ONLY=false
    SKIP_MODEL=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            --ollama-only)
                OLLAMA_ONLY=true
                shift
                ;;
            --tesseract-only)
                TESSERACT_ONLY=true
                shift
                ;;
            --check)
                CHECK_ONLY=true
                shift
                ;;
            --skip-model)
                SKIP_MODEL=true
                shift
                ;;
            *)
                log_error "Option inconnue: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Vérifier les installations existantes
    check_installations
    
    if [ "$CHECK_ONLY" = true ]; then
        echo ""
        log_info "Vérification terminée"
        exit 0
    fi
    
    # Installation selon les options
    if [ "$TESSERACT_ONLY" = true ]; then
        install_tesseract
        install_node_dependencies
    elif [ "$OLLAMA_ONLY" = true ]; then
        install_ollama
        start_ollama
        [ "$SKIP_MODEL" = false ] && install_llava
    else
        # Installation complète
        install_ollama
        start_ollama
        [ "$SKIP_MODEL" = false ] && install_llava
        install_tesseract
        install_node_dependencies
    fi
    
    # Tests et résumé
    test_installations
    show_summary
}

# Exécuter le script principal
main "$@"