/**
 * update-llm.js - Comando "Aggiorna LLM".
 * Scopre modelli dai provider, salva in IndexedDB, apre log automaticamente.
 *
 * @module commands/update-llm
 * @version 1.0.0
 */

"use strict";

import { createLlmDB } from "vanillallm/llm/llm-db.js";
import { createLlmLogger } from "vanillallm/llm/llm-logging.js";
import { LlmProvider } from "vanillallm/llm_provider.js";
import { getApiKey, IMPLEMENTED_CLIENTS } from "vanillallm/services/key_retriever.js";
import { discoverModels, hasFetcher } from "vanillallm/llmlist/index.js";
import { createLlmPayload, createMessage } from "vanillallm/llmclient/index.js";
import { UaLog } from "vanillallm/services/ualog3.js";
import { TEST_SYSTEM_PROMPT, TEST_USER_PROMPT } from "vanillallm/llm/test-prompts.js";
import { loadProviderModels } from "vanillallm/llm/llm-catalog.js";

const TEST_TIMEOUT_MS = 20000;
const VOTE_SLOW_MS = 10000;

const NON_CHAT_KEYWORDS = [
    "fim", "embedding", "reranker", "image", "video", "audio",
    "speech", "tts", "starcoder", "codestral"
];

let _cancelRequested = false;

export const cancelUpdate = function() {
    _cancelRequested = true;
};

const _resetCancel = function() {
    _cancelRequested = false;
};

const _isChatModel = function(model) {
    const lower = model.toLowerCase();
    for (const kw of NON_CHAT_KEYWORDS) {
        if (lower.includes(kw)) return false;
    }
    return true;
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

const _withTimeout = function(promise, ms) {
    return new Promise(function(resolve) {
        const timer = setTimeout(function() { resolve(null); }, ms);
        promise.then(function(value) {
            clearTimeout(timer);
            resolve(value);
        }).catch(function(error) {
            clearTimeout(timer);
            console.error("update-llm._withTimeout:", error);
            resolve(null);
        });
    });
};

const _computeVote = function(responseText, elapsedMs) {
    let vote = 10;
    if (elapsedMs > VOTE_SLOW_MS) vote -= 1;
    const len = (responseText || "").trim().length;
    if (len < 80) vote -= 1;
    if (len < 20) vote -= 1;
    return Math.max(6, vote);
};

/**
 * Adapter per usare UaLog come logWindow per il logger.
 * @returns {Object} Oggetto con metodo appendLine
 */
const _createUaLogAdapter = function() {
    return {
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
};

const _testModel = async function(provider, model, logger) {
    const ok = LlmProvider.setActive(provider, model);
    if (!ok) {
        const result1 = { provider, model, ok: false, reason: "modello non disponibile nel catalogo" };
        return result1;
    }

    const client = await LlmProvider.getClient();
    if (!client) {
        const result2 = { provider, model, ok: false, reason: "chiave API non disponibile" };
        return result2;
    }

    const payload = createLlmPayload(model, [
        createMessage("system", TEST_SYSTEM_PROMPT),
        createMessage("user", TEST_USER_PROMPT.replace("{QUESTION}", "Spiega in non più di 5 righe cos'è il teorema di Pitagora, includendo un esempio numerico con numeri interi."))
    ], {
        temperature: 0.3,
        max_tokens: 512
    });

    const started = performance.now();
    let rr = null;
    try {
        const sendPromise = client.sendRequest(payload);
        const cancelPromise = new Promise(function(resolve) {
            const timer = setInterval(function() {
                if (_cancelRequested) {
                    clearInterval(timer);
                    client.cancelRequest();
                    resolve({ cancelled: true });
                }
            }, 50);
            sendPromise.then(function() { clearInterval(timer); }).catch(function() { clearInterval(timer); });
        });
        rr = await _withTimeout(Promise.race([sendPromise, cancelPromise]), TEST_TIMEOUT_MS);
    } catch (e) {
        console.error("testModel (" + provider + "/" + model + "):", e);
        const elapsedMs = performance.now() - started;
        const result3 = { provider, model, ok: false, elapsedMs: elapsedMs, reason: "errore imprevisto" };
        return result3;
    }

    const elapsedMs = performance.now() - started;

    if (rr === null) {
        client.cancelRequest();
        const result4 = { provider, model, ok: false, elapsedMs, reason: "timeout (>20s)" };
        return result4;
    }

    if (rr.cancelled || _cancelRequested) {
        client.cancelRequest();
        const result5 = { provider, model, ok: false, elapsedMs, cancelled: true, reason: "interrotto dall'utente" };
        return result5;
    }

    if (!rr.ok) {
        const err = rr.error || {};
        const code = err.status || err.code || 0;
        const reason = "HTTP " + code + ": " + (err.message || "errore");
        const result6 = { provider, model, ok: false, elapsedMs, reason: reason, httpCode: code };
        return result6;
    }

    const response = (rr.data && String(rr.data).trim()) || "";
    if (!response) {
        const result7 = { provider, model, ok: false, elapsedMs, reason: "risposta vuota" };
        return result7;
    }

    const result8 = { provider, model, ok: true, elapsedMs, response };
    return result8;
};

/**
 * Esegue l'aggiornamento completo.
 * @returns {Promise<Array<Object>>}
 */
export const runUpdate = async function() {
    _resetCancel();

    const llmDb = createLlmDB();
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
                modelList = chatModels.map(function(m) {
                    return { name: m.id, windowSize: Math.round((m.contextWindow || 0) / 1024) };
                });
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

    // Mappa per salvare risultati test
    const testResults = new Map();

    const results = [];

    for (const provider of Object.keys(catalog)) {
        if (_cancelRequested) break;

        logger.providerStart(provider);

        let okCount = 0;
        let errCount = 0;

        for (const model of catalog[provider]) {
            if (_cancelRequested) break;

            const outcome = await _testModel(provider, model, logger);
            testedCount++;

            if (outcome.ok) {
                const vote = _computeVote(outcome.response, outcome.elapsedMs);
                outcome.vote = vote;
                logger.modelResult(model, true);
                okCount++;
                // Salva risultato test per questo modello
                testResults.set(provider + ":" + model, { elapsedMs: outcome.elapsedMs, vote });
            } else {
                if (outcome.httpCode) {
                    logger.modelError(model, outcome.httpCode);
                } else {
                    logger.modelResult(model, false);
                }
                errCount++;
                // Salva anche fallimenti
                testResults.set(provider + ":" + model, { elapsedMs: outcome.elapsedMs, vote: null, error: outcome.reason });
            }

            results.push(outcome);

            if (outcome.cancelled) break;
        }

        logger.providerSummary(provider, okCount, errCount);

        if (results.some(r => r.cancelled)) break;
    }

    // Aggiorna allDiscovered con risultati test
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

    results.sort((a, b) => {
        const byProvider = a.provider.localeCompare(b.provider);
        if (byProvider !== 0) return byProvider;
        return a.model.localeCompare(b.model);
    });

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