/**
 * fetcher_cerebras.js - Fetcher modelli Cerebras (porting di models_cerebras.py).
 *
 * Recupera i modelli Cerebras dall'endpoint OpenAI-compatibile e applica la
 * medesima logica di filtraggio/normalizzazione dello script Python.
 *
 * @module fetcher_cerebras
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://api.cerebras.ai/v1/models";

/**
 * Stima la finestra di contesto in base al nome (porting di get_context_window).
 * @param {string} modelId
 * @returns {number}
 */
const getContextWindow = function(modelId) {
    if (modelId.includes("llama-3.1") || modelId.includes("llama-3.3")) {
        const result = 131072;
        return result;
    }
    if (modelId.includes("llama3")) {
        const result = 8192;
        return result;
    }
    const result = 8192;
    return result;
};

/**
 * Recupera e filtra i modelli Cerebras.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchCerebrasModels = async function(apiKey) {
    const response = await fetch(API_URL, {
        headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`Cerebras: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || []).map(m => ({ id: m.id, raw: m }));

    const fetcher = new ModelFetcher("cerebras");
    const filtered = fetcher.filterAndSortModels(models);

    const mapped = filtered.map(m => ({
        id: m.id,
        contextWindow: getContextWindow(m.id)
    }));
    return mapped;
};
