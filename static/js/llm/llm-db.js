/**
 * llm-db.js - IndexedDB wrapper per gestione modelli LLM.
 * Due object store isolati: discovered-models e selected-models.
 *
 * @module llm/llm-db
 * @version 1.0.0
 */

"use strict";

const DB_NAME = "vanillallm-llm";
const DB_VERSION = 1;
const STORE_DISCOVERED = "discovered-models";
const STORE_SELECTED = "selected-models";

let _db = null;
let _useMemoryFallback = false;
const _memoryDiscovered = new Map();
const _memorySelected = new Map();

/**
 * Apre la connessione IndexedDB e crea gli object store.
 * @returns {Promise<IDBDatabase>}
 */
const _openDB = function() {
    return new Promise(function(resolve, reject) {
        if (typeof indexedDB === "undefined") {
            _useMemoryFallback = true;
            console.warn("llm-db: IndexedDB non disponibile, uso fallback in-memory");
            resolve(null);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function(event) {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORE_DISCOVERED)) {
                const store = db.createObjectStore(STORE_DISCOVERED, { keyPath: "id" });
                store.createIndex("provider", "provider", { unique: false });
                store.createIndex("model", "model", { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_SELECTED)) {
                const store = db.createObjectStore(STORE_SELECTED, { keyPath: "id" });
                store.createIndex("provider", "provider", { unique: false });
                store.createIndex("model", "model", { unique: false });
            }
        };

        request.onsuccess = function(event) {
            _db = event.target.result;
            resolve(_db);
        };

        request.onerror = function(event) {
            _useMemoryFallback = true;
            console.warn("llm-db: Errore apertura IndexedDB, uso fallback in-memory", event.target.error);
            resolve(null);
        };
    });
};

/**
 * Inizializza il database.
 * @returns {Promise<void>}
 */
export const init = async function() {
    await _openDB();
};

/**
 * Salva i modelli scoperti (sovrascrive tutto).
 * @param {Array<Object>} models - Array di {provider, model, name?, windowSize?}
 * @returns {Promise<void>}
 */
export const saveDiscovered = async function(models) {
    if (_useMemoryFallback || !_db) {
        _memoryDiscovered.clear();
        for (const m of models) {
            const id = m.provider + ":" + m.model;
            _memoryDiscovered.set(id, { ...m, id });
        }
        return;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_DISCOVERED, "readwrite");
        const store = tx.objectStore(STORE_DISCOVERED);

        store.clear();

        for (const m of models) {
            const id = m.provider + ":" + m.model;
            store.put({ ...m, id });
        }

        tx.oncomplete = function() {
            resolve();
        };
        tx.onerror = function() {
            reject(tx.error);
        };
    });
};

/**
 * Recupera tutti i modelli scoperti.
 * @returns {Promise<Array<Object>>}
 */
export const getDiscovered = async function() {
    if (_useMemoryFallback || !_db) {
        const result = Array.from(_memoryDiscovered.values());
        return result;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_DISCOVERED, "readonly");
        const store = tx.objectStore(STORE_DISCOVERED);
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result || []);
        };
        request.onerror = function() {
            reject(request.error);
        };
    });
};

/**
 * Salva i modelli selezionati (sovrascrive tutto).
 * @param {Array<Object>} models - Array di {provider, model, name?, windowSize?}
 * @returns {Promise<void>}
 */
export const saveSelected = async function(models) {
    if (_useMemoryFallback || !_db) {
        _memorySelected.clear();
        for (const m of models) {
            const id = m.provider + ":" + m.model;
            _memorySelected.set(id, { ...m, id });
        }
        return;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_SELECTED, "readwrite");
        const store = tx.objectStore(STORE_SELECTED);

        store.clear();

        for (const m of models) {
            const id = m.provider + ":" + m.model;
            store.put({ ...m, id });
        }

        tx.oncomplete = function() {
            resolve();
        };
        tx.onerror = function() {
            reject(tx.error);
        };
    });
};

/**
 * Aggiunge modelli alla selezione esistente (ignora duplicati).
 * @param {Array<Object>} models - Array di {provider, model, name?, windowSize?}
 * @returns {Promise<void>}
 */
export const addSelected = async function(models) {
    if (_useMemoryFallback || !_db) {
        for (const m of models) {
            const id = m.provider + ":" + m.model;
            if (!_memorySelected.has(id)) {
                _memorySelected.set(id, { ...m, id });
            }
        }
        return;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_SELECTED, "readwrite");
        const store = tx.objectStore(STORE_SELECTED);

        tx.onerror = function() {
            reject(tx.error);
        };
        tx.onabort = function() {
            reject(tx.error || new Error("Transazione abortita"));
        };

        const putNext = function(modelList, index) {
            if (index >= modelList.length) {
                resolve();
                return;
            }
            const m = modelList[index];
            const id = m.provider + ":" + m.model;
            const getReq = store.get(id);
            getReq.onsuccess = function() {
                if (!getReq.result) {
                    store.put({ ...m, id });
                }
                putNext(modelList, index + 1);
            };
            getReq.onerror = function() {
                reject(getReq.error);
            };
        };

        putNext(models, 0);
    });
};

/**
 * Recupera tutti i modelli selezionati.
 * @returns {Promise<Array<Object>>}
 */
export const getSelected = async function() {
    if (_useMemoryFallback || !_db) {
        const result = Array.from(_memorySelected.values());
        return result;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_SELECTED, "readonly");
        const store = tx.objectStore(STORE_SELECTED);
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result || []);
        };
        request.onerror = function() {
            reject(request.error);
        };
    });
};

/**
 * Svuota la selezione corrente.
 * @returns {Promise<void>}
 */
export const clearSelected = async function() {
    if (_useMemoryFallback || !_db) {
        _memorySelected.clear();
        return;
    }

    return new Promise(function(resolve, reject) {
        const tx = _db.transaction(STORE_SELECTED, "readwrite");
        const store = tx.objectStore(STORE_SELECTED);
        store.clear();
        tx.oncomplete = function() {
            resolve();
        };
        tx.onerror = function() {
            reject(tx.error);
        };
    });
};

/**
 * Chiude la connessione al database.
 */
export const close = function() {
    if (_db) {
        _db.close();
        _db = null;
    }
};

/**
 * Factory per creare l'istanza del database (singleton).
 * @returns {Object} API del database
 */
export const createLlmDB = function() {
    return {
        init,
        saveDiscovered,
        getDiscovered,
        saveSelected,
        getSelected,
        addSelected,
        clearSelected,
        close
    };
};

export default { createLlmDB };