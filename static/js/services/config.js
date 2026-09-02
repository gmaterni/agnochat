/**
 * config.js - Configurazione globale dell'applicazione.
 *
 * Centralizza le impostazioni di sviluppo e produzione.
 *
 * @module services/config
 */
"use strict";

/**
 * Se true, impedisce l'invio degli eventi al worker di analytics in ambiente locale.
 */
export const DISABLE_SENDER_ON_LOCAL = false;

/**
 * Verifica se l'applicazione è in esecuzione in un ambiente locale.
 *
 * @returns {boolean}
 */
export const isLocalEnvironment = function() {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const isLocal = host === "localhost" || host === "127.0.0.1" || protocol === "file:";
    return isLocal;
};
