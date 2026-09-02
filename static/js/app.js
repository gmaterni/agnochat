/**
 * app.js - Entry point dell'applicazione vanillallm.
 *
 * Inizializza e avvia l'applicazione coordinando i manager e la UI.
 * Implementa la gestione degli errori globale.
 *
 * @module  app
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { UaLog } from "./services/ualog3.js";
import { bindEventListener, showHtmlThread, wnds, Commands, TextInput, TextOutput, getTheme, updateActiveModelDisplay } from "./app_ui.js";
import { AppMgr } from "./app_mgr.js";
import { UaSender } from "./services/sender.js";
import { formatErrorPrefix } from "./services/error_utils.js";

import "./services/uadialog.js";

// ============================================================================
// COSTANTI DI MODULO
// ============================================================================

/** @type {string} Versione dell'applicazione. */
const APP_VERSION = "1.0.0";

/** @type {string} URL del worker per l'invio eventi analytics. */
const WORKER_URL = "https://wwwanalyzer-backend.workerua.workers.dev";

/** Codice di errore che indica l'interruzione manuale dell'utente. */
const ERROR_CODE_CANCELLED = 499;

// ============================================================================
// GESTIONE ERRORI GLOBALE
// ============================================================================

/**
 * Gestore globale degli errori sincroni.
 */
window.onerror = function (message, source, lineno, colno, error) {
    const errorMsg = `ERRORE GLOBALE:\n${message}\nIn: ${source}:${lineno}`;
    alert(errorMsg);

    const stopPropagation = false;
    return stopPropagation;
};

/**
 * Gestore globale delle Promise rigettate non gestite.
 */
window.onunhandledrejection = function (event) {
    const error = event.reason;

    // Codice 499 indica un'interruzione manuale dell'utente, da ignorare
    if (error && error.code === ERROR_CODE_CANCELLED) {
        return;
    }

    const alertMsg = formatErrorPrefix(error, "ERRORE ASINCRONO (Promise)");

    alert(alertMsg);
};

// ============================================================================
// FUNZIONI DI INIZIALIZZAZIONE
// ============================================================================

/**
 * Apre e inizializza l'applicazione.
 *
 * Configura la UI, carica i dati persistenti e avvia i servizi.
 *
 * @returns {void}
 */
const openAppAsync = async function () {
    try {
        console.info("openAppAsync: avvio inizializzazione...");
        console.info(`openAppAsync: versione ${APP_VERSION}`);

        // 1. Inizializzazione UI e Log
        wnds.init();
        UaLog.setXY(40, 6).setZ(111).new();

        // 2. Inizializzazione Core Applicativo
        await AppMgr.initApp();

        // 3. Caricamento modelli selezionati da IndexedDB
        await AppMgr.loadSelectedModels();

        // 4. Configurazione Componenti Input/Output
        TextInput.init();
        TextInput._inputEl?.focus();

        // 4. Associazione Event Listener e gestione Menu
        bindEventListener();

        const menuBtn = document.querySelector(".menu-btn");
        if (menuBtn) {
            menuBtn.checked = false;
        }

        // 5. Caricamento Stato Precedente
        try {
            await showHtmlThread();
        } catch (e) {
            console.error("openAppAsync: errore caricamento cronologia", e);
            UaLog.log("ERRORE: Impossibile caricare la cronologia precedente.");
        }

        // 6. Caricamento Preferenze Utente
        await getTheme();
        updateActiveModelDisplay();

        // 7. Configurazione Sender Eventi
        UaSender.init({
            workerUrl: WORKER_URL,
            userId: "user"
        });

        // 8. Notifica apertura app
        await UaSender.sendEventAsync("vanillallm", "open");

        console.info("openAppAsync: inizializzazione completata con successo.");

    } catch (error) {
        console.error("openAppAsync: errore fatale durante l'avvio", error);
        UaLog.log("ERRORE FATALE: Controllare la console per i dettagli.");
    }
};

// ============================================================================
// AVVIO
// ============================================================================

// Attende il caricamento completo della pagina prima di avviare l'app
window.addEventListener("load", openAppAsync);