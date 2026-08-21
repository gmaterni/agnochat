/**
 * llm_updater.js - Procedura di aggiornamento del repository LLM.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Si occupa solo di:
 *   1. Leggere/salvare il repository dei modelli accettati su IndexedDB
 *   2. Testare in sequenza ogni modello di ogni provider con chiave attiva
 *      inviando un prompt di prova e misurando tempo ed esito
 *   3. Calcolare un voto di qualità (7-10) per i modelli che superano il test
 *
 * UI (voce di menu, finestra risultati) in app_ui.js.
 *
 * @module llm_updater
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { LlmProvider } from "./llm_provider.js";
import { getApiKey, IMPLEMENTED_CLIENTS } from "./services/key_retriever.js";
import { UaDb } from "./services/uadb.js";
import { DATA_KEYS } from "./services/data_keys.js";
import { UaLog } from "./services/ualog3.js";
import { createLlmPayload, createMessage } from "./llmclient/index.js";
import { discoverModels, hasFetcher } from "./llmlist/index.js";

// ============================================================================
// COSTANTI
// ============================================================================

/** Prompt di prova fisso, uguale per tutti i modelli per rendere confrontabili tempi e voti. */
const TEST_PROMPT = "Spiega in non più di 5 righe cos'è il teorema di Pitagora, includendo un esempio numerico con numeri interi.";

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
 * (manifest.json + .txt), senza applicare il filtro del repository:
 * la procedura deve poter scoprire anche i modelli non ancora accettati.
 * @returns {Promise<Object<string, Array<string>>>}
 */
const _loadRawCatalog = async function() {
    const catalog = {};

    let providers = [];
    try {
        const manifestRes = await fetch(`./data/models/manifest.json`);
        if (manifestRes.ok) {
            providers = await manifestRes.json();
        }
    } catch (_) {}

    if (providers.length === 0) {
        providers = IMPLEMENTED_CLIENTS;
    }

    for (const p of providers) {
        try {
            const response = await fetch(`./data/models/${p}.txt`);
            if (!response.ok) {
                continue;
            }
            const text = await response.text();
            const lines = text.split("\n").filter(function(line) {
                return line.trim() !== "";
            });

            const models = [];
            lines.forEach(function(line) {
                const name = line.split("|")[0];
                if (name && name.trim()) {
                    models.push(name.trim());
                }
            });

            if (models.length > 0) {
                catalog[p] = models;
            }
        } catch (e) {
            console.warn(`Impossibile caricare i modelli per ${p}:`, e);
        }
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
        }).catch(function() {
            clearTimeout(timer);
            resolve(null);
        });
    });
};

// ============================================================================
// API PUBBLICA — Repository
// ============================================================================

/**
 * Struttura del repository su IndexedDB:
 *   { new:    { "<provider>": ["<model>", ...], ... },
 *     active: { "<provider>": ["<model>", ...], ... } }
 * - "new": modelli superati dal test (Aggiorna LLM), in attesa di selezione.
 * - "active": modelli attualmente nell'albero di scelta LLM (Seleziona LLM).
 */

/**
 * Legge l'intera struttura del repository da IndexedDB.
 * Migra automaticamente il vecchio formato piatto
 * ({ "<provider>": ["<model>", ...], ... }) al nuovo formato {new, active},
 * spostando i modelli in "active" (preservando l'albero attuale) e
 * persistendo la migrazione.
 * Restituisce { new: {}, active: {} } se assente o corrotto.
 * @returns {Promise<{new: Object, active: Object}>}
 */
export const readRepository = async function() {
    const repo = await UaDb.readJson(DATA_KEYS.KEY_LLM_REPOSITORY);

    if (!repo || typeof repo !== "object" || Array.isArray(repo)) {
        return { new: {}, active: {} };
    }

    const cleanSection = function(section) {
        if (!section || typeof section !== "object" || Array.isArray(section)) {
            return {};
        }
        const cleaned = {};
        for (const provider of Object.keys(section)) {
            if (Array.isArray(section[provider])) {
                cleaned[provider] = section[provider];
            }
        }
        return cleaned;
    };

    // Nuovo formato: { new, active }
    if (repo.new !== undefined || repo.active !== undefined) {
        return {
            new: cleanSection(repo.new),
            active: cleanSection(repo.active)
        };
    }

    // Vecchio formato piatto: { "<provider>": ["<model>", ...], ... }
    // I modelli accettati rappresentavano l'albero attivo → migra in "active".
    const migratedActive = cleanSection(repo);
    const migrated = {
        new: {},
        active: migratedActive
    };
    await UaDb.saveJson(DATA_KEYS.KEY_LLM_REPOSITORY, migrated);
    return migrated;
};

/**
 * Legge i modelli superati dal test ("new"), pronti per la selezione.
 * @returns {Promise<Object>} { "<provider>": ["<model>", ...], ... }
 */
export const readNewModels = async function() {
    const repo = await readRepository();
    return repo.new;
};

/**
 * Legge i modelli attivi ("active"), quelli mostrati nell'albero di scelta.
 * @returns {Promise<Object>} { "<provider>": ["<model>", ...], ... }
 */
export const readActiveModels = async function() {
    const repo = await readRepository();
    return repo.active;
};

/**
 * Salva l'intera struttura del repository su IndexedDB (salvataggio atomico).
 * @param {{new: Object, active: Object}} repo
 * @returns {Promise<void>}
 */
export const saveRepository = async function(repo) {
    const current = await readRepository();
    const next = {
        new: (repo && repo.new) || current.new,
        active: (repo && repo.active) || current.active
    };
    await UaDb.saveJson(DATA_KEYS.KEY_LLM_REPOSITORY, next);
};

/**
 * Aggiorna i modelli "new" (superati dal test), preservando gli "active".
 * @param {Object} newModels - { "<provider>": ["<model>", ...], ... }
 * @returns {Promise<void>}
 */
export const setNewModels = async function(newModels) {
    const current = await readRepository();
    await UaDb.saveJson(DATA_KEYS.KEY_LLM_REPOSITORY, {
        new: newModels || {},
        active: current.active
    });
};

/**
 * Aggiorna i modelli "active" (selezionati nell'albero), preservando i "new".
 * @param {Object} activeModels - { "<provider>": ["<model>", ...], ... }
 * @returns {Promise<void>}
 */
export const setActiveModels = async function(activeModels) {
    const current = await readRepository();
    await UaDb.saveJson(DATA_KEYS.KEY_LLM_REPOSITORY, {
        new: current.new,
        active: activeModels || {}
    });
};

// ============================================================================
// API PUBBLICA — Voto di qualità
// ============================================================================

/**
 * Calcola il voto di qualità (7-10) di una risposta al prompt di prova.
 * Euristica locale: si parte da 10 e si applicano penalità per risposta
 * lenta o breve. I bocciati (errore, timeout, contenuto vuoto) non
 * arrivano mai a questa funzione, quindi il minimo effettivo è 7.
 * @param {string} responseText - Contenuto risposto dal modello.
 * @param {number} elapsedMs - Tempo di risposta in millisecondi.
 * @returns {number} Voto da 7 a 10.
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

    return Math.max(7, vote);
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

    const payload = createLlmPayload(model, [createMessage("user", TEST_PROMPT)], {
        temperature: 0.3,
        max_tokens: 256
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
        console.error(`testModel (${provider}/${model}):`, e);
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
        const typePart = err.type ? `${err.type}: ` : "";
        return {
            provider, model,
            ok: false,
            elapsedMs,
            reason: `errore del provider (${typePart}${err.message || "errore sconosciuto"})`
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
// API PUBBLICA — Procedura di aggiornamento
// ============================================================================

/**
 * Esegue la procedura di aggiornamento: testa in sequenza ogni modello di
 * ogni provider del catalogo grezzo che ha una chiave API attiva, tracciando
 * l'avanzamento in UaLog.
 * @returns {Promise<Array<Object>>} Risultati ordinati per provider:
 *                                   [{ provider, model, ok, vote?, elapsedMs?, reason?, response? }]
 */
export const runUpdate = async function() {
    _resetCancel();

    const previousConfig = LlmProvider.getConfig();
    const fileCatalog = await _loadRawCatalog();
    const catalog = {};
    const results = [];
    let testedCount = 0;

    for (const provider of IMPLEMENTED_CLIENTS) {
        if (_cancelRequested) {
            break;
        }
        const apiKey = await getApiKey(provider);
        if (!apiKey) {
            UaLog.log(`${provider} saltato (nessuna chiave).`);
            continue;
        }
        if (hasFetcher(provider)) {
            try {
                const discovered = await discoverModels(provider, apiKey);
                const chatModels = discovered.filter(function(m) {
                    return isChatModel(m.id);
                });
                console.debug(`[llm-update] Discovery ${provider}: ${discovered.length} modelli ricevuti (${chatModels.length} chat)`, discovered.map(function(m) {
                    return { id: m.id, contextWindow: m.contextWindow };
                }));
                LlmProvider.setModelsFromDiscovery(provider, chatModels);
                catalog[provider] = chatModels.map(function(m) {
                    return m.id;
                });
                UaLog.log(`${provider}: elenco ${catalog[provider].length} modelli.`);
            } catch (e) {
                UaLog.log(`${provider}: discovery fallita, uso catalogo da file.`);
                catalog[provider] = (fileCatalog[provider] || []).filter(function(m) {
                    return isChatModel(m);
                });
            }
        } else if (fileCatalog[provider]) {
            catalog[provider] = fileCatalog[provider].filter(function(m) {
                return isChatModel(m);
            });
        }
    }

    for (const provider of Object.keys(catalog)) {
        if (_cancelRequested) {
            break;
        }
        for (const model of catalog[provider]) {
            if (_cancelRequested) {
                break;
            }
            UaLog.log(`test ${provider}/${model}...`);
            console.debug(`[llm-update] Request test ${provider}/${model} avviata (prompt di prova).`);
            const outcome = await testModel(provider, model);
            testedCount++;
            console.debug(`[llm-update] Request test ${provider}/${model} completata`, outcome);

            if (outcome.ok) {
                const vote = computeVote(outcome.response, outcome.elapsedMs);
                outcome.vote = vote;
                UaLog.log(`${provider}/${model} OK (${(outcome.elapsedMs / 1000).toFixed(1)}s, voto ${vote}).`);
            } else {
                const timePart = outcome.elapsedMs != null ? ` (${(outcome.elapsedMs / 1000).toFixed(1)}s)` : "";
                UaLog.log(`${provider}/${model} bocciato${timePart}: ${outcome.reason}.`);
            }

            results.push(outcome);

            if (outcome.cancelled) {
                break;
            }
        }
        if (results.some(function(r) { return r.cancelled; })) {
            break;
        }
    }

    results.sort(function(a, b) {
        const byProvider = a.provider.localeCompare(b.provider);
        if (byProvider !== 0) return byProvider;
        return a.model.localeCompare(b.model);
    });

    if (_cancelRequested) {
        UaLog.log(`interrotto dall'utente — ${testedCount} modelli testati su ${Object.keys(catalog).length} provider.`);
    } else {
        UaLog.log(`completato — ${testedCount} modelli testati su ${Object.keys(catalog).length} provider.`);
    }
    if (previousConfig.provider && previousConfig.model) {
        LlmProvider.setActive(previousConfig.provider, previousConfig.model);
    }
    return results;
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
                console.warn(`fetchAvailableModels: discovery fallita per ${provider}:`, e);
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
    readRepository,
    saveRepository,
    readNewModels,
    readActiveModels,
    setNewModels,
    setActiveModels,
    computeVote,
    testModel,
    runUpdate,
    cancelUpdate,
    fetchAvailableModels
};