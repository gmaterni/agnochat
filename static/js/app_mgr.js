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
import { llmDb } from "./llm/llm-db.js";

// Istanza singleton del database LLM
let _llmDb = null;

export const getLlmDb = function() {
    return _llmDb;
};

// ============================================================================
// API PUBBLICA
// ============================================================================

export const AppMgr = {

    /**
     * Inizializza l'applicazione.
     */
    initApp: async function() {
        _llmDb = llmDb;
        await _llmDb.init();

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
            // Caso normale: nessun modello configurato finché l'utente non
            // esegue "Reset LLM" o "Aggiorna LLM". Non è un errore.
            console.info("AppMgr.initConfig: nessuna configurazione LLM attiva (esegui Reset LLM o Aggiorna LLM).");
            return;
        }

        console.info("AppMgr.initConfig: configurazione caricata.");
        const providerMsg = "Provider: " + config.provider + " | Model: " + config.model;
        console.info(providerMsg);
        const windowMsg = "Window: " + config.windowSize + "k";
        console.info(windowMsg);
    },

    /**
     * Carica i modelli selezionati dal database e applica il filtro al provider.
     */
    loadSelectedModels: async function() {
        if (!_llmDb) return;

        const selected = await _llmDb.getSelected();
        if (selected && selected.length > 0) {
            LlmProvider.ensureSelectedModels(selected);
            LlmProvider.applySelectionFilter(selected);
        }
        // Se nessuna selezione salvata: NON leggere i .txt.
        // L'albero rimane vuoto finché l'utente non fa "Aggiorna LLM" o "Reset LLM".

        // Riapplica la configurazione salvata ora che il catalogo è popolato:
        // all'avvio loadConfig() girava con catalogo vuoto, la validazione
        // falliva e la selezione utente veniva sostituita dal default
        // (primo modello del primo provider).
        await LlmProvider.loadConfig();
        LlmProvider.validateActive();
    }
};