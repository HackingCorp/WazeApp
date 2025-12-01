# Configuration des modèles Ollama pour WizeApp

## Modèles disponibles

### 1. DeepSeek R1 7B (Actuellement utilisé)
- **Nom**: `deepseek-r1:7b`
- **Taille**: 4.7 GB
- **Caractéristiques**: 
  - Modèle de raisonnement avec processus de réflexion visible
  - Bon pour les tâches complexes
  - Nécessite nettoyage des balises `<think>` dans les réponses

### 2. Qwen 2.5 7B (En cours de téléchargement)
- **Nom**: `qwen2.5:7b`
- **Taille**: 4.7 GB
- **Caractéristiques**:
  - Modèle multilingue performant
  - Excellent support du français
  - Réponses directes sans processus de réflexion
  - Plus rapide que DeepSeek R1

## Configuration dans .env

Pour changer de modèle, modifiez la variable `OLLAMA_MODEL` :

```bash
# Pour DeepSeek R1
OLLAMA_MODEL=deepseek-r1:7b

# Pour Qwen 2.5
OLLAMA_MODEL=qwen2.5:7b
```

## Commandes utiles

```bash
# Lister les modèles installés
ollama list

# Télécharger un nouveau modèle
ollama pull <model-name>

# Supprimer un modèle
ollama rm <model-name>

# Tester un modèle
ollama run <model-name>
```

## Avantages de Qwen 2.5 pour WhatsApp

1. **Réponses directes** : Pas de balises `<think>` à nettoyer
2. **Support multilingue** : Excellent pour français, anglais, arabe
3. **Performance** : Plus rapide et moins gourmand en ressources
4. **Contexte** : Meilleure gestion des conversations longues

## Migration vers Qwen

Une fois le téléchargement terminé :

1. Arrêter l'application : `Ctrl+C`
2. Modifier `.env` : `OLLAMA_MODEL=qwen2.5:7b`
3. Redémarrer : `npm run start:dev`

Le système basculera automatiquement sur Qwen 2.5.