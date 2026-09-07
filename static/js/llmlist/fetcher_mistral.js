/**
 * fetcher_mistral.js - Fetcher modelli Mistral (porting di models_mistral.py).
 *
 * Recupera i modelli Mistral dall'endpoint OpenAI-compatibile e applica la
 * medesima logica di filtraggio (solo chat) e normalizzazione dello script Python.
 *
 * @module fetcher_mistral
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://api.mistral.ai/v1/models";

/**
 * Filtro per capacità: solo modelli che supportano la chat completion.
 * @param {Object} m
 * @returns {boolean}
 */
const isChatModel = function(m) {
    const caps = m.capabilities || m.raw?.capabilities || {};
    const isChat = caps.completion_chat === true || caps.completionChat === true;
    return isChat;
};

/**
 * Recupera e filtra i modelli Mistral.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchMistralModels = async function(apiKey) {
    const response = await fetch(API_URL, {
        headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`Mistral: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || []).map(function(m) {
        const id = m.id || "";
        let version = "000";
        if (id.includes("latest")) {
            version = "999";
        }
        const item = {
            id: id,
            version: version,
            contextLength: m.max_context_length || m.maxContextLength || 0,
            raw: m
        };
        return item;
    });

    const fetcher = new ModelFetcher("mistral");
    const filtered = fetcher.filterAndSortModels(models, isChatModel);

    const mapped = filtered.map(m => ({
        id: m.id,
        contextWindow: m.contextLength
    }));
    return mapped;
};
