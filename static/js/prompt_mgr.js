/**
 * prompt_mgr.js - Gestione prompt di sistema personalizzati su IndexedDB.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Fornisce CRUD per i prompt di sistema e la gestione del prompt attivo
 * (persistito in settings tramite UaDb).
 *
 * @module prompt_mgr
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { dbInstance as _db } from "./services/db_instance.js";
import { UaDb } from "./services/uadb.js";
import { DATA_KEYS } from "./services/data_keys.js";
import { logDbError } from "./services/error_utils.js";

// ============================================================================
// API PUBBLICA
// ============================================================================

export const PromptMgr = {

    /**
     * Crea un nuovo prompt di sistema.
     * @param {string} name - Nome del prompt.
     * @param {string} content - Contenuto del prompt.
     * @returns {Promise<Object|null>} Prompt creato (con id) o null.
     */
    create: async function(name, content) {
        const now = new Date().toISOString();
        const prompt = { name, content, createdAt: now, updatedAt: now };
        try {
            const id = await _db.prompts.add(prompt);
            const created = { id, ...prompt };
            return created;
        } catch (err) {
            const result = logDbError("prompt_mgr", "create", err);
            return result;
        }
    },

    /**
     * Restituisce l'elenco dei prompt di sistema.
     * @returns {Promise<Array>}
     */
    list: async function() {
        try {
            const rows = await _db.prompts.toArray();
            return rows;
        } catch (err) {
            const result = logDbError("prompt_mgr", "list", err);
            return result;
        }
    },

    /**
     * Restituisce un prompt per id.
     * @param {number} id - Id prompt.
     * @returns {Promise<Object|undefined>}
     */
    get: async function(id) {
        try {
            const row = await _db.prompts.get(id);
            return row;
        } catch (err) {
            const result = logDbError("prompt_mgr", "get", err);
            return result;
        }
    },

    /**
     * Aggiorna nome e/o contenuto di un prompt.
     * @param {number} id - Id prompt.
     * @param {Object} changes - Campi da aggiornare (name, content).
     * @returns {Promise<boolean>}
     */
    update: async function(id, changes) {
        try {
            await _db.prompts.update(id, {
                ...changes,
                updatedAt: new Date().toISOString()
            });
            const success = true;
            return success;
        } catch (err) {
            const result = logDbError("prompt_mgr", "update", err);
            return result;
        }
    },

    /**
     * Cancella un prompt. Se era il prompt attivo, lo disattiva.
     * @param {number} id - Id prompt.
     * @returns {Promise<boolean>}
     */
    delete: async function(id) {
        try {
            await _db.prompts.delete(id);
            const activeId = await PromptMgr.getActiveId();
            if (activeId === id) {
                await PromptMgr.setActive(null);
            }
            const success = true;
            return success;
        } catch (err) {
            const result = logDbError("prompt_mgr", "delete", err);
            return result;
        }
    },

    // ========================================================================
    // PROMPT ATTIVO
    // ========================================================================

    /**
     * Restituisce l'id del prompt attivo (o null).
     * @returns {Promise<number|null>}
     */
    getActiveId: async function() {
        const id = await UaDb.read(DATA_KEYS.KEY_ACTIVE_PROMPT_ID);
        const activeId = id || null;
        return activeId;
    },

    /**
     * Imposta il prompt attivo (null per disattivarlo) e lo persiste.
     * @param {number|null} id - Id prompt attivo.
     * @returns {Promise<boolean>}
     */
    setActive: async function(id) {
        try {
            if (id === null || id === undefined) {
                await UaDb.delete(DATA_KEYS.KEY_ACTIVE_PROMPT_ID);
            } else {
                await UaDb.save(DATA_KEYS.KEY_ACTIVE_PROMPT_ID, id);
            }
            const success = true;
            return success;
        } catch (err) {
            const result = logDbError("prompt_mgr", "setActive", err);
            return result;
        }
    },

    /**
     * Restituisce il prompt attivo completo (o null se nessuno selezionato).
     * @returns {Promise<Object|null>}
     */
    getActive: async function() {
        const id = await PromptMgr.getActiveId();
        if (!id) {
            const result = null;
            return result;
        }
        const prompt = await PromptMgr.get(id);
        const activePrompt = prompt || null;
        return activePrompt;
    }
};