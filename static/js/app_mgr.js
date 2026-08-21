/**
 * app_mgr.js - Gestore configurazione applicazione.
 * Inizializza e gestisce la configurazione del provider LLM.
 *
 * @module app_mgr
 * @version 1.0.0
 * @date 2026-08-20
 */
"use strict";

import { LlmProvider } from "./llm_provider.js";

// ============================================================================
// API PUBBLICA
// ============================================================================

export const AppMgr = {

    /**
     * Inizializza l'applicazione.
     */
    initApp: async function() {
        await LlmProvider.init();
        await AppMgr.initConfig();
    },

    /**
     * Inizializza la configurazione LLM.
     * Viene eseguita ogni volta senza cache: carica la configurazione corrente
     * da LlmProvider (provider, modello e finestra di contesto).
     */
    initConfig: async function() {
        await LlmProvider.loadConfig();

        const config = LlmProvider.getConfig();
        if (!config || !config.windowSize) {
            console.error("AppMgr.initConfig: configurazione LLM mancante o non valida");
            return;
        }

        console.info("AppMgr.initConfig: configurazione caricata.");
        console.info(`Provider: ${config.provider} | Model: ${config.model}`);
        console.info(`Window: ${config.windowSize}k`);
    }
};