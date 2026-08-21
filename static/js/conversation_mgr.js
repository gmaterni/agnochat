/**
 * conversation_mgr.js - Gestione conversazioni e messaggi su IndexedDB.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Fornisce CRUD per conversazioni e messaggi tramite Dexie (db_instance).
 *
 * @module conversation_mgr
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { dbInstance as _db } from "./services/db_instance.js";

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

const _logErr = function(op, err) {
    console.error(`conversation_mgr.${op}:`, err);
    return null;
};

// ============================================================================
// API PUBBLICA — Conversazioni
// ============================================================================

export const ConversationMgr = {

    /**
     * Crea una nuova conversazione con titolo e timestamp.
     * @param {string} title - Titolo della conversazione.
     * @returns {Promise<Object|null>} Conversazione creata (con id) o null.
     */
    create: async function(title) {
        const now = new Date().toISOString();
        const conversation = {
            title: title || "Nuova conversazione",
            createdAt: now,
            updatedAt: now
        };
        try {
            const id = await _db.conversations.add(conversation);
            return { id, ...conversation };
        } catch (err) {
            return _logErr("create", err);
        }
    },

    /**
     * Restituisce l'elenco delle conversazioni ordinate per ultimo aggiornamento.
     * @returns {Promise<Array>} Array di conversazioni.
     */
    list: async function() {
        try {
            const rows = await _db.conversations.orderBy("updatedAt").reverse().toArray();
            return rows;
        } catch (err) {
            return _logErr("list", err);
        }
    },

    /**
     * Restituisce una conversazione per id.
     * @param {number} id - Id conversazione.
     * @returns {Promise<Object|undefined>}
     */
    get: async function(id) {
        try {
            const row = await _db.conversations.get(id);
            return row;
        } catch (err) {
            return _logErr("get", err);
        }
    },

    /**
     * Aggiorna il titolo e la data di ultimo aggiornamento di una conversazione.
     * @param {number} id - Id conversazione.
     * @param {Object} changes - Campi da aggiornare (title, updatedAt...).
     * @returns {Promise<boolean>}
     */
    update: async function(id, changes) {
        try {
            await _db.conversations.update(id, {
                ...changes,
                updatedAt: new Date().toISOString()
            });
            return true;
        } catch (err) {
            return _logErr("update", err);
        }
    },

    /**
     * Cancella una conversazione e tutti i suoi messaggi.
     * @param {number} id - Id conversazione.
     * @returns {Promise<boolean>}
     */
    delete: async function(id) {
        try {
            await _db.transaction("rw", _db.conversations, _db.messages, async () => {
                await _db.messages.where("conversationId").equals(id).delete();
                await _db.conversations.delete(id);
            });
            return true;
        } catch (err) {
            return _logErr("delete", err);
        }
    }
};

// ============================================================================
// API PUBBLICA — Messaggi
// ============================================================================

export const MessageStore = {

    /**
     * Aggiunge un messaggio a una conversazione e ne tocca updatedAt.
     * @param {number} conversationId - Id conversazione.
     * @param {string} role - "user" | "assistant" | "system".
     * @param {string} content - Contenuto del messaggio.
     * @returns {Promise<Object|null>} Messaggio creato (con id) o null.
     */
    add: async function(conversationId, role, content) {
        const message = {
            conversationId,
            role,
            content,
            createdAt: new Date().toISOString()
        };
        try {
            const id = await _db.messages.add(message);
            await ConversationMgr.update(conversationId, {});
            return { id, ...message };
        } catch (err) {
            return _logErr("add", err);
        }
    },

    /**
     * Restituisce i messaggi di una conversazione in ordine cronologico.
     * @param {number} conversationId - Id conversazione.
     * @returns {Promise<Array>}
     */
    list: async function(conversationId) {
        try {
            const rows = await _db.messages
                .where("conversationId")
                .equals(conversationId)
                .sortBy("createdAt");
            return rows;
        } catch (err) {
            return _logErr("list", err);
        }
    },

    /**
     * Cancella i messaggi di una conversazione dal messaggio indicato in poi.
     * @param {number} conversationId - Id conversazione.
     * @param {number} fromMessageId - Id del primo messaggio da cancellare.
     * @returns {Promise<boolean>}
     */
    removeFrom: async function(conversationId, fromMessageId) {
        try {
            await _db.messages
                .where("conversationId")
                .equals(conversationId)
                .and(m => m.id >= fromMessageId)
                .delete();
            await ConversationMgr.update(conversationId, {});
            return true;
        } catch (err) {
            return _logErr("removeFrom", err);
        }
    },

    /**
     * Cancella tutti i messaggi di una conversazione.
     * @param {number} conversationId - Id conversazione.
     * @returns {Promise<boolean>}
     */
    deleteByConversation: async function(conversationId) {
        try {
            await _db.messages.where("conversationId").equals(conversationId).delete();
            return true;
        } catch (err) {
            return _logErr("deleteByConversation", err);
        }
    }
};