/**
 * llm_updater.js - Scoperta modelli disponibili e test LLM.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Si occupa di:
 *   1. Fornire fetchAvailableModels per scoprire modelli senza testarli
 *   2. Test di un singolo modello (testModel) e voto qualità (computeVote)
 *
 * UI (voce di menu, finestra risultati) in app_ui.js.
 * Il comando "Aggiorna LLM" completo è in commands/update-llm.js.
 *
 * @module llm_updater
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { LlmProvider } from "./llm_provider.js";
import { getApiKey, IMPLEMENTED_CLIENTS } from "./services/key_retriever.js";
import { UaLog } from "./services/ualog3.js";
import { createLlmPayload, createMessage } from "./llmclient/index.js";
import { discoverModels, hasFetcher } from "./llmlist/index.js";
import { loadProviderModels } from "vanillallm/llm/llm-catalog.js";
import { TEST_SYSTEM_PROMPT, TEST_USER_PROMPT } from "vanillallm/llm/test-prompts.js";

// ============================================================================
// COSTANTI
// ============================================================================

/** Prompt di prova fisso, uguale per tutti i modelli per rendere confrontabili tempi e voti. */
const TEST_QUESTION = "Spiega in non più di 5 righe cos'è il teorema di Pitagora, includendo un esempio numerico con numeri interi.";

/** Soglia massima di risposta per considerare superato il test (millisecondi). */
const TEST_TIMEOUT_MS = 20000;

/** Oltre questa durata la risposta è considerata lenta ai fini del voto (millisecondi). */
const VOTE_SLOW_MS = 10000;

/**
 * Marchi di modelli non-chat (completamento codice, embedding, ecc.) da
 * escludere dal test: non rispondono a un prompt di chat.
 * @type {string[]}
 */
const NON_CHAT_KEYWORDS = [
    "fim", "embedding", "reranker", "image", "video", "audio",
    "speech", "tts", "starcoder", "codestral"
];

/**
 * Flag di cancellazione della procedura di aggiornamento. Quando true,
 * runUpdate interrompe il test tra un modello e l'altro (o annulla quello
 * corrente) e termina restituendo i risultati parziali.
 * @type {boolean}
 */
let _cancelRequested = false;

/**
 * Richiede l'interruzione della procedura di aggiornamento in corso.
 */
export const cancelUpdate = function() {
    _cancelRequested = true;
};

/**
 * Azzera il flag di cancellazione (chiamato prima di avviare la procedura).
 */
const _resetCancel = function() {
    _cancelRequested = false;
};

/**
 * Verifica se un modello è adatto al test di chat.
 * @param {string} model
 * @returns {boolean}
 */
const isChatModel = function(model) {
    const lower = model.toLowerCase();
    for (const kw of NON_CHAT_KEYWORDS) {
        if (lower.includes(kw)) {
            return false;
        }
    }
    return true;
};

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

/**
 * Carica il catalogo grezzo di provider/modelli direttamente dai file
 * (.txt), senza applicare il filtro del repository:
 * la procedura deve poter scoprire anche i modelli non ancora accettati.
 * I provider sono quelli con client implementato in llmclient: chi non ha
 * file ha 0 modelli, nessun errore.
 * @returns {Promise<Object<string, Array<string>>>}
 */
const _loadRawCatalog = async function() {
    const catalog = {};

    for (const p of IMPLEMENTED_CLIENTS) {
        const models = await loadProviderModels(p);
        if (models.length === 0) {
            continue;
        }
        catalog[p] = models.map(function(m) {
            return m.name;
        });
    }

    return catalog;
};

/**
 * Avvolge una promise con un timeout: risolve null se non risolta entro la soglia.
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise<Object|null>}
 */
const _withTimeout = function(promise, ms) {
    return new Promise(function(resolve) {
        const timer = setTimeout(function() {
            resolve(null);
        }, ms);
        promise.then(function(value) {
            clearTimeout(timer);
            resolve(value);
        }).catch(function(error) {
            clearTimeout(timer);
            console.error("llm_updater._withTimeout:", error);
            resolve(null);
        });
    });
};

// ============================================================================
// API PUBBLICA — Voto di qualità
// ============================================================================

/**
 * Calcola il voto di qualità (7-10) di una risposta al prompt di prova.
 * Euristica locale: si parte da 10 e si applicano penalità per risposta
 * lenta o breve. I bocciati (errore, timeout, contenuto vuoto) non
 * arrivano mai a questa funzione, quindi il minimo effettivo è 6.
 * @param {string} responseText - Contenuto risposto dal modello.
 * @param {number} elapsedMs - Tempo di risposta in millisecondi.
 * @returns {number} Voto da 6 a 10.
 */
export const computeVote = function(responseText, elapsedMs) {
    let vote = 10;

    if (elapsedMs > VOTE_SLOW_MS) {
        vote -= 1;
    }

    const length = (responseText || "").trim().length;
    if (length < 80) {
        vote -= 1;
    }
    if (length < 20) {
        vote -= 1;
    }

    return Math.max(6, vote);
};

// ============================================================================
// API PUBBLICA — Test di un singolo modello
// ============================================================================

/**
 * Testa un singolo modello inviando il prompt di prova.
 * Usa il pattern dell'app: setActive + getClient (chiave da IndexedDB),
 * payload con createLlmPayload, invio con timeout hard di 20 s.
 * @param {string} provider
 * @param {string} model
 * @returns {Promise<Object>} { provider, model, ok, elapsedMs?, reason?, response?, vote? }
 */
export const testModel = async function(provider, model) {
    const ok = LlmProvider.setActive(provider, model);
    if (!ok) {
        return {
            provider, model,
            ok: false,
            reason: "modello non disponibile nel catalogo"
        };
    }

    const client = await LlmProvider.getClient();
    if (!client) {
        return {
            provider, model,
            ok: false,
            reason: "chiave API non disponibile"
        };
    }

    const payload = createLlmPayload(model, [
        createMessage("system", TEST_SYSTEM_PROMPT),
        createMessage("user", TEST_USER_PROMPT.replace("{QUESTION}", TEST_QUESTION))
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
            sendPromise.then(function() {
                clearInterval(timer);
            }).catch(function() {
                clearInterval(timer);
            });
        });
        rr = await _withTimeout(Promise.race([sendPromise, cancelPromise]), TEST_TIMEOUT_MS);
    } catch (e) {
        console.error("testModel (" + provider + "/" + model + "):", e);
        return {
            provider, model,
            ok: false,
            elapsedMs: performance.now() - started,
            reason: "errore imprevisto durante l'invio"
        };
    }
    const elapsedMs = performance.now() - started;

    if (rr === null) {
        client.cancelRequest();
        return {
            provider, model,
            ok: false,
            elapsedMs,
            reason: "tempo superiore a 20 secondi"
        };
    }

    if (rr.cancelled || _cancelRequested) {
        client.cancelRequest();
        return {
            provider, model,
            ok: false,
            elapsedMs,
            cancelled: true,
            reason: "procedura interrotta dall'utente"
        };
    }

    if (!rr.ok) {
        const err = rr.error || {};
        const typePart = err.type ? err.type + ": " : "";
        return {
            provider, model,
            ok: false,
            elapsedMs,
            reason: "errore del provider (" + typePart + (err.message || "errore sconosciuto") + ")"
        };
    }

    const response = (rr.data && String(rr.data).trim()) || "";
    if (!response) {
        return {
            provider, model,
            ok: false,
            elapsedMs,
            reason: "contenuto risposto vuoto"
        };
    }

    return {
        provider, model,
        ok: true,
        elapsedMs,
        response
    };
};

// ============================================================================
// API PUBBLICA — Scoperta dei modelli disponibili
// ============================================================================

/**
 * Scarica i modelli disponibili per ogni provider con client implementato e
 * chiave API attiva, senza eseguire i test. Per i provider con fetcher usa la
 * discovery via API; per gli altri usa il catalogo da file. Filtra i modelli
 * non adatti alla chat. NON applica il filtro del repository: restituisce
 * tutti gli LLM scaricati.
 * @returns {Promise<Object<string, Array<{id: string, contextWindow: number}>>>}
 */
export const fetchAvailableModels = async function() {
    const fileCatalog = await _loadRawCatalog();
    const available = {};

    for (const provider of IMPLEMENTED_CLIENTS) {
        const apiKey = await getApiKey(provider);
        if (!apiKey) {
            continue;
        }

        if (hasFetcher(provider)) {
            try {
                const discovered = await discoverModels(provider, apiKey);
                available[provider] = discovered.filter(function(m) {
                    return isChatModel(m.id);
                });
            } catch (e) {
                console.warn("fetchAvailableModels: discovery fallita per " + provider + " [" + (e.type || "Error") + "]", e.userMessage || e.message);
                available[provider] = (fileCatalog[provider] || []).map(function(id) {
                    return { id: id, contextWindow: 0 };
                }).filter(function(m) {
                    return isChatModel(m.id);
                });
            }
        } else if (fileCatalog[provider]) {
            available[provider] = fileCatalog[provider].map(function(id) {
                return { id: id, contextWindow: 0 };
            }).filter(function(m) {
                return isChatModel(m.id);
            });
        }
    }

    return available;
};

// ============================================================================
// API PUBBLICA — LlmUpdater
// ============================================================================

export const LlmUpdater = {
    computeVote,
    testModel,
    cancelUpdate,
    fetchAvailableModels
};