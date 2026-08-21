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

// ============================================================================
// COSTANTI
// ============================================================================

// I provider sono scoperti dinamicamente da static/data/models/manifest.json.
// Ogni provider con file .txt valido in data/models/ compare nell'albero di
// selezione — aggiungi/rimuovi un .txt + aggiorna manifest.json e l'albero
// si aggiorna senza toccare codice.
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
     * @returns {Promise<void>}
     */
    loadModels: async () => {
        _providerModels = {};

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

                _providerModels[p] = {
                    client: p,
                    models: {}
                };

                lines.forEach(function(line) {
                    const [name, windowSizeTokens] = line.split("|");
                    if (name && windowSizeTokens) {
                        const tokens = Math.round(parseInt(windowSizeTokens, 10) / 1024);
                        _providerModels[p].models[name] = {
                            windowSize: tokens
                        };
                    }
                });
            } catch (e) {
                console.warn(`Impossibile caricare i modelli per ${p}:`, e);
            }
        }

        // Filtro dai modelli attivi del repository ("active", se presente).
        // In assenza di modelli attivi salvati il catalogo resta completo.
        const repository = await UaDb.readJson(DATA_KEYS.KEY_LLM_REPOSITORY);
        const active = (repository && typeof repository === "object" && !Array.isArray(repository))
            ? (repository.active || null)
            : null;
        if (active && typeof active === "object" && !Array.isArray(active)) {
            for (const providerName of Object.keys(_providerModels)) {
                const accepted = active[providerName];

                if (!Array.isArray(accepted) || accepted.length === 0) {
                    delete _providerModels[providerName];
                    continue;
                }

                const acceptedSet = new Set(accepted);
                for (const modelName of Object.keys(_providerModels[providerName].models)) {
                    if (!acceptedSet.has(modelName)) {
                        delete _providerModels[providerName].models[modelName];
                    }
                }

                if (Object.keys(_providerModels[providerName].models).length === 0) {
                    delete _providerModels[providerName];
                }
            }
        }
    },

    /**
     * Inizializzazione rapida: carica modelli e API keys.
     * @returns {Promise<void>}
     */
    init: async () => {
        await LlmProvider.loadModels();
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
     * Ricostruisce il catalogo in memoria a partire dai modelli disponibili
     * (scoperti dinamicamente o da file), applicando il filtro del repository
     * dei modelli accettati. Se il repository è assente o vuoto, vengono
     * mantenuti tutti i modelli disponibili. I provider rimasti senza modelli
     * vengono rimossi. Serve per far comparire nell'albero anche i modelli
     * scoperti non presenti nei file .txt.
     * @param {Object<string, Array<{id: string, contextWindow: number}>>} available
     * @returns {Promise<void>}
     */
    applyRepositoryToAvailable: async function(available) {
        _providerModels = {};

        const repository = await UaDb.readJson(DATA_KEYS.KEY_LLM_REPOSITORY);
        const active = (repository && typeof repository === "object" && !Array.isArray(repository))
            ? (repository.active || null)
            : null;
        const hasActive = active && typeof active === "object" && !Array.isArray(active);

        for (const provider of Object.keys(available)) {
            const models = available[provider];
            if (!Array.isArray(models) || models.length === 0) {
                continue;
            }

            let list = models;
            if (hasActive) {
                const accepted = active[provider];
                if (!Array.isArray(accepted) || accepted.length === 0) {
                    continue;
                }
                const acceptedSet = new Set(accepted);
                list = models.filter(function(m) {
                    return acceptedSet.has(m.id);
                });
            }

            if (list.length === 0) {
                continue;
            }

            const store = {};
            for (const m of list) {
                if (!m || !m.id) {
                    continue;
                }
                const tokens = m.contextWindow ? Math.round(m.contextWindow / 1024) : 0;
                store[m.id] = { windowSize: tokens };
            }
            _providerModels[provider] = { client: provider, models: store };
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
        await LlmProvider.loadModels();

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
