/**
 * config.js - Configurazione globale dell'applicazione.
 *
 * Centralizza le impostazioni di sviluppo e produzione.
 *
 * @module services/config
 */
"use strict";

/**
 * AAA Se true, disabilita la login Google in ambiente locale e assegna l'utente LOCAL_USER_ID.
 * Tenerlo a false in uso normale: la login Google resta obbligatoria anche in
 * locale e LOCAL_USER_ID viene usato solo a login disabilitata (sviluppo senza auth).
 */
export const DISABLE_LOGIN_ON_LOCAL = true;

/**
 * ID Utente assegnato automaticamente in ambiente locale se DISABLE_LOGIN_ON_LOCAL è true.
 */
export const LOCAL_USER_ID = "user_local";

/**
 * Se true, impedisce l'invio degli eventi al worker di analytics in ambiente locale.
 * Tenerlo a false durante i test in locale, altrimenti il sender salta
 * l'invio e in console compare "invio saltato (ambiente locale)".
 */
export const DISABLE_SENDER_ON_LOCAL = true;

/**
 * URL del worker WWWANALYZER per l'invio eventi analytics.
 */
export const WORKER_URL = "https://wwwanalyzer-backend.workerua.workers.dev";
// AAA url per prova con applicazione in locale
// export const WORKER_URL = "http://localhost:8787";

/**
 * Verifica se l'applicazione è in esecuzione in un ambiente locale.
 *
 * @returns {boolean}
 */
export const isLocalEnvironment = function () {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const isLocal = host === "localhost" || host === "127.0.0.1" || protocol === "file:";
    return isLocal;
};
