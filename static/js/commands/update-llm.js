/**
 * update-llm.js - Comando "Aggiorna LLM".
 * Scopre modelli dai provider, salva in IndexedDB, apre log automaticamente.
 *
 * @module commands/update-llm
 * @version 2.0.0
 */

"use strict";

import { llmDb } from "vanillallm/llm/llm-db.js";
import { createLlmLogger } from "vanillallm/llm/llm-logging.js";
import { LlmProvider } from "vanillallm/llm_provider.js";
import { getApiKey, IMPLEMENTED_CLIENTS } from "vanillallm/services/key_retriever.js";
import { discoverModels, hasFetcher } from "vanillallm/llmlist/index.js";
import { UaLog } from "vanillallm/services/ualog3.js";
import { loadProviderModels } from "vanillallm/llm/llm-catalog.js";
import { LlmUpdater } from "vanillallm/llm_updater.js";

/** Numero di token contenuti in un kilotoken (conversione delle finestre di contesto). */
const TOKENS_PER_K = 1024;

let _cancelRequested = false;

export const cancelUpdate = function() {
    _cancelRequested = true;
};

const _resetCancel = function() {
    _cancelRequested = false;
};

const _isChatModel = function(model) {
    const lower = model.toLowerCase();
    const nonChatKeywords = [
        "fim", "embedding", "reranker", "image", "video", "audio",
        "speech", "tts", "starcoder", "codestral"
    ];
    for (const kw of nonChatKeywords) {
        if (lower.includes(kw)) {
            const result = false;
            return result;
        }
    }
    const result = true;
    return result;
};

const _loadRawCatalog = async function() {
    const catalog = {};

    for (const p of IMPLEMENTED_CLIENTS) {
        const models = await loadProviderModels(p);
        if (models.length > 0) {
            catalog[p] = models;
        }
    }

    return catalog;
};

const _createUaLogAdapter = function() {
    const adapter = {
        appendLine: function(text) {
            UaLog.log(text);
        },
        isVisible: function() {
            const result = UaLog.active;
            return result;
        },
        show: function() {
            if (!UaLog.active) UaLog.toggle();
        }
    };
    return adapter;
};

export const runUpdate = async function() {
    _resetCancel();

    await llmDb.init();

    const logAdapter = _createUaLogAdapter();
    const logger = createLlmLogger(logAdapter);

    if (!UaLog.active) {
        UaLog.toggle();
    }

    const previousConfig = LlmProvider.getConfig();
    const fileCatalog = await _loadRawCatalog();
    const catalog = {};
    const allDiscovered = [];
    let testedCount = 0;

    for (const provider of IMPLEMENTED_CLIENTS) {
        if (_cancelRequested) break;

        const apiKey = await getApiKey(provider);
        if (!apiKey) {
            const msg = provider + " saltato (nessuna chiave).";
            UaLog.log(msg);
            continue;
        }

        let modelList = [];
        if (hasFetcher(provider)) {
            try {
                const discovered = await discoverModels(provider, apiKey);
                const chatModels = discovered.filter(m => _isChatModel(m.id));
                LlmProvider.setModelsFromDiscovery(provider, chatModels);
                modelList = chatModels.map(m => ({ name: m.id, windowSize: Math.round((m.contextWindow || 0) / TOKENS_PER_K) }));
                const msg1 = provider + ": elenco " + modelList.length + " modelli.";
                UaLog.log(msg1);
            } catch (e) {
                const errType = e.type || "Error";
                const errMsg = e.userMessage || e.message;
                const msg2 = provider + ": discovery fallita (" + errType + "). " + errMsg;
                UaLog.log(msg2);
                modelList = (fileCatalog[provider] || []).filter(m => _isChatModel(m.name));
            }
        } else if (fileCatalog[provider]) {
            modelList = fileCatalog[provider].filter(m => _isChatModel(m.name));
        }

        for (const m of modelList) {
            const modelObj = { provider, model: m.name, windowSize: m.windowSize };
            allDiscovered.push(modelObj);
            catalog[provider] = catalog[provider] || [];
            catalog[provider].push(m.name);
        }
    }

    const testResults = new Map();
    const results = [];

    for (const provider of Object.keys(catalog)) {
        if (_cancelRequested) break;

        logger.providerStart(provider);

        let okCount = 0;
        let errCount = 0;

        for (const model of catalog[provider]) {
            if (_cancelRequested) break;

            const outcome = await LlmUpdater.testModel(provider, model);
            testedCount++;

            if (outcome.ok) {
                const vote = LlmUpdater.computeVote(outcome.response, outcome.elapsedMs);
                outcome.vote = vote;
                logger.modelResult(model, true);
                okCount++;
                testResults.set(provider + ":" + model, { elapsedMs: outcome.elapsedMs, vote });
            } else {
                if (outcome.httpCode) {
                    logger.modelError(model, outcome.httpCode);
                } else {
                    logger.modelResult(model, false);
                }
                errCount++;
                testResults.set(provider + ":" + model, { elapsedMs: outcome.elapsedMs, vote: null, error: outcome.reason });
            }

            results.push(outcome);

            if (outcome.cancelled) break;
        }

        logger.providerSummary(provider, okCount, errCount);

        if (results.some(r => r.cancelled)) break;
    }

    for (const obj of allDiscovered) {
        const key = obj.provider + ":" + obj.model;
        const testResult = testResults.get(key);
        if (testResult) {
            obj.elapsedMs = testResult.elapsedMs;
            obj.vote = testResult.vote;
            obj.testError = testResult.error;
        }
    }

    await llmDb.saveDiscovered(allDiscovered);

    results.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));

    if (_cancelRequested) {
        const msg3 = "interrotto — " + testedCount + " modelli testati.";
        UaLog.log(msg3);
    } else {
        const msg4 = "completato — " + testedCount + " modelli testati.";
        UaLog.log(msg4);
    }

    if (previousConfig.provider && previousConfig.model) {
        LlmProvider.setActive(previousConfig.provider, previousConfig.model);
    }

    return results;
};

export default { runUpdate, cancelUpdate };
