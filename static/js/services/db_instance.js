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

export { dbInstance };
