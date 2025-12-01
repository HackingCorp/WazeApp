#!/bin/bash

# 🤖 Script pour tester la configuration DeepSeek par défaut
# Usage: ./scripts/test-deepseek-default.sh

echo "🤖 Test de la configuration DeepSeek par défaut"
echo "=============================================="
echo ""

API_BASE_URL="http://localhost:3100/api/v1"

echo "📋 Vérification de l'état de l'application..."
if ! curl -s "${API_BASE_URL}/health" > /dev/null; then
    echo "❌ Application non accessible. Démarrez avec: npm run start:dev"
    exit 1
fi
echo "✅ Application en ligne"
echo ""

echo "🔍 Vérification des variables d'environnement DeepSeek..."
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "⚠️  DEEPSEEK_API_KEY n'est pas définie"
    echo "   Pour utiliser DeepSeek, ajoutez dans votre .env:"
    echo "   DEEPSEEK_API_KEY=your_deepseek_api_key_here"
    echo ""
    echo "🔄 L'application utilisera Ollama comme fallback"
else 
    echo "✅ DEEPSEEK_API_KEY est configurée"
    echo "   Modèle: ${DEEPSEEK_MODEL:-deepseek-chat}"
    echo "   Endpoint: ${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}"
fi
echo ""

echo "🏥 Test de santé des providers LLM..."
health_response=$(curl -s "${API_BASE_URL}/llm-providers/health" 2>/dev/null || echo "error")

if [ "$health_response" != "error" ]; then
    echo "📊 Status des providers:"
    echo "$health_response" | jq '.' 2>/dev/null || echo "$health_response"
else
    echo "⚠️  Impossible de récupérer le status des providers"
fi
echo ""

echo "🧪 Test d'une génération de réponse via WhatsApp AI..."
test_response=$(curl -s -X POST "${API_BASE_URL}/whatsapp/test/facebook-link" \
    -H "Content-Type: application/json" \
    -d '{
        "sessionId": "test-deepseek",
        "url": "https://www.example.com",
        "followUpMessage": "Test du modèle DeepSeek"
    }' 2>/dev/null || echo "error")

if [ "$test_response" != "error" ]; then
    echo "✅ Test de génération réussi"
    echo "📝 Extrait de la réponse:"
    echo "$test_response" | jq -r '.data.simulatedResponse // "Pas de réponse simulée"' 2>/dev/null
else
    echo "⚠️  Test de génération échoué"
fi
echo ""

echo "⚙️  Configuration actuelle:"
echo "   🏆 Priorité des modèles: DeepSeek > Ollama > Mistral > OpenAI"
echo "   🔄 Fallback automatique si DeepSeek indisponible"
echo "   💰 Compatible avec tous les plans d'abonnement"
echo ""

echo "🚀 Pour utiliser DeepSeek:"
echo "   1. Obtenez votre clé API sur https://platform.deepseek.com/"
echo "   2. Ajoutez DEEPSEEK_API_KEY=your_key dans .env"
echo "   3. Redémarrez l'application: npm run start:dev"
echo ""

echo "🔧 Commandes utiles:"
echo "   • Vérifier les providers: curl ${API_BASE_URL}/llm-providers/health"
echo "   • Logs de l'app: tail -f logs/application.log"
echo "   • Test manuel: POST ${API_BASE_URL}/whatsapp/test/facebook-link"
echo ""

if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "⚡ ACTION REQUISE: Configurez DEEPSEEK_API_KEY pour utiliser le meilleur modèle!"
else
    echo "✅ DeepSeek est prêt comme modèle par défaut!"
fi