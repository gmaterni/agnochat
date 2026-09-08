/** @format */
"use strict";

import Dexie from "./vendor/dexie.js";

/**
 * Istanza Dexie unica dell'applicazione agnochat.
 * Nome database: "agnochat" (nessun isolamento per utente: niente login).
 */
const dbInstance = new Dexie("agnochat");

dbInstance.version(1).stores({
    settings: "id",
    conversations: "++id, updatedAt",
    messages: "++id, conversationId",
    prompts: "++id"
});
dbInstance.version(2).stores({
    settings: "id",
    conversations: "++id, updatedAt",
    messages: "++id, conversationId",
    prompts: "++id"
}).upgrade(function() {
    // v1 kvStore rimosso: nessun dato da migrare (store mai usato)
});

/**
 * Svuota tutte le tabelle del database.
 * Usato dal reset totale dell'applicazione.
 */
const clearAllTables = async function() {
    try {
        await Promise.all(dbInstance.tables.map(function(t) { return t.clear(); }));
    } catch (err) {
        console.error("clearAllTables:", err);
    }
};

export { dbInstance, clearAllTables };
