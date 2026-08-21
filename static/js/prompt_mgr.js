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

// ============================================================================
// COSTANTI
// ============================================================================

/** Chiave settings per il prompt di sistema attivo. */
const KEY_ACTIVE_PROMPT = "active_prompt_id";

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

const _logErr = function(op, err) {
    console.error(`prompt_mgr.${op}:`, err);
    return null;
};

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
            return { id, ...prompt };
        } catch (err) {
            return _logErr("create", err);
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
            return _logErr("list", err);
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
            return _logErr("get", err);
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
            return true;
        } catch (err) {
            return _logErr("update", err);
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
            return true;
        } catch (err) {
            return _logErr("delete", err);
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
        const id = await UaDb.read(KEY_ACTIVE_PROMPT);
        return id || null;
    },

    /**
     * Imposta il prompt attivo (null per disattivarlo) e lo persiste.
     * @param {number|null} id - Id prompt attivo.
     * @returns {Promise<boolean>}
     */
    setActive: async function(id) {
        try {
            if (id === null || id === undefined) {
                await UaDb.delete(KEY_ACTIVE_PROMPT);
            } else {
                await UaDb.save(KEY_ACTIVE_PROMPT, id);
            }
            return true;
        } catch (err) {
            return _logErr("setActive", err);
        }
    },

    /**
     * Restituisce il prompt attivo completo (o null se nessuno selezionato).
     * @returns {Promise<Object|null>}
     */
    getActive: async function() {
        const id = await PromptMgr.getActiveId();
        if (!id) return null;
        const prompt = await PromptMgr.get(id);
        return prompt || null;
    }
};