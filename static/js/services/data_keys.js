/**
 * data_keys.js - Chiavi di storage centralizzate
 * Definisce le chiavi di storage usate nell'applicazione
 * per garantire consistenza e manutenibilità.
 */
"use strict";

// ============================================================================
// COSTANTI PUBBLICHE
// ============================================================================

/**
 * Oggetto contenente tutte le chiavi di storage usate da vanillallm.
 */
export const DATA_KEYS = {
    /**
     * Preferenza tema UI (light/dark)
     */
    KEY_THEME: "theme",

    /**
     * Configurazione provider LLM selezionato
     */
    KEY_PROVIDER: "llm_provider",

    /**
     * Chiavi API per vari provider
     */
    KEY_API_KEYS: "api_keys",

    /**
     * ID della conversazione attiva
     */
    KEY_ACTIVE_CONVERSATION_ID: "active_conversation_id",

    /**
     * ID del prompt di sistema attivo
     */
    KEY_ACTIVE_PROMPT_ID: "active_prompt_id"
};
