/**
 * fetcher_openrouter.js - Fetcher modelli OpenRouter (porting di models_openrouter.py).
 *
 * Recupera i modelli OpenRouter dall'API e applica la medesima logica di
 * filtraggio (testo + free) e normalizzazione dello script Python.
 *
 * @module fetcher_openrouter
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://openrouter.ai/api/v1/models";

/**
 * Filtro di selezione: solo modelli testuali e con piano gratuito.
 * @param {Object} m
 * @returns {boolean}
 */
const isTextFreeModel = function(m) {
    const modality = (m.architecture && m.architecture.modality) || "";
    const isText = modality.includes("text") && modality.endsWith("text");

    const pricing = m.pricing || {};
    const promptFree = Number(pricing.prompt) === 0;
    const completionFree = Number(pricing.completion) === 0;
    const isFree = promptFree && completionFree;

    return isText && isFree;
};

/**
 * Recupera e filtra i modelli OpenRouter (free + text).
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchOpenRouterModels = async function(apiKey) {
    const headers = { "Authorization": `Bearer ${apiKey}` };
    const response = await fetch(API_URL, { headers });
    if (!response.ok) {
        throw new Error(`OpenRouter: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || []).map(function(m) {
        return {
            id: m.id,
            contextLength: m.context_length || 0,
            raw: m
        };
    });

    const fetcher = new ModelFetcher("openrouter");
    const filtered = fetcher.filterAndSortModels(models, isTextFreeModel);

    return filtered.map(function(m) {
        return {
            id: m.id,
            contextWindow: m.contextLength
        };
    });
};
