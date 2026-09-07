/**
 * sender.js - Servizio di invio eventi e analytics.
 *
 * Gestisce l'invio asincrono di dati verso il worker WWWANALYZER per il
 * tracciamento delle attività, includendo metadata dell'ambiente.
 * Supporta la disattivazione automatica in ambiente locale tramite config.js.
 *
 * @module  services/sender
 * @version 1.0.0
 * @date    2026-08-21
 * @author  Gemini CLI
 */

"use strict";

import { DISABLE_SENDER_ON_LOCAL, isLocalEnvironment } from "./config.js";

// ============================================================================
// STATO PRIVATO (SINGLETON)
// ============================================================================

/**
 * Configurazione globale del mittente.
 * @private
 */
const _config = {
    workerUrl: "",
    userId: null,
    isInitialized: false
};


// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

/**
 * Raccoglie i metadata dell'ambiente corrente.
 *
 * @returns {Object} Oggetto contenente metadata di sistema.
 */
const _getMetadata = function () {
    const metadata = {
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        referrer: document.referrer,
        urlParams: Object.fromEntries(new URLSearchParams(window.location.search)),
        timestamp: Math.floor(Date.now() / 1000)
    };

    const result = metadata;
    return result;
};


// ============================================================================
// API PUBBLICA
// ============================================================================

export const UaSender = {

    /**
     * Inizializza il servizio di invio eventi.
     *
     * @param {Object} options - Opzioni di configurazione.
     * @param {string} options.workerUrl - URL base del worker analytics.
     * @param {string} options.userId - Identificativo unico dell'utente.
     */
    init: function (options = {}) {
        if (options.workerUrl) {
            _config.workerUrl = options.workerUrl;
        }

        if (options.userId) {
            _config.userId = options.userId;
        }

        _config.isInitialized = true;

        const readyMsg = `UaSender.init: servizio pronto. URL: ${_config.workerUrl}`;
        console.info(readyMsg);
    },

    /**
     * Invia un evento asincrono al server di analytics.
     *
     * In caso di errore (parametri mancanti, ambiente locale, risposta non
     * valida, rete irraggiungibile) restituisce null senza interrompere l'app.
     *
     * @param {string} appName - Nome dell'applicazione.
     * @param {string} actionName - Nome dell'azione eseguita.
     * @returns {Promise<Object|null>} Risposta del server o null in caso di errore/skip.
     */
    sendEventAsync: async function (appName, actionName) {
        // 1. Validazione Input (Fail Fast)
        if (!appName || !actionName) {
            console.error("UaSender.sendEventAsync: parametri mancanti");
            const result = null;
            return result;
        }

        // 2. Controllo Ambiente Locale via config.js
        if (DISABLE_SENDER_ON_LOCAL && isLocalEnvironment()) {
            console.info("UaSender.sendEventAsync: invio saltato (ambiente locale)");
            const result = null;
            return result;
        }

        // 3. Preparazione Payload
        const finalUserId = _config.userId || `${appName}_user_id`;
        const metadata = _getMetadata();

        const payload = {
            appName: appName,
            actionName: actionName,
            userId: finalUserId,
            ...metadata
        };

        // 4. Invio Richiesta
        try {
            const endpoint = `${_config.workerUrl}/api/analytics`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errCode = response.status;
                const errMsg = `UaSender.sendEventAsync: invio fallito [${errCode}]`;
                console.warn(errMsg);

                const result = null;
                return result;
            }

            const data = await response.json();
            const result = data;
            return result;

        } catch (error) {
            console.warn("UaSender.sendEventAsync: errore di rete", error);

            const result = null;
            return result;
        }
    }
};
