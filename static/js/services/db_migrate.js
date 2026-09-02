/**
 * db_migrate.js - Migrazione one-shot dei database applicativi.
 *
 * Rinomina il database Dexie principale copiando tutti i record al primo
 * avvio, senza perdita di dati.
 * Il vecchio database viene eliminato solo a copia completata.
 *
 * @module  services/db_migrate
 * @version 1.0.0
 * @date    2026-09-02
 */

"use strict";

import Dexie from "./vendor/dexie.js";

// ============================================================================
// COSTANTI DI MODULO
// ============================================================================

/** Nome del vecchio database applicativo. */
const OLD_DB_NAME = "vanillallm";

/** Nome del nuovo database applicativo. */
const NEW_DB_NAME = "agnochat";

/** Flag che impedisce di rieseguire la migrazione a ogni avvio. */
const MIGRATION_FLAG_KEY = "agnochat-migrated-v1";

/** Schema del database applicativo (identico tra vecchio e nuovo nome). */
const APP_DB_SCHEMA = {
    kvStore: "id",
    settings: "id",
    conversations: "++id, updatedAt",
    messages: "++id, conversationId",
    prompts: "++id"
};

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

/**
 * Legge tutti i record del vecchio database.
 *
 * @param {Dexie} oldDb - Istanza Dexie sul vecchio database.
 * @returns {Promise<Object>} Mappa store -> array di record.
 */
const _readAllRecords = async function(oldDb) {
    const records = {};

    for (const table of oldDb.tables) {
        const rows = await table.toArray();
        records[table.name] = rows;
    }

    return records;
};

/**
 * Copia i record nel nuovo database.
 *
 * @param {Dexie} newDb - Istanza Dexie sul nuovo database.
 * @param {Object} records - Mappa store -> array di record.
 * @returns {Promise<void>}
 */
const _writeAllRecords = async function(newDb, records) {
    const storeNames = Object.keys(records);

    for (const storeName of storeNames) {
        const rows = records[storeName];
        if (rows.length > 0) {
            await newDb.table(storeName).bulkAdd(rows);
        }
    }
};

// ============================================================================
// FUNZIONE PUBBLICA
// ============================================================================

/**
 * Esegue la migrazione one-shot del database applicativo.
 *
 * Se la migrazione è già stata completata o il vecchio database non
 * esiste, non fa nulla. In caso di errore lascia intatti i vecchi dati.
 *
 * @returns {Promise<void>}
 */
export const migrateAppDatabase = async function() {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
        return;
    }

    const oldExists = await Dexie.exists(OLD_DB_NAME);
    if (!oldExists) {
        localStorage.setItem(MIGRATION_FLAG_KEY, "1");
        return;
    }

    const oldDb = new Dexie(OLD_DB_NAME);
    oldDb.version(1).stores(APP_DB_SCHEMA);

    try {
        const records = await _readAllRecords(oldDb);

        const newDb = new Dexie(NEW_DB_NAME);
        newDb.version(1).stores(APP_DB_SCHEMA);
        await _writeAllRecords(newDb, records);
        newDb.close();

        await oldDb.delete();
        localStorage.setItem(MIGRATION_FLAG_KEY, "1");

        console.info(`migrateAppDatabase: migrazione completata (${OLD_DB_NAME} -> ${NEW_DB_NAME})`);
    } catch (error) {
        console.error("migrateAppDatabase:", error);
        oldDb.close();
    }
};