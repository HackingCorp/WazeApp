#!/bin/bash

# 🚫 Test pour les liens Facebook bloqués
# Usage: ./scripts/test-facebook-blocked.sh

echo "🚫 Test du comportement avec liens Facebook bloqués"
echo "================================================"
echo ""

API_BASE_URL="http://localhost:3100/api/v1"

echo "🔗 Test du lien Facebook de la capture d'écran:"
echo "https://www.facebook.com/share/p/1CPHJHsA7E/?mibextid=wwXIfr"
echo ""

result=$(curl -s -X POST "${API_BASE_URL}/whatsapp/test/facebook-link" \
    -H "Content-Type: application/json" \
    -d '{
        "sessionId": "test-blocked",
        "url": "https://www.facebook.com/share/p/1CPHJHsA7E/?mibextid=wwXIfr",
        "followUpMessage": "Que pouvez-vous me dire sur ce produit"
    }')

echo "📊 Résultat de l'analyse:"
echo "$result" | jq '{
    category: .data.linkAnalysis.metadata.category,
    blocked: .data.linkAnalysis.metadata.blocked,
    hasProduct: .data.linkAnalysis.metadata.hasProduct, 
    isEcommerce: .data.linkAnalysis.metadata.isEcommerce,
    description: .data.linkAnalysis.description
}' 2>/dev/null

echo ""
echo "🎯 Le problème identifié:"
echo "========================"
echo ""
echo "❌ PROBLÈME ACTUEL dans votre capture:"
echo '   L'\''IA répond: "clé USB 64Go à 599€"'
echo '   Alors que l'\''image montre: "Box TV Console 25.000FRC"'
echo ""
echo "✅ SOLUTION IMPLÉMENTÉE:"
echo "   - Détection automatique du blocage Facebook"
echo '   - Catégorie: "social-blocked"'
echo "   - L'IA doit maintenant demander au client de décrire le produit"
echo "   - Plus d'invention de prix/produits erronés"
echo ""
echo "🤖 Nouveau comportement attendu de l'IA:"
echo '   "Je vois que vous avez partagé un lien Facebook, mais je ne peux'
echo '   pas accéder au contenu exact. Pouvez-vous me dire de quel produit'
echo '   il s'\''agit et son prix ?"'
echo ""
echo "🔧 L'IA devrait maintenant être honnête sur ses limitations"
echo "   au lieu d'inventer des informations erronées."