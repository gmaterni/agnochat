/**
 * llm-db.js - IndexedDB wrapper per gestione modelli LLM.
 * Due object store isolati: discovered-models e selected-models.
 *
 * @module llm/llm-db
 * @version 1.0.0
 */

"use strict";

const DB_NAME = "agnochat-llm";
const DB_VERSION = 1;
const STORE_DISCOVERED = "discovered-models";
const STORE_SELECTED = "selected-models";

/** Vecchio nome del database, migrato al primo avvio. */
const LEGACY_DB_NAME = "vanillallm-llm";

/** Flag che impedisce di rieseguire la migrazione a ogni avvio. */
const MIGRATION_FLAG_KEY = "agnochat-migrated-llm-v1";

let _db = null;
let _useMemoryFallback = false;
const _memoryDiscovered = new Map();
const _memorySelected = new Map();

/**
 * Apre la connessione IndexedDB e crea gli object store.
 * @returns {Promise<IDBDatabase>}
 */
const _openDB = function() {
    const promise = new Promise(function(resolve, reject) {
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
    return promise;
};

/**
 * Copia i modelli dal vecchio database LLM al nuovo, poi lo elimina.
 * Esegue la copia solo se il vecchio database esiste già con i suoi store.
 * @returns {Promise<void>}
 */
const _migrateLegacyDb = async function() {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
        return;
    }

    const promise = new Promise(function(resolve, reject) {
        if (typeof indexedDB === "undefined") {
            localStorage.setItem(MIGRATION_FLAG_KEY, "1");
            resolve();
            return;
        }

        const request = indexedDB.open(LEGACY_DB_NAME, DB_VERSION);

        request.onupgradeneeded = function() {
            // Il vecchio database non esisteva: verrebbe creato vuoto, va scartato
            const db = request.result;
            db.close();
            indexedDB.deleteDatabase(LEGACY_DB_NAME);
        };

        request.onsuccess = function() {
            const legacyDb = request.result;
            const storeNames = legacyDb.objectStoreNames;
            const hasStores = storeNames.contains(STORE_DISCOVERED) && storeNames.contains(STORE_SELECTED);

            if (!hasStores) {
                localStorage.setItem(MIGRATION_FLAG_KEY, "1");
                legacyDb.close();
                resolve();
                return;
            }

            const readAll = function(storeName) {
                const promiseRead = new Promise(function(resolveRead, rejectRead) {
                    const tx = legacyDb.transaction(storeName, "readonly");
                    const store = tx.objectStore(storeName);
                    const readRequest = store.getAll();

                    readRequest.onsuccess = function() {
                        resolveRead(readRequest.result || []);
                    };
                    readRequest.onerror = function() {
                        rejectRead(readRequest.error);
                    };
                });
                return promiseRead;
            };

            Promise.all([readAll(STORE_DISCOVERED), readAll(STORE_SELECTED)]).then(async function(results) {
                const discovered = results[0];
                const selected = results[1];
                const migrated = await _migrateWrite(discovered, selected);

                if (!migrated) {
                    console.error("_migrateLegacyDb: copia dei modelli fallita");
                    legacyDb.close();
                    resolve();
                    return;
                }

                legacyDb.close();
                indexedDB.deleteDatabase(LEGACY_DB_NAME);
                localStorage.setItem(MIGRATION_FLAG_KEY, "1");
                console.info("_migrateLegacyDb: migrazione completata");
                resolve();
            }).catch(function(error) {
                console.error("_migrateLegacyDb:", error);
                legacyDb.close();
                resolve();
            });
        };

        request.onerror = function() {
            // Database inaccessibile: la migrazione non è possibile, si prosegue
            localStorage.setItem(MIGRATION_FLAG_KEY, "1");
            resolve();
        };
    });

    await promise;
};

/**
 * Apre il nuovo database LLM e scrive i modelli migrati.
 * @param {Array<Object>} discovered - Modelli scoperti da migrare.
 * @param {Array<Object>} selected - Modelli selezionati da migrare.
 * @returns {Promise<boolean>} true se la copia è riuscita.
 */
const _migrateWrite = async function(discovered, selected) {
    const promise = new Promise(function(resolve, reject) {
        if (typeof indexedDB === "undefined") {
            resolve(false);
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

        request.onsuccess = function() {
            const db = request.result;

            const writeAll = function(storeName, rows) {
                const promiseWrite = new Promise(function(resolveWrite, rejectWrite) {
                    const tx = db.transaction(storeName, "readwrite");
                    const store = tx.objectStore(storeName);

                    for (const row of rows) {
                        store.put(row);
                    }

                    tx.oncomplete = function() {
                        resolveWrite();
                    };
                    tx.onerror = function() {
                        rejectWrite(tx.error);
                    };
                });
                return promiseWrite;
            };

            Promise.all([writeAll(STORE_DISCOVERED, discovered), writeAll(STORE_SELECTED, selected)]).then(function() {
                db.close();
                resolve(true);
            }).catch(function(error) {
                console.error("_migrateWrite:", error);
                db.close();
                resolve(false);
            });
        };

        request.onerror = function() {
            resolve(false);
        };
    });

    const success = await promise;
    return success;
};

/**
 * Inizializza il database.
 * @returns {Promise<void>}
 */
export const init = async function() {
    if (_db || _useMemoryFallback) return;
    await _migrateLegacyDb();
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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

    const promise = new Promise(function(resolve, reject) {
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
    return promise;
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
 * Singleton database LLM (stessa API della precedente createLlmDB).
 * Ogni init() consecutivo non apre connessioni duplicate.
 */
export const llmDb = {
    init,
    saveDiscovered,
    getDiscovered,
    saveSelected,
    getSelected,
    addSelected,
    clearSelected,
    close
};