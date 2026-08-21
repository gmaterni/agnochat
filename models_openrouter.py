#!/usr/bin/env python3
"""
Recupera i modelli OpenRouter dalle API.
"""

"""
Script per ottenere i modelli OpenRouter filtrati (Free & Text) e salvarli in file.
"""

import os
import requests
from pathlib import Path

def filter_and_sort_models(models):
    """
    HIGHLIGHT: Filtri di selezione
    1. Solo modelli che supportano la generazione di testo.
    2. Solo modelli con piano di prezzo FREE.
    3. Per modelli con lo stesso nome, mantiene il più aggiornato.
    """
    filtered = []
    for model in models:
        architecture = model.get("architecture", {})
        modality = architecture.get("modality", "")
        is_text = "text" in modality and modality.endswith("text")
        
        pricing = model.get("pricing", {})
        is_free = float(pricing.get("prompt", 1)) == 0 and float(pricing.get("completion", 1)) == 0
        
        if is_text and is_free:
            filtered.append(model)
            
    latest_models = {}
    for m in filtered:
        model_id = m.get("id")
        name_parts = model_id.split("/")
        provider = name_parts[0]
        model_name = name_parts[1] if len(name_parts) > 1 else model_id
        
        parts = model_name.split(":")
        base_name = f"{provider}/{parts[0]}"
        version = parts[1] if len(parts) > 1 else "000"
        
        if base_name not in latest_models:
            latest_models[base_name] = (version, m)
        else:
            current_version, _ = latest_models[base_name]
            if version > current_version:
                latest_models[base_name] = (version, m)
                
    return [item[1] for item in latest_models.values()]

def main():
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("ERRORE: Imposta la variabile d'ambiente OPENROUTER_API_KEY")
        return
    
    url = "https://openrouter.ai/api/v1/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        all_models = response.json().get("data", [])
        
        filtered_models = filter_and_sort_models(all_models)
        
        Path("data").mkdir(exist_ok=True)
        
        # 1. Salva nomi e finestra
        with open("data/models_openrouter.txt", "w") as f:
            for m in sorted(filtered_models, key=lambda x: x.get("id")):
                limit = m.get("context_length", 0)
                k_limit = f"{limit // 1024}k" if limit >= 1024 else f"{limit}"
                f.write(f"{m.get('id')}|{k_limit}\n")
                
        # 3. Salva info dettagliate
        with open("data/models_openrouter_info.txt", "w") as f:
            f.write("MODELLI OPENROUTER (FREE) - INFORMAZIONI DETTAGLIATE\n")
            f.write("=" * 50 + "\n\n")
            for m in sorted(filtered_models, key=lambda x: x.get("id")):
                f.write(f"ID: {m.get('id')}\n")
                f.write(f"Nome: {m.get('name')}\n")
                f.write(f"Context: {m.get('context_length')}\n")
                f.write(f"Modality: {m.get('architecture', {}).get('modality')}\n")
                f.write("-" * 30 + "\n")

        print(f"Completato! Salvati {len(filtered_models)} modelli OpenRouter FREE in data/")
        
    except Exception as e:
        print(f"Errore: {e}")

if __name__ == "__main__":
    main()