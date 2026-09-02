/** @format */
"use strict";

import { UaJtfh } from "./uajtfh.js";
import { UaDb } from "./uadb.js";
import { DATA_KEYS } from "./data_keys.js";
import { escapeHtml } from "./history_utils.js";

const STORAGE_KEY = DATA_KEYS.KEY_API_KEYS;

/**
 * Whitelist dei provider con client LLM implementato.
 * @type {Array<string>}
 * @private
 */
const _IMPLEMENTED_CLIENTS = ["gemini", "mistral", "groq", "openrouter", "cerebras", "siliconflow"];
export const IMPLEMENTED_CLIENTS = _IMPLEMENTED_CLIENTS;

/**
 * Recupera la lista dinamica dei provider supportati da _PROVIDER_CONFIG.
 * @returns {Promise<Array<string>>}
 * @private
 */
const _getSupportedProviders = async function() {
    const { getProviderConfig } = await import("agnochat/llm_provider.js");
    const config = getProviderConfig();

    if (Object.keys(config).length > 0) {
        const result = Object.keys(config);
        return result;
    }

    // Fallback se _PROVIDER_CONFIG non è ancora caricato
    const result = ["gemini", "mistral"];
    return result;
};

/**
 * Recupera la chiave attiva per un determinato provider.
 * @param {string} providerName - Il nome del provider (es. 'gemini', 'mistral')
 * @returns {string|null} La chiave API attiva o null.
 */
export async function getApiKey(providerName) {
    let result = null;

    try {
        const db = await UaDb.readJson(STORAGE_KEY);

        if (!db || !db.providers || !db.providers[providerName]) {
            const notFound = null;
            return notFound;
        }

        const providerData = db.providers[providerName];
        const activeKeyName = providerData.exported_key;

        if (!activeKeyName) {
            const notFound = null;
            return notFound;
        }

        const keyObj = providerData.keys.find(k => k.name === activeKeyName);
        result = keyObj ? keyObj.key : null;
    } catch (error) {
        console.error(`getApiKey: Errore nel recupero della chiave per ${providerName}:`, error);
        result = null;
    }

    return result;
}

/**
 * Struttura dati base se il DB è vuoto
 */
const INITIAL_DB = {
    last_updated: new Date().toISOString(),
    providers: {}
};

/**
 * Gestore principale delle API Keys (UI).
 */
export async function addApiKey() {
    let db = await UaDb.readJson(STORAGE_KEY) || JSON.parse(JSON.stringify(INITIAL_DB));

    const render = async function() {
        const jfh = UaJtfh();

        // Uniamo i provider supportati con quelli già nel DB
        const supported = await _getSupportedProviders();
        const allProviders = new Set([
            ...supported,
            ...Object.keys(db.providers || {})
        ]);
        const sortedAllProviders = Array.from(allProviders).sort();

        jfh.append('<div class="ak-manager">');

        // 1. Form Aggiunta
        jfh.append('<div class="ak-form">');

        // Riga 1: etichette
        jfh.append('<div class="ak-form-row">');
        jfh.append('<div><label class="ak-label">Provider</label></div>');
        jfh.append('<div><label class="ak-label">Nome (es. work)</label></div>');
        jfh.append('<div class="ak-grow"><label class="ak-label">API Key</label></div>');
        jfh.append('<button class="ak-btn-add" data-action="add-key">Aggiungi</button>');
        jfh.append('</div>');

        // Riga 2: input
        jfh.append('<div class="ak-form-row-inputs">');
        jfh.append('<div><select id="key-sel-provider" class="ak-select">');
        sortedAllProviders.forEach(p => jfh.append(`<option value="${p}">${p}</option>`));
        jfh.append('</select></div>');
        jfh.append('<div><input type="text" id="key-inp-name" placeholder="work" class="ak-input-name"></div>');
        jfh.append('<div class="ak-grow-min"><input type="text" id="key-inp-key" placeholder="Inserisci API key" class="ak-input-key"></div>');
        jfh.append('</div>');

        jfh.append('</div>');

        // 2. Elenco
        jfh.append('<div class="ak-list-wrap">');
        jfh.append('<table class="ak-table">');
        jfh.append('<thead class="ak-thead"><tr>');
        jfh.append('<th class="ak-th-radio">Attiva</th>');
        jfh.append('<th class="ak-th-name">Nome</th>');
        jfh.append('<th class="ak-th-key">Chiave</th>');
        jfh.append('<th class="ak-th-del">Del</th>');
        jfh.append('</tr></thead><tbody>');

        const sortedProviders = Object.keys(db.providers || {}).sort();
        if (sortedProviders.length === 0) {
            jfh.append('<tr><td colspan="4" class="ak-empty">Nessuna chiave configurata.</td></tr>');
        } else {
            sortedProviders.forEach(pName => {
                const providerData = db.providers[pName];
                const keys = providerData.keys || [];
                const activeKey = providerData.exported_key;

                jfh.append(`<tr class="ak-provider-row"><td colspan="4" class="ak-provider-name">${pName}</td></tr>`);

                if (keys.length === 0) {
                    jfh.append('<tr><td colspan="4" class="ak-no-keys">Nessuna chiave.</td></tr>');
                } else {
                    keys.forEach(k => {
                        const isChecked = activeKey === k.name;
                        const rowClass = isChecked ? "ak-key-row ak-key-row-active" : "ak-key-row";
                        const nameClass = isChecked ? "ak-cell-name ak-cell-name-active" : "ak-cell-name";
                        const keyClass = isChecked ? "ak-cell-key ak-cell-key-active" : "ak-cell-key ak-cell-key-inactive";
                        const checkedAttr = isChecked ? 'checked' : '';
                        const keyPrefix = k.key.substring(0, 8);
                        const keySuffix = k.key.substring(k.key.length - 4);
                        const keyDisplay = `${keyPrefix}...${keySuffix}`;
                        const keyNameEscaped = escapeHtml(k.name);
                        const providerEscaped = escapeHtml(pName);
                        jfh.append(`<tr class="${rowClass}">`);
                        jfh.append(`<td class="ak-cell-center"><input type="radio" name="group_${providerEscaped}" ${checkedAttr} class="ak-radio" data-action="set-active" data-provider="${providerEscaped}" data-keyname="${keyNameEscaped}"></td>`);
                        jfh.append(`<td class="${nameClass}">${keyNameEscaped}</td>`);
                        jfh.append(`<td class="${keyClass}">${keyDisplay}</td>`);
                        jfh.append(`<td class="ak-cell-center"><button class="btn-danger ak-btn-del" data-action="delete-key" data-provider="${providerEscaped}" data-keyname="${keyNameEscaped}">X</button></td>`);
                        jfh.append('</tr>');
                    });
                }
            });
        }
        jfh.append('</tbody></table></div></div>');

        wnds.winfo.show(jfh.html());

        // Delega eventi sul container
        const container = wnds.winfo.getElement();
        if (container) {
            container.addEventListener("click", async function(e) {
                const target = e.target.closest("[data-action]");
                if (!target) return;

                const action = target.dataset.action;

                if (action === "add-key") {
                    await _handleAddKey(db, saveDb);
                } else if (action === "set-active") {
                    const provider = target.dataset.provider;
                    const keyName = target.dataset.keyname;
                    await _handleSetActiveKey(provider, keyName, db, saveDb, render);
                } else if (action === "delete-key") {
                    const provider = target.dataset.provider;
                    const keyName = target.dataset.keyname;
                    await _handleDeleteKey(provider, keyName, db, saveDb);
                }
            });
        }
    };

    const saveDb = async function() {
        db.last_updated = new Date().toISOString();
        await UaDb.saveJson(STORAGE_KEY, db);
        await render();
    };

    await render();
}

// ============================================================================
// HANDLER (private)
// ============================================================================

const _handleAddKey = async function(db, saveDb) {
    const provider = document.getElementById("key-sel-provider").value;
    const name = document.getElementById("key-inp-name").value;
    const key = document.getElementById("key-inp-key").value;
    if (!provider || !name || !key) {
        alert("Provider, Nome e Key obbligatori.");
        return;
    }

    if (!db.providers[provider]) {
        const envKeyName = provider.toUpperCase() + "_API_KEY";
        db.providers[provider] = { api_key_env: envKeyName, exported_key: null, keys: [] };
    }
    const providerData = db.providers[provider];
    if (providerData.keys.some(k => k.name === name)) {
        alert(`Esiste già una chiave con nome '${name}' per ${provider}.`);
        return;
    }

    providerData.keys.push({ name, key, notes: "" });
    if (!providerData.exported_key) {
        providerData.exported_key = name;
        const { LlmProvider } = await import("agnochat/llm_provider.js");
        await LlmProvider.updateClient(provider);
    }

    await saveDb();
};

const _handleSetActiveKey = async function(provider, keyName, db, saveDb, render) {
    if (!await confirm(`Attivare la chiave '${keyName}' per ${provider}?`)) {
        await render();
        return;
    }
    db.providers[provider].exported_key = keyName;
    await saveDb();

    const { LlmProvider } = await import("agnochat/llm_provider.js");
    await LlmProvider.updateClient(provider);
};

const _handleDeleteKey = async function(provider, keyName, db, saveDb) {
    if (!await confirm(`Eliminare la chiave '${keyName}' di ${provider}?`)) return;
    const providerData = db.providers[provider];
    providerData.keys = providerData.keys.filter(k => k.name !== keyName);
    if (providerData.exported_key === keyName) {
        providerData.exported_key = null;
    }
    await saveDb();
    const { LlmProvider } = await import("agnochat/llm_provider.js");
    await LlmProvider.updateClient(provider);
};

/**
 * Decodifica le chiavi API offuscate con substitution cipher.
 *
 * NOTA: Questo è un semplice offuscamento (substitution cipher), non vera
 * crittografia. Serve solo a evitare la memorizzazione in chiaro delle chiavi
 * nel file JSON statico. Per sicurezza reale servirebbe cifratura asimmetrica
 * o Web Crypto API con chiave derivata da autenticazione utente.
 *
 * @param {Object} data - Dati con chiavi offuscate.
 * @returns {Object} Dati con chiavi decodificate.
 */
const decodeApiKeysJson = function(data) {
    if (!data || !data.providers) return data;

    const ALPHABET_FROM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const ALPHABET_TO = "mKpX3vQwL8ZnR4yTbJxF1YHcU9AgNsI2oODh7eMzW5jV6ifqGrPECuS0Btaldk-_";

    const decodeKey = function(encodedKey) {
        const chars = [...encodedKey];
        const decoded = chars.map(function(char) {
            const index = ALPHABET_TO.indexOf(char);
            const result = index !== -1 ? ALPHABET_FROM[index] : char;
            return result;
        });
        const decodedKey = decoded.join("");
        return decodedKey;
    };

    const decodedData = JSON.parse(JSON.stringify(data));

    Object.values(decodedData.providers).forEach(function(provider) {
        if (provider.keys) {
            provider.keys.forEach(function(keyObj) {
                if (keyObj.key) keyObj.key = decodeKey(keyObj.key);
            });
        }
    });

    return decodedData;
};

export async function fetchApiKeys() {
    const URL = "./data/api_x.json";
    try {
        const existingDb = await UaDb.readJson(STORAGE_KEY);
        if (existingDb && existingDb.providers && Object.keys(existingDb.providers).length > 0) {
            console.debug("*** API_KEYS db found.");
            return;
        }
        await _loadDefaultKeys(URL);
    } catch (error) {
        console.error("Errore in fetchApiKeys:", error);
    }
}

/**
 * Carica forzatamente le chiavi di default dal file JSON.
 */
export async function restoreDefaultApiKeys() {
    const URL = "./data/api_x.json";
    if (!await confirm("Vuoi caricare le API Keys di default? Le chiavi attuali verranno sovrascritte.")) return;

    try {
        await _loadDefaultKeys(URL);
        await alert("API Keys di default caricate con successo.");
    } catch (error) {
        console.error("Errore in restoreDefaultApiKeys:", error);
        await alert("Errore durante il caricamento delle API Keys di default.");
    }
}

/**
 * Logica comune di caricamento chiavi dal server/file.
 * @private
 */
async function _loadDefaultKeys(url) {
    console.info(`*** Loading API_KEYS from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`File chiavi non trovato: ${url}`);
    }
    const rsp = await response.json();
    const data = decodeApiKeysJson(rsp);
    if (data && data.providers) {
        // Filtra solo i provider con client implementato
        Object.keys(data.providers).forEach(function(providerName) {
            if (!_IMPLEMENTED_CLIENTS.includes(providerName)) {
                delete data.providers[providerName];
            }
        });
        Object.values(data.providers).forEach(function(provider) {
            if (provider.keys && provider.keys.length > 0) {
                provider.exported_key = provider.keys[0].name;
            }
        });
        data.last_updated = new Date().toISOString();
        await UaDb.saveJson(STORAGE_KEY, data);
        console.debug("API Keys caricate e salvate nel DB.");
    }
}
