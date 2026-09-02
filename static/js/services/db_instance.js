/** @format */
"use strict";

import Dexie from "./vendor/dexie.js";

/**
 * Istanza Dexie unica dell'applicazione vanillallm.
 * Nome database: "vanillallm" (nessun isolamento per utente: niente login).
 */
const dbInstance = new Dexie("vanillallm");

dbInstance.version(1).stores({
    kvStore: "id",
    settings: "id",
    conversations: "++id, updatedAt",
    messages: "++id, conversationId",
    prompts: "++id"
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
