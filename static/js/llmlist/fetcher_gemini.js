/**
 * fetcher_gemini.js - Fetcher modelli Gemini (porting di models_gemini.py).
 *
 * Recupera i modelli Gemini dall'API e applica la medesima logica di
 * filtraggio (solo generateContent) e normalizzazione dello script Python.
 *
 * @module fetcher_gemini
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Filtro per capacità: solo modelli che supportano la generazione di testo.
 * L'endpoint REST espone il campo "supportedGenerationMethods"; l'SDK Python
 * lo deriva in "supported_actions". Gestiamo entrambi, leggendo dal raw.
 * @param {Object} m
 * @returns {boolean}
 */
const isTextModel = function(m) {
    const raw = (m && m.raw) || m || {};
    const actions = raw.supportedActions || raw.supported_actions || raw.supportedGenerationMethods || [];
    return actions.includes("generateContent");
};

/**
 * Recupera e filtra i modelli Gemini.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchGeminiModels = async function(apiKey) {
    const response = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
        throw new Error(`Gemini: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.models || []).map(function(m) {
        return {
            id: (m.name || "").replace(/^models\//, ""),
            inputTokenLimit: m.inputTokenLimit || m.input_token_limit || 0,
            raw: m
        };
    });

    const fetcher = new ModelFetcher("gemini");
    const filtered = fetcher.filterAndSortModels(models, isTextModel);

    return filtered.map(function(m) {
        return {
            id: m.id,
            contextWindow: m.inputTokenLimit
        };
    });
};
