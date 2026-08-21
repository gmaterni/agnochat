/**
 * fetcher_groq.js - Fetcher modelli Groq (porting di models_groq.py).
 *
 * Recupera i modelli Groq dall'endpoint OpenAI-compatibile e applica la
 * medesima logica di normalizzazione dello script Python.
 *
 * @module fetcher_groq
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://api.groq.com/openai/v1/models";

/**
 * Recupera e filtra i modelli Groq. In Groq tutti i modelli supportano la
 * generazione di testo, quindi vengono inclusi tutti.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchGroqModels = async function(apiKey) {
    const response = await fetch(API_URL, {
        headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`Groq: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || []).map(function(m) {
        return {
            id: m.id,
            contextLength: m.context_length || 8192,
            raw: m
        };
    });

    const fetcher = new ModelFetcher("groq");
    const filtered = fetcher.filterAndSortModels(models);

    return filtered.map(function(m) {
        return {
            id: m.id,
            contextWindow: m.contextLength
        };
    });
};
