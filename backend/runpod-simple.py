#!/usr/bin/env python3
import runpod
import json

def handler(job):
    """Handler simple pour WizeApp"""
    try:
        input_data = job.get("input", {})
        messages = input_data.get("messages", [])
        
        if not messages:
            return {"error": "No messages provided"}
        
        # Simuler une réponse (remplacer par votre logique LLM)
        last_message = messages[-1].get("content", "")
        response = f"Echo: {last_message}"
        
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": response
                    }
                }
            ],
            "usage": {
                "prompt_tokens": len(last_message.split()),
                "completion_tokens": len(response.split()),
                "total_tokens": len(last_message.split()) + len(response.split())
            }
        }
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})