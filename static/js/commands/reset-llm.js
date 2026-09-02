/**
 * reset-llm.js - Comando "Reset LLM".
 * Cancella la selezione "active" (albero LLM) da IndexedDB e la ripristina
 * leggendo i modelli di default dai file static/data/models/*.txt
 *
 * @module commands/reset-llm
 * @version 1.0.0
 */

"use strict";

import { llmDb } from "agnochat/llm/llm-db.js";
import { LlmProvider } from "agnochat/llm_provider.js";
import { updateActiveModelDisplay } from "agnochat/app_ui.js";
import { UaLog } from "agnochat/services/ualog3.js";
import { IMPLEMENTED_CLIENTS } from "agnochat/services/key_retriever.js";
import { loadProviderModels } from "agnochat/llm/llm-catalog.js";

/**
 * Legge i modelli di default dai file .txt in static/data/models/
 * Formato .txt: model|windowSizeTokens|vote|time (es. gemini-2.5-flash|1048576|10|8.08)
 * I provider sono quelli con client implementato in llmclient: chi non ha
 * file ha 0 modelli, nessun errore.
 * @returns {Promise<Array<Object>>} Array di {provider, model, name?, windowSize?}
 */
const _readDefaultModels = async function() {
    const allModels = [];

    for (const provider of IMPLEMENTED_CLIENTS) {
        const models = await loadProviderModels(provider);

        for (const m of models) {
            allModels.push({
                provider: provider,
                model: m.name,
                name: m.name,
                windowSize: m.windowSize
            });
        }
    }

    const result = allModels;
    return result;
};

/**
 * Esegue il reset dell'albero LLM ai modelli di default.
 * @returns {Promise<void>}
 */
export const runReset = async function() {
    await llmDb.init();

    await llmDb.clearSelected();

    const defaultModels = await _readDefaultModels();

    if (defaultModels.length > 0) {
        await llmDb.saveSelected(defaultModels);
    }

    await LlmProvider.loadModels();
    LlmProvider.validateActive();
    updateActiveModelDisplay();

    const msg = ">>> Reset LLM: albero ricostruito con modelli di default. <<<";
    UaLog.log(msg);
};

export default { runReset };