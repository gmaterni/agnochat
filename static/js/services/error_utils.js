/**
 * error_utils.js - Utility centralizzata per gestione errori.
 *
 * Fornisce:
 *   - logDbError: logga errori DB con prefisso del modulo
 *   - formatErrorPrefix: genera prefisso formattato per messaggi di errore
 *
 * @module services/error_utils
 * @version 1.0.0
 */

"use strict";

/**
 * Logga un errore DB con prefisso del modulo e restituisce null.
 * @param {string} module - Nome del modulo (es. 'conversation_mgr')
 * @param {string} op - Nome dell'operazione (es. 'create', 'list')
 * @param {Error} err - Errore catturato
 * @returns {null} Sempre null (per return inline).
 */
export const logDbError = function(module, op, err) {
    console.error(module + "." + op + ":", err);
    const result = null;
    return result;
};

/**
 * Genera un prefisso formattato per messaggi di errore utente.
 * @param {Error} error - Oggetto errore
 * @param {string} context - Contesto dell'operazione (es. 'Invio messaggio')
 * @returns {string} Prefisso formattato (es. '[Invio messaggio] Errore: ...')
 */
export const formatErrorPrefix = function(error, context) {
    const msg = (error && error.message) ? error.message : "Errore sconosciuto";
    const code = (error && error.code) ? " [" + error.code + "]" : "";
    const prefix = "[" + context + "]" + code + " " + msg;
    return prefix;
};
