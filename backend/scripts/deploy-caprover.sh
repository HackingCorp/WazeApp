#!/bin/bash

set -e

# Configuration pour CapRover existant
CAPROVER_URL="captain.wazeapp.ai"  # ou l'URL de votre CapRover existant
APP_NAME="wazeapp"
DOMAIN="wazeapp.ai"

echo "🚀 Starting CapRover deployment for WazeApp..."

# Check if CapRover CLI is installed
if ! command -v caprover &> /dev/null; then
    echo "📦 Installing CapRover CLI..."
    npm install -g caprover
fi

echo "🔐 Logging into CapRover..."
echo "Please login to your CapRover instance manually:"
echo "caprover serversetup"

echo "📱 Creating app on CapRover..."
caprover api --path "/user/apps/appDefinitions" --method POST --data "{
    \"appName\": \"$APP_NAME\",
    \"hasPersistentData\": true
}"

echo "🌐 Setting up domain..."
caprover api --path "/user/apps/appDefinitions" --method POST --data "{
    \"appName\": \"$APP_NAME\",
    \"customDomain\": \"$DOMAIN\"
}"

echo "⚙️ Configuring environment variables..."
caprover api --path "/user/apps/appDefinitions/$APP_NAME" --method POST --data "{
    \"envVars\": [
        {\"key\": \"NODE_ENV\", \"value\": \"production\"},
        {\"key\": \"DATABASE_HOST\", \"value\": \"srv-captain--wazeapp-db\"},
        {\"key\": \"DATABASE_PORT\", \"value\": \"5432\"},
        {\"key\": \"DATABASE_USERNAME\", \"value\": \"wazeapp\"},
        {\"key\": \"DATABASE_PASSWORD\", \"value\": \"wazeapp123\"},
        {\"key\": \"DATABASE_NAME\", \"value\": \"wazeapp\"},
        {\"key\": \"REDIS_HOST\", \"value\": \"srv-captain--wazeapp-redis\"},
        {\"key\": \"REDIS_PORT\", \"value\": \"6379\"},
        {\"key\": \"MINIO_ENDPOINT\", \"value\": \"srv-captain--wazeapp-minio\"},
        {\"key\": \"MINIO_PORT\", \"value\": \"9000\"},
        {\"key\": \"MINIO_ACCESS_KEY\", \"value\": \"wazeapp\"},
        {\"key\": \"MINIO_SECRET_KEY\", \"value\": \"wazeapp123\"},
        {\"key\": \"RUNPOD_API_KEY\", \"value\": \"your-runpod-api-key\"},
        {\"key\": \"RUNPOD_ENDPOINT_ID\", \"value\": \"your-endpoint-id\"},
        {\"key\": \"JWT_ACCESS_SECRET\", \"value\": \"$(openssl rand -base64 32)\"},
        {\"key\": \"JWT_REFRESH_SECRET\", \"value\": \"$(openssl rand -base64 32)\"},
        {\"key\": \"JWT_VERIFICATION_SECRET\", \"value\": \"$(openssl rand -base64 32)\"}
    ]
}"

echo "🗄️ Setting up PostgreSQL database..."
caprover api --path "/user/apps/oneClickApps" --method POST --data "{
    \"appName\": \"$APP_NAME-db\",
    \"oneClickApp\": {
        \"templateId\": \"postgresql\",
        \"variables\": [
            {\"id\": \"POSTGRES_DB\", \"value\": \"wazeapp\"},
            {\"id\": \"POSTGRES_USER\", \"value\": \"wazeapp\"},
            {\"id\": \"POSTGRES_PASSWORD\", \"value\": \"wazeapp123\"}
        ]
    }
}"

echo "📦 Setting up Redis cache..."
caprover api --path "/user/apps/oneClickApps" --method POST --data "{
    \"appName\": \"$APP_NAME-redis\",
    \"oneClickApp\": {
        \"templateId\": \"redis\",
        \"variables\": []
    }
}"

echo "💾 Setting up MinIO storage..."
caprover api --path "/user/apps/oneClickApps" --method POST --data "{
    \"appName\": \"$APP_NAME-minio\",
    \"oneClickApp\": {
        \"templateId\": \"minio\",
        \"variables\": [
            {\"id\": \"MINIO_ROOT_USER\", \"value\": \"wazeapp\"},
            {\"id\": \"MINIO_ROOT_PASSWORD\", \"value\": \"wazeapp123\"}
        ]
    }
}"

echo "📊 Setting up monitoring..."
caprover api --path "/user/apps/oneClickApps" --method POST --data "{
    \"appName\": \"$APP_NAME-prometheus\",
    \"oneClickApp\": {
        \"templateId\": \"prometheus\",
        \"variables\": []
    }
}"

caprover api --path "/user/apps/oneClickApps" --method POST --data "{
    \"appName\": \"$APP_NAME-grafana\",
    \"oneClickApp\": {
        \"templateId\": \"grafana\",
        \"variables\": [
            {\"id\": \"GF_SECURITY_ADMIN_PASSWORD\", \"value\": \"admin123\"}
        ]
    }
}"

echo "🚀 Deploying application..."
caprover deploy --appName "$APP_NAME"

echo "🔒 Enabling HTTPS..."
caprover api --path "/user/apps/appDefinitions/$APP_NAME" --method POST --data "{
    \"forceSsl\": true,
    \"redirectDomain\": \"$DOMAIN\"
}"

echo "✅ Deployment completed!"
echo "🌐 Your app is available at: https://$DOMAIN"
echo "📊 Grafana dashboard: https://$APP_NAME-grafana.apps.wazeapp.ai (admin/admin123)"
echo "💾 MinIO console: https://$APP_NAME-minio.apps.wazeapp.ai (wazeapp/wazeapp123)"

echo ""
echo "📋 Next steps:"
echo "1. Configure your DNS to point $DOMAIN to 94.250.201.167"
echo "2. Set up RunPod credentials in the app settings"
echo "3. Run database migrations"
echo "4. Test the application"

echo ""
echo "🔧 To update RunPod credentials:"
echo "caprover api --path \"/user/apps/appDefinitions/$APP_NAME\" --method POST --data '{\"envVars\": [{\"key\": \"RUNPOD_API_KEY\", \"value\": \"YOUR_ACTUAL_KEY\"}, {\"key\": \"RUNPOD_ENDPOINT_ID\", \"value\": \"YOUR_ACTUAL_ENDPOINT\"}]}'"