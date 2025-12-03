#!/bin/bash
# Setup script for Ollama with Qwen model

echo "🚀 Setting up Ollama with Qwen model..."

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to start..."
until curl -s http://localhost:11434/api/version > /dev/null 2>&1; do
    sleep 2
    echo "   Waiting for Ollama..."
done
echo "✅ Ollama is running!"

# Pull the Qwen model
echo "📥 Pulling Qwen 2.5 14B model (this may take a while)..."
docker exec wazeapp_ollama ollama pull qwen2.5:14b

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available models:"
docker exec wazeapp_ollama ollama list
echo ""
echo "🎉 Ollama is ready to use with WazeApp!"
