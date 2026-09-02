/**
 * llm_provider.js - Gestione stato provider LLM e cache client.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Si occupa solo di:
 *   1. Caricare modelli da file (loadModels)
 *   2. Mantenere provider/modello attivo in memoria
 *   3. Mantenere una singola istanza client + API key in variabili dirette
 *   4. Persistenza su IndexedDB (salva/carica configurazione)
 *   5. Fornire getClient() come punto d'ingresso unico per le richieste LLM
 *
 * UI (tree view, toggle, showConfig) in app_ui.js.
 *
 * @module llm_provider
 * @version 0.3.0
 * @date    2026-06-29
 */

"use strict";

import { getApiKey, fetchApiKeys, IMPLEMENTED_CLIENTS } from "./services/key_retriever.js";
import {
    GeminiClient, MistralClient, GroqClient,
    OpenRouterClient, CerebrasClient, SiliconFlowClient
} from "./llmclient/index.js";
import { DATA_KEYS } from "./services/data_keys.js";
import { UaDb } from "./services/uadb.js";
import { loadProviderModels } from "agnochat/llm/llm-catalog.js";

// ============================================================================
// COSTANTI
// ============================================================================

// I provider sono quelli con un client implementato in llmclient
// (IMPLEMENTED_CLIENTS in services/key_retriever.js).
// Ogni provider con file .txt valido in data/models/ compare nell'albero di
// selezione; un file mancante significa semplicemente 0 modelli, nessun errore.
//
// L'unica eccezione è _createClientInstance (switch + import) che va
// aggiornata a mano quando si aggiunge un nuovo provider LLM client.

// ============================================================================
// STATO PRIVATO
// ============================================================================

/** @type {Object<string, {client: string, models: Object}>} */
let _providerModels = {};

/** @type {Object|null} Istanza client per il provider attivo. */
let _activeClient = null;

/** @type {string} Provider per cui _activeClient è stato creato. */
let _activeClientProvider = "";

/** @type {string} API key usata per creare _activeClient. */
let _activeApiKey = "";

/** @type {string} */
let _activeProvider = "";

/** @type {string} */
let _activeModel = "";

/** @type {number} */
let _windowSize = 0;

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

/**
 * Crea una nuova istanza client per il provider specificato.
 * Imposta _activeClient, _activeClientProvider e _activeApiKey.
 * @param {string} clientName
 * @param {string} apiKey
 */
const _createClientInstance = function(clientName, apiKey) {
    if (!clientName) {
        console.error("_createClientInstance: clientName mancante");
        return;
    }

    switch (clientName) {
        case "gemini":
            _activeClient = new GeminiClient(apiKey);
            break;
        case "mistral":
            _activeClient = new MistralClient(apiKey);
            break;
        case "groq":
            _activeClient = new GroqClient(apiKey);
            break;
        case "openrouter":
            _activeClient = new OpenRouterClient(apiKey);
            break;
        case "cerebras":
            _activeClient = new CerebrasClient(apiKey);
            break;
        case "siliconflow":
            _activeClient = new SiliconFlowClient(apiKey);
            break;
        default:
            _activeClient = null;
            console.warn(`_createClientInstance: client non supportato: ${clientName}`);
            break;
    }

    if (_activeClient) {
        _activeClientProvider = clientName;
        _activeApiKey = apiKey;
    }
};

/**
 * Controlla se una configurazione salvata è ancora valida.
 * @param {Object} config
 * @returns {boolean}
 */
const _isValidConfig = function(config) {
    if (!config || typeof config !== "object" || Object.keys(config).length === 0) {
        return false;
    }

    const { provider, model } = config;
    if (!provider || !_providerModels[provider]) {
        return false;
    }

    if (!model || !_providerModels[provider].models[model]) {
        return false;
    }

    return true;
};

const _setDefaultConfig = function() {
    const providers = Object.keys(_providerModels);
    if (providers.length === 0) return;
    const defaultProvider = providers[0];
    const models = Object.keys(_providerModels[defaultProvider].models);
    if (models.length === 0) return;
    const ok = LlmProvider.setActive(defaultProvider, models[0]);
    if (!ok) {
        console.error("_setDefaultConfig: impossibile impostare default.");
    }
};

// ============================================================================
// API PUBBLICA — providerModels
// ============================================================================

/**
 * Restituisce la mappa provider → modelli caricata da file.
 * @returns {Object}
 */
export const getProviderConfig = function() {
    return _providerModels;
};

/**
 * Proxy per compatibilità con key_retriever.js.
 * Permette accesso dinamico del tipo _PROVIDER_CONFIG[providerName].
 */
export const PROVIDER_CONFIG = new Proxy({}, {
    get: (target, prop) => {
        return _providerModels[prop];
    },
    has: (target, prop) => {
        return prop in _providerModels;
    }
});

// ============================================================================
// API PUBBLICA — LlmProvider
// ============================================================================

export const LlmProvider = {

    // ========================================================================
    // INIZIALIZZAZIONE
    // ========================================================================

    /**
     * Carica i modelli da file su disco. Ogni chiamata ricarica da zero.
     * I provider sono quelli con client implementato in llmclient:
     * chi non ha un file modelli semplicemente non compare (0 modelli,
     * nessun errore).
     * @returns {Promise<void>}
     */
    loadModels: async () => {
        _providerModels = {};

        for (const p of IMPLEMENTED_CLIENTS) {
            const models = await loadProviderModels(p);
            if (models.length === 0) {
                continue;
            }

            _providerModels[p] = {
                client: p,
                models: {}
            };

            models.forEach(function(m) {
                _providerModels[p].models[m.name] = {
                    windowSize: m.windowSize
                };
            });
        }
    },

    /**
     * Inizializzazione rapida: carica modelli e API keys.
     * @returns {Promise<void>}
     */
    init: async () => {
        // NON caricare i modelli dai .txt all'avvio.
        // Vengono caricati solo su "Reset LLM" o "Aggiorna LLM".
        await fetchApiKeys();
    },

    /**
     * Inietta nel catalogo in memoria i modelli scoperti dinamicamente per un
     * provider (da llmlist). NON applica il filtro del repository: la procedura
     * di aggiornamento deve poter testare anche i modelli non ancora accettati.
     * I modelli già presenti mantengono la finestra esistente.
     * @param {string} provider
     * @param {Array<{id: string, contextWindow: number}>} models
     * @returns {void}
     */
    setModelsFromDiscovery: function(provider, models) {
        if (!provider || !Array.isArray(models)) {
            return;
        }
        if (!_providerModels[provider]) {
            _providerModels[provider] = { client: provider, models: {} };
        }
        const store = _providerModels[provider].models;
        for (const m of models) {
            if (!m || !m.id) {
                continue;
            }
            if (store[m.id]) {
                continue;
            }
            const tokens = m.contextWindow ? Math.round(m.contextWindow / 1024) : 0;
            store[m.id] = { windowSize: tokens };
        }
    },

    /**
     * Filtra il catalogo in memoria in base ai modelli selezionati dall'utente (selected-models).
     * Rimuove i provider/modelli non presenti nella selezione.
     * @param {Array<{provider: string, model: string, name?: string, windowSize?: number}>} selectedModels
     * @returns {void}
     */
    applySelectionFilter: function(selectedModels) {
        if (!Array.isArray(selectedModels) || selectedModels.length === 0) {
            return;
        }

        // Costruisce mappa provider -> Set(model) per lookup veloce
        const selectedByProvider = {};
        for (const m of selectedModels) {
            if (!m.provider || !m.model) continue;
            if (!selectedByProvider[m.provider]) {
                selectedByProvider[m.provider] = new Set();
            }
            selectedByProvider[m.provider].add(m.model);
        }

        // Filtra _providerModels in place
        for (const provider of Object.keys(_providerModels)) {
            const allowed = selectedByProvider[provider];
            if (!allowed) {
                delete _providerModels[provider];
                continue;
            }
            for (const modelName of Object.keys(_providerModels[provider].models)) {
                if (!allowed.has(modelName)) {
                    delete _providerModels[provider].models[modelName];
                }
            }
            if (Object.keys(_providerModels[provider].models).length === 0) {
                delete _providerModels[provider];
            }
        }
    },

    /**
     * Assicura che i modelli selezionati dall'utente siano presenti in
     * _providerModels con i loro dati completi (windowSize, name, ecc.).
     * Viene chiamato PRIMA di applySelectionFilter per evitare che modelli
     * selezionati non presenti nei file .txt vengano persi.
     * @param {Array<{provider: string, model: string, name?: string, windowSize?: number, elapsedMs?: number, vote?: number}>} selectedModels
     * @returns {void}
     */
    ensureSelectedModels: function(selectedModels) {
        if (!Array.isArray(selectedModels) || selectedModels.length === 0) {
            return;
        }
        for (const m of selectedModels) {
            if (!m.provider || !m.model) continue;
            if (!_providerModels[m.provider]) {
                _providerModels[m.provider] = { client: m.provider, models: {} };
            }
            const store = _providerModels[m.provider].models;
            if (!store[m.model]) {
                store[m.model] = {
                    windowSize: m.windowSize || 0,
                    name: m.name,
                    elapsedMs: m.elapsedMs,
                    vote: m.vote
                };
            } else {
                // Aggiorna i campi se mancanti
                if (m.windowSize && !store[m.model].windowSize) store[m.model].windowSize = m.windowSize;
                if (m.name && !store[m.model].name) store[m.model].name = m.name;
                if (m.elapsedMs && !store[m.model].elapsedMs) store[m.model].elapsedMs = m.elapsedMs;
                if (m.vote !== undefined && m.vote !== null && !store[m.model].vote) store[m.model].vote = m.vote;
            }
        }
    },

    // ========================================================================
    // STATO ATTIVO
    // ========================================================================

    /**
     * Restituisce l'oggetto configurazione corrente (provider, model, windowSize).
     * @returns {Object}
     */
    getConfig: function() {
        const config = {
            provider: _activeProvider,
            model: _activeModel,
            windowSize: _windowSize
        };
        return config;
    },

    /**
     * Valida il modello attivo contro il catalogo corrente.
     * Se il provider o il modello non esistono più, imposta il primo disponibile.
     * @returns {boolean} true se il modello attivo era ancora valido
     */
    validateActive: function() {
        if (_activeProvider && _activeModel &&
            _providerModels[_activeProvider] &&
            _providerModels[_activeProvider].models[_activeModel]) {
            return true;
        }
        _setDefaultConfig();
        return false;
    },

    /**
     * API key attualmente in uso.
     * @returns {string}
     */
    getApiKey: function() {
        return _activeApiKey;
    },

    /**
     * Imposta provider e modello attivi in memoria.
     * Invalida il client se il provider cambia.
     * NON salva su DB, NON tocca la UI.
     * @param {string} provider
     * @param {string} model
     * @returns {boolean} true se impostato correttamente
     */
    setActive: function(provider, model) {
        if (!provider || !model) {
            console.error("LlmProvider.setActive: parametri mancanti");
            return false;
        }

        const providerData = _providerModels[provider];
        if (!providerData) {
            console.error(`LlmProvider.setActive: provider sconosciuto: ${provider}`);
            return false;
        }

        const modelData = providerData.models[model];
        if (!modelData) {
            console.error(`LlmProvider.setActive: modello sconosciuto: ${model}`);
            return false;
        }

        const providerChanged = provider !== _activeProvider;

        _activeProvider = provider;
        _activeModel = model;
        _windowSize = modelData.windowSize;

        if (providerChanged) {
            _activeClient = null;
            _activeClientProvider = "";
            _activeApiKey = "";
        }

        return true;
    },

    // ========================================================================
    // CLIENT
    // ========================================================================

    /**
     * Restituisce il client LLM per il provider attivo.
     * Crea una nuova istanza a ogni chiamata leggendo la chiave dal DB.
     * @returns {Promise<Object|null>}
     */
    getClient: async function() {
        if (!_activeProvider) {
            console.error("LlmProvider.getClient: nessun provider attivo");
            return null;
        }

        const apiKey = await getApiKey(_activeProvider);
        if (!apiKey) {
            console.error(`LlmProvider.getClient: chiave API mancante per ${_activeProvider}`);
            _activeClient = null;
            _activeClientProvider = "";
            _activeApiKey = "";
            return null;
        }

        _createClientInstance(_activeProvider, apiKey);
        return _activeClient;
    },

    /**
     * Invalida il client attivo se corrisponde al provider specificato.
     * Chiamato da key_retriever.js quando una chiave viene aggiunta o attivata.
     * @param {string} clientName
     */
    updateClient: async (clientName) => {
        if (_activeProvider === clientName) {
            _activeClient = null;
            _activeClientProvider = "";
            _activeApiKey = "";
        }
    },

    // ========================================================================
    // PERSISTENZA
    // ========================================================================

    /**
     * Carica la configurazione salvata da IndexedDB e la applica.
     * Se nessuna configurazione valida trovata, imposta il primo provider
     * disponibile come default (scenario primo avvio).
     * @returns {Promise<void>}
     */
    loadConfig: async function() {
        // NON caricare i modelli dai .txt all'avvio.
        // Il catalogo viene popolato solo con "Reset LLM" (da .txt) o
        // "Aggiorna LLM" (da discovery API). Se _providerModels è vuoto
        // e non c'è una config salvata, nessun default viene impostato.
        const savedConfig = await UaDb.readJson(DATA_KEYS.KEY_PROVIDER);

        if (_isValidConfig(savedConfig)) {
            _activeProvider = savedConfig.provider;
            _activeModel = savedConfig.model;
            _windowSize = savedConfig.windowSize;
        } else {
            _setDefaultConfig();
        }
    },

    /**
     * Salva la configurazione corrente su IndexedDB.
     * @returns {Promise<void>}
     */
    saveConfig: async function() {
        const config = LlmProvider.getConfig();
        await UaDb.saveJson(DATA_KEYS.KEY_PROVIDER, config);
    }
};
