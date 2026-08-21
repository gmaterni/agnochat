/**
 * index.js - Aggregatore dei fetcher modelli per provider.
 *
 * Espone un'unica funzione di discovery che, dato un provider con chiave
 * attiva, restituisce l'elenco dei modelli disponibili. Ogni provider usa il
 * proprio fetcher specifico (porting degli script Python in llmlist/).
 *
 * @module llmlist
 */

"use strict";

import { fetchGeminiModels } from "./fetcher_gemini.js";
import { fetchGroqModels } from "./fetcher_groq.js";
import { fetchMistralModels } from "./fetcher_mistral.js";
import { fetchOpenRouterModels } from "./fetcher_openrouter.js";
import { fetchCerebrasModels } from "./fetcher_cerebras.js";
import { fetchSiliconFlowModels } from "./fetcher_siliconflow.js";

/**
 * Mappa provider → funzione di discovery.
 * @type {Object<string, Function>}
 */
const FETCHERS = {
    gemini: fetchGeminiModels,
    groq: fetchGroqModels,
    mistral: fetchMistralModels,
    openrouter: fetchOpenRouterModels,
    cerebras: fetchCerebrasModels,
    siliconflow: fetchSiliconFlowModels
};

/**
 * Verifica se esiste un fetcher per il provider specificato.
 * @param {string} provider
 * @returns {boolean}
 */
export const hasFetcher = function(provider) {
    return typeof FETCHERS[provider] === "function";
};

/**
 * Scopre i modelli disponibili per il provider specificato.
 * @param {string} provider
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const discoverModels = async function(provider, apiKey) {
    const fetcher = FETCHERS[provider];
    if (!fetcher) {
        throw new Error(`Nessun fetcher per il provider "${provider}"`);
    }
    return fetcher(apiKey);
};

/**
 * Aggregatore LLMLIST.
 */
export const LLMLIST = {
    hasFetcher,
    discoverModels
};
