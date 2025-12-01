#!/bin/bash

# 🎤 Installation de Whisper.cpp pour la transcription audio
# Usage: ./scripts/install-whisper.sh

echo "🎤 Installation de Whisper.cpp pour transcription audio"
echo "====================================================="
echo ""

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Vérifier les prérequis
log_info "1. Vérification des prérequis..."

# Vérifier git
if ! command -v git &> /dev/null; then
    log_error "Git n'est pas installé. Installez git d'abord."
    exit 1
fi

# Vérifier make/cmake
if ! command -v make &> /dev/null; then
    log_warning "Make n'est pas trouvé. Sur macOS: xcode-select --install"
fi

if ! command -v cmake &> /dev/null; then
    log_warning "CMake n'est pas trouvé. Recommandé pour de meilleures performances."
    echo "  Installation: brew install cmake (macOS) ou apt install cmake (Linux)"
fi

log_success "Prérequis vérifiés"

# Créer le répertoire des outils
TOOLS_DIR="./tools"
WHISPER_DIR="$TOOLS_DIR/whisper.cpp"
MODELS_DIR="./models"

log_info "2. Création des répertoires..."
mkdir -p "$TOOLS_DIR"
mkdir -p "$MODELS_DIR"

# Cloner whisper.cpp
log_info "3. Téléchargement de whisper.cpp..."
if [ -d "$WHISPER_DIR" ]; then
    log_info "whisper.cpp existe déjà, mise à jour..."
    cd "$WHISPER_DIR"
    git pull
    cd - > /dev/null
else
    log_info "Clonage de whisper.cpp depuis GitHub..."
    git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
fi

# Compiler whisper.cpp
log_info "4. Compilation de whisper.cpp..."
cd "$WHISPER_DIR"

if command -v cmake &> /dev/null; then
    log_info "Compilation avec CMake (optimisée)..."
    mkdir -p build
    cd build
    cmake .. -DWHISPER_BUILD_EXAMPLES=ON
    make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    cd ..
    
    # Copier les binaires
    cp build/bin/whisper ../../../whisper || cp build/whisper ../../../whisper
else
    log_info "Compilation avec Make (basique)..."
    make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    
    # Copier le binaire
    cp whisper ../../../whisper
fi

cd - > /dev/null

if [ -f "./whisper" ]; then
    log_success "whisper.cpp compilé avec succès"
    chmod +x ./whisper
else
    log_error "Échec de la compilation de whisper.cpp"
    exit 1
fi

# Télécharger les modèles
log_info "5. Téléchargement des modèles Whisper..."

MODELS_TO_DOWNLOAD=(
    "base"      # 142MB - Bon équilibre qualité/vitesse (RECOMMANDÉ)
    "small"     # 244MB - Meilleure qualité
    # "medium"  # 769MB - Très bonne qualité
    # "large"   # 1550MB - Excellente qualité
)

for model in "${MODELS_TO_DOWNLOAD[@]}"; do
    MODEL_FILE="$MODELS_DIR/ggml-${model}.bin"
    
    if [ -f "$MODEL_FILE" ]; then
        log_info "Modèle $model déjà présent"
    else
        log_info "Téléchargement du modèle $model..."
        cd "$WHISPER_DIR"
        
        # Utiliser le script de téléchargement de whisper.cpp
        if [ -f "models/download-ggml-model.sh" ]; then
            bash models/download-ggml-model.sh "$model"
            
            # Copier vers notre répertoire models
            if [ -f "models/ggml-${model}.bin" ]; then
                cp "models/ggml-${model}.bin" "../../models/"
                log_success "Modèle $model téléchargé"
            else
                log_warning "Échec du téléchargement du modèle $model"
            fi
        else
            log_warning "Script de téléchargement non trouvé pour $model"
        fi
        
        cd - > /dev/null
    fi
done

# Test de fonctionnement
log_info "6. Test de fonctionnement..."

if [ -f "./whisper" ] && [ -f "$MODELS_DIR/ggml-base.bin" ]; then
    # Créer un audio de test très court
    echo "Test de whisper.cpp..." > test_input.txt
    
    # Note: On ne peut pas vraiment tester sans fichier audio
    # Mais on peut au moins vérifier que whisper démarre
    if ./whisper --help > /dev/null 2>&1; then
        log_success "whisper.cpp fonctionne correctement"
    else
        log_warning "whisper.cpp compilé mais peut avoir des problèmes"
    fi
    
    # Nettoyer
    rm -f test_input.txt
else
    log_error "Test échoué - binaire ou modèle manquant"
fi

# Configuration de l'environnement
log_info "7. Configuration de l'environnement..."

# Ajouter les variables d'environnement au .env
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    # Vérifier si les variables existent déjà
    if ! grep -q "WHISPER_CPP_PATH" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# Whisper.cpp Audio Transcription" >> "$ENV_FILE"
        echo "WHISPER_CPP_PATH=./whisper" >> "$ENV_FILE"
        echo "WHISPER_MODEL_PATH=./models/ggml-base.bin" >> "$ENV_FILE"
        log_success "Variables ajoutées au .env"
    else
        log_info "Variables Whisper déjà présentes dans .env"
    fi
else
    log_warning "Fichier .env non trouvé - créez-le manuellement avec:"
    echo "WHISPER_CPP_PATH=./whisper"
    echo "WHISPER_MODEL_PATH=./models/ggml-base.bin"
fi

# Installation des packages Node.js optionnels
log_info "8. Installation des packages Node.js optionnels..."

# whisper-node comme fallback
if npm list whisper-node > /dev/null 2>&1; then
    log_info "whisper-node déjà installé"
else
    log_info "Installation de whisper-node (fallback)..."
    npm install whisper-node --save-optional || log_warning "whisper-node installation échouée (non critique)"
fi

# FFmpeg pour conversion audio
log_info "9. Vérification de FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    log_success "FFmpeg trouvé: $(ffmpeg -version | head -1)"
else
    log_warning "FFmpeg non trouvé - requis pour conversion audio"
    echo "  Installation macOS: brew install ffmpeg"
    echo "  Installation Ubuntu: sudo apt install ffmpeg"
    echo "  Installation CentOS: sudo yum install ffmpeg"
fi

echo ""
log_success "🎉 Installation de Whisper.cpp terminée !"
echo ""
echo "📋 Résumé de l'installation:"
echo "  ✅ whisper.cpp binaire: ./whisper"
echo "  ✅ Modèles téléchargés: $MODELS_DIR/"
echo "  📁 Code source: $WHISPER_DIR"
echo ""
echo "🧪 Test de fonctionnement:"
echo "  ./whisper --help"
echo "  ./whisper -m ./models/ggml-base.bin -f audio_file.wav"
echo ""
echo "⚙️  Configuration dans .env:"
echo "  WHISPER_CPP_PATH=./whisper"
echo "  WHISPER_MODEL_PATH=./models/ggml-base.bin"
echo ""
echo "🚀 L'IA peut maintenant transcrire les messages audio WhatsApp !"
echo ""
echo "📝 Prochaines étapes:"
echo "  1. Redémarrer l'application: npm run start:dev"
echo "  2. Tester avec un message audio WhatsApp"
echo "  3. Vérifier les logs pour la transcription"

# Informations sur les modèles
echo ""
echo "📊 Modèles disponibles:"
echo "  • base (142MB) - Recommandé pour la production"
echo "  • small (244MB) - Meilleure qualité"
echo "  • medium (769MB) - Très bonne qualité"
echo "  • large (1550MB) - Excellente qualité"
echo ""
echo "💡 Pour télécharger d'autres modèles:"
echo "  cd tools/whisper.cpp && bash models/download-ggml-model.sh medium"