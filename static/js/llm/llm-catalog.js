/**
 * llm-catalog.js - Lettura del catalogo modelli locale.
 *
 * Unico punto di accesso ai file static/data/models/<provider>.txt.
 * L'elenco dei provider è quello dei client implementati in llmclient
 * (IMPLEMENTED_CLIENTS in services/key_retriever.js): nessun manifest.json.
 * Un file .txt mancante NON genera errori: il provider semplicemente avrà 0 modelli.
 *
 * @module llm/llm-catalog
 * @version 1.1.0
 */

"use strict";

const MODELS_DIR = "./data/models/";

/**
 * Carica i modelli di un provider dal file <provider>.txt.
 * Se il file non esiste o non è valido, restituisce lista vuota (nessun errore).
 * @param {string} provider
 * @returns {Promise<Array<{name: string, windowSize: number}>>}
 */
export const loadProviderModels = async function(provider) {
    try {
        const response = await fetch(MODELS_DIR + provider + ".txt");
        if (!response.ok) {
            return [];
        }
        const text = await response.text();
        const lines = text.split("\n").filter(function(line) {
            return line.trim() !== "";
        });

        const models = [];
        lines.forEach(function(line) {
            const parts = line.split("|");
            const name = parts[0];
            const windowSizeTokens = parts[1];
            if (name && windowSizeTokens) {
                const tokens = Math.round(parseInt(windowSizeTokens, 10) / 1024);
                models.push({ name: name.trim(), windowSize: tokens });
            }
        });
        return models;
    } catch (e) {
        console.warn("llm-catalog: modelli non leggibili per " + provider, e);
        return [];
    }
};

export default { loadProviderModels };
