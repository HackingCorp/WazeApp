#!/usr/bin/env python3
"""
Handler RunPod pour DeepSeek-R1 avec WazeApp
"""
import runpod
import torch
import json
import os
from transformers import AutoTokenizer, AutoModelForCausalLM
import time

# Variables globales pour le cache du modèle
model = None
tokenizer = None
model_loaded = False

def load_model():
    """Charge le modèle DeepSeek-R1 une seule fois"""
    global model, tokenizer, model_loaded
    
    if model_loaded:
        return
        
    print("🔄 Loading DeepSeek-R1-Distill-Llama-8B...")
    start_time = time.time()
    
    try:
        # Charger le tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
            trust_remote_code=True
        )
        
        # Charger le modèle avec optimisations GPU
        model = AutoModelForCausalLM.from_pretrained(
            "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
            low_cpu_mem_usage=True
        )
        
        model_loaded = True
        load_time = time.time() - start_time
        print(f"✅ Model loaded successfully in {load_time:.2f}s")
        
    except Exception as e:
        print(f"❌ Error loading model: {str(e)}")
        raise e

def format_messages(messages):
    """Convertit les messages en format prompt pour DeepSeek"""
    prompt = ""
    
    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")
        
        if role == "system":
            prompt += f"<|system|>\n{content}<|end|>\n"
        elif role == "user":
            prompt += f"<|user|>\n{content}<|end|>\n"
        elif role == "assistant":
            prompt += f"<|assistant|>\n{content}<|end|>\n"
    
    # Ajouter le début de la réponse assistant
    prompt += "<|assistant|>\n"
    return prompt

def handler(job):
    """Handler principal pour les requêtes RunPod"""
    start_time = time.time()
    
    try:
        # Charger le modèle si nécessaire
        load_model()
        
        # Extraire les paramètres
        input_data = job.get("input", {})
        messages = input_data.get("messages", [])
        max_tokens = input_data.get("max_tokens", 2048)
        temperature = input_data.get("temperature", 0.7)
        top_p = input_data.get("top_p", 0.9)
        
        if not messages:
            return {"error": "No messages provided"}
        
        # Formatter le prompt
        prompt = format_messages(messages)
        print(f"📝 Prompt: {prompt[:200]}...")
        
        # Tokeniser
        inputs = tokenizer(
            prompt, 
            return_tensors="pt", 
            truncation=True, 
            max_length=4096
        ).to(model.device)
        
        # Générer la réponse
        print("🤖 Generating response...")
        gen_start = time.time()
        
        with torch.no_grad():
            outputs = model.generate(
                inputs.input_ids,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
                repetition_penalty=1.1
            )
        
        gen_time = time.time() - gen_start
        
        # Décoder la réponse
        response_tokens = outputs[0][inputs.input_ids.shape[1]:]
        response = tokenizer.decode(response_tokens, skip_special_tokens=True)
        
        # Nettoyer la réponse
        if "<|end|>" in response:
            response = response.split("<|end|>")[0]
        
        # Calculer les stats
        prompt_tokens = inputs.input_ids.shape[1]
        completion_tokens = len(response_tokens)
        total_tokens = prompt_tokens + completion_tokens
        total_time = time.time() - start_time
        
        print(f"✅ Response generated in {gen_time:.2f}s, total: {total_time:.2f}s")
        
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": response.strip()
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens
            },
            "model": "deepseek-r1-distill-llama-8b",
            "execution_time": total_time,
            "generation_time": gen_time
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error in handler: {error_msg}")
        return {
            "error": error_msg,
            "execution_time": time.time() - start_time
        }

def test_handler():
    """Test local du handler"""
    test_job = {
        "input": {
            "messages": [
                {"role": "user", "content": "Bonjour, comment allez-vous ?"}
            ],
            "max_tokens": 100,
            "temperature": 0.7
        }
    }
    
    result = handler(test_job)
    print("Test result:", json.dumps(result, indent=2))

if __name__ == "__main__":
    # Test en local si exécuté directement
    if os.environ.get("RUNPOD_ENDPOINT_ID"):
        print("🚀 Starting RunPod serverless handler...")
        runpod.serverless.start({"handler": handler})
    else:
        print("🧪 Running local test...")
        test_handler()