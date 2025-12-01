#!/bin/bash

# Script pour mettre à jour les clés RunPod sur le VPS

echo "🔑 Mise à jour des clés RunPod"

# Remplacez ces valeurs par vos vraies clés RunPod
RUNPOD_API_KEY="VOTRE_VRAIE_CLE_API"
RUNPOD_ENDPOINT_ID="VOTRE_VRAI_ENDPOINT_ID"

# Arrêter les services
docker-compose down

# Mettre à jour les variables d'environnement
sed -i "s/RUNPOD_API_KEY=CHANGEME/RUNPOD_API_KEY=$RUNPOD_API_KEY/g" docker-compose.yml
sed -i "s/RUNPOD_ENDPOINT_ID=CHANGEME/RUNPOD_ENDPOINT_ID=$RUNPOD_ENDPOINT_ID/g" docker-compose.yml

# Redémarrer les services
docker-compose up -d

echo "✅ Clés RunPod mises à jour et services redémarrés"