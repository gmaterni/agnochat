/**
 * settings_mgr.js - Persistenza delle impostazioni applicative su IndexedDB.
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Gestisce tema UI e conversazione attiva tramite UaDb (tabella settings).
 *
 * @module settings_mgr
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { UaDb } from "./services/uadb.js";
import { DATA_KEYS } from "./services/data_keys.js";

// ============================================================================
// API PUBBLICA
// ============================================================================

export const SettingsMgr = {

    // ========================================================================
    // TEMA
    // ========================================================================

    /**
     * Legge il tema salvato (default "dark").
     * @returns {Promise<string>} "dark" | "light"
     */
    getTheme: async function() {
        const theme = await UaDb.read(DATA_KEYS.KEY_THEME);
        const resolvedTheme = theme || "dark";
        return resolvedTheme;
    },

    /**
     * Salva il tema scelto.
     * @param {string} theme - "dark" | "light"
     * @returns {Promise<boolean>}
     */
    setTheme: async function(theme) {
        try {
            await UaDb.save(DATA_KEYS.KEY_THEME, theme);
            const success = true;
            return success;
        } catch (err) {
            console.error("SettingsMgr.setTheme:", err);
            const success = false;
            return success;
        }
    },

    // ========================================================================
    // CONVERSAZIONE ATTIVA
    // ========================================================================

    /**
     * Restituisce l'id della conversazione attiva (o null).
     * @returns {Promise<number|null>}
     */
    getActiveConversationId: async function() {
        const id = await UaDb.read(DATA_KEYS.KEY_ACTIVE_CONVERSATION_ID);
        const activeId = id || null;
        return activeId;
    },

    /**
     * Imposta e persiste la conversazione attiva.
     * @param {number|null} id - Id conversazione attiva.
     * @returns {Promise<boolean>}
     */
    setActiveConversationId: async function(id) {
        try {
            if (id === null || id === undefined) {
                await UaDb.delete(DATA_KEYS.KEY_ACTIVE_CONVERSATION_ID);
            } else {
                await UaDb.save(DATA_KEYS.KEY_ACTIVE_CONVERSATION_ID, id);
            }
            const success = true;
            return success;
        } catch (err) {
            console.error("SettingsMgr.setActiveConversationId:", err);
            const success = false;
            return success;
        }
    }
};