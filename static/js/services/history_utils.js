/**
 * history_utils.js - Utility per la formattazione della cronologia conversazioni.
 *
 * Fornisce funzioni per convertire array di messaggi in HTML o testo puro,
 * integrando la libreria marked.js per il parsing markdown.
 *
 * @module  services/history_utils
 * @version 1.1.0
 * @date    2026-05-10
 * @author  Gemini CLI
 */

"use strict";

import { toTextContent } from "../llmclient/models.js";

// ============================================================================
// COSTANTI DI MODULO
// ============================================================================

/** Ruoli dei messaggi nel formato standard OpenAI. */
export const ROLE_USER = "user";
export const ROLE_ASSISTANT = "assistant";
export const ROLE_SYSTEM = "system";

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

/**
 * Controlla se un oggetto messaggio è valido.
 * 
 * @param {*} msg - Oggetto da validare.
 * @returns {boolean} True se il messaggio è conforme allo schema.
 */
const _isValidMessage = function(msg) {
    if (typeof msg !== "object" || msg === null) {
        console.error("_isValidMessage: input non è un oggetto valido");
        const valid = false;
        return valid;
    }

    const hasRole = "role" in msg;
    const hasContent = "content" in msg;
    const isValid = hasRole && hasContent;

    if (!isValid) {
        console.error("_isValidMessage: messaggio malformato", msg);
    }

    return isValid;
};

/**
 * Normalizza il contenuto di un messaggio.
 * Preserva i doppi ritorni a capo per mantenere la struttura dei paragrafi Markdown,
 * ma rimuove accumuli eccessivi (oltre 2).
 * 
 * @param {string} content - Testo da normalizzare.
 * @returns {string} Testo pulito.
 */
const _normalizeContent = function(content) {
    // Fail Fast
    if (typeof content !== "string") {
        const empty = "";
        return empty;
    }

    // Sostituisce 3 o più ritorni a capo con esattamente 2
    const normalized = content.replace(/\n{3,}/g, "\n\n");
    const result = normalized.trim();

    return result;
};

/**
 * Pulisce la risposta dell'LLM rimuovendo preamboli comuni e chiacchiere.
 * Accetta anche contenuti non testuali (es. risposte con tool_calls salvate
 * come oggetti): vengono convertiti in testo prima della pulizia.
 *
 * @param {*} text - Risposta grezza dell'LLM (stringa o oggetto).
 * @returns {string} Testo pulito.
 */
export const cleanLlmResponse = function(text) {
    const inputText = toTextContent(text);
    if (!inputText) {
        const empty = "";
        return empty;
    }

    let cleaned = inputText.trim();

    // Rimuove preamboli comuni (case insensitive)
    const preambles = [
        /^Certamente!?\s*/i,
        /^Ecco (la risposta|quanto richiesto|le informazioni):\s*/i,
        /^Sicuro,?\s*/i,
        /^Sulla base del contesto fornito,?\s*/i,
        /^In base ai documenti,?\s*/i,
    ];

    for (const regex of preambles) {
        cleaned = cleaned.replace(regex, "");
    }

    // Rimuove eventuali chiacchiere finali
    const epilogues = [
        /\s*Spero che questo aiuti\.?$/i,
        /\s*Fammi sapere se hai altre domande\.?$/i,
        /\s*Resto a disposizione per chiarimenti\.?$/i
    ];

    for (const regex of epilogues) {
        cleaned = cleaned.replace(regex, "");
    }

    const result = cleaned.trim();
    return result;
};

/**
 * Converte il testo Markdown in HTML usando la libreria marked.js.
 * 
 * @param {string} text - Testo in input in formato Markdown.
 * @returns {string} HTML generato.
 */
const _parseMarkdown = function(text) {
    // Fail Fast
    if (!text) {
        const empty = "";
        return empty;
    }

    let result = "";

    try {
        // Configurazione per marked: breaks: true per gestire i singoli ritorni a capo
        const markedOptions = { 
            breaks: true 
        };
        result = marked.parse(text, markedOptions);
    } catch (e) {
        console.error("_parseMarkdown: errore nel parsing markdown", e);
        result = text; // Fallback al testo originale in caso di errore
    }

    // Return Strict
    return result;
};

/**
 * Formatta un messaggio per la visualizzazione HTML.
 * 
 * @param {string}  role    - Ruolo del messaggio (user, assistant, system).
 * @param {string}  content - Contenuto testuale.
 * @returns {string} HTML del messaggio formattato.
 */
const _formatMessageHtml = function(role, content) {
    // Fail Fast
    if (!role || content === undefined) {
        console.error("_formatMessageHtml: parametri mancanti");
        const errorHtml = "<div>ERROR: Missing Params</div>";
        return errorHtml;
    }

    let html = "";
    const formattedContent = _parseMarkdown(content);

    if (role === ROLE_ASSISTANT) {
        html = `<div class="assistant"><b>Assistant:</b><div class="msg-content">${formattedContent}</div></div>`;
    } else if (role === ROLE_USER) {
        html = `<div class="user"><b>User:</b><div class="msg-content">${formattedContent}</div></div>`;
    } else if (role === ROLE_SYSTEM) {
        html = `<div class="system"><b>System:</b><div class="msg-content">${formattedContent}</div></div>`;
    } else {
        console.error(`_formatMessageHtml: ruolo non riconosciuto (${role})`);
        html = `<div class="error">ERROR: Unknown role ${role}</div>`;
    }

    // Return Strict
    return html;
};

// ============================================================================
// API PUBBLICA
// ============================================================================

/**
 * Escapa i caratteri HTML speciali in una stringa.
 * Previeni XSS quando i contenuti utente vengono inseriti nel DOM.
 *
 * @param {string} text - Testo da escapare.
 * @returns {string} Testo con i caratteri HTML escapati.
 */
export const escapeHtml = function(text) {
    if (!text) {
        const empty = "";
        return empty;
    }

    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    return escaped;
};

/**
 * Converte un array di messaggi in HTML per la cronologia.
 * 
 * @param {Array} history - Elenco di messaggi {role, content}.
 * @returns {string} Stringa HTML pronta per il DOM.
 */
export const messages2html = function(history) {
    // Fail Fast
    if (!history || !Array.isArray(history)) {
        const empty = "";
        return empty;
    }

    const htmlParts = [];

    // Processamento messaggi
    for (let i = 0; i < history.length; i++) {
        const msg = history[i];

        if (_isValidMessage(msg)) {
            const role = msg.role;
            let rawContent = msg.content;
            
            // Pulisce le risposte dell'assistente
            if (role === ROLE_ASSISTANT) {
                rawContent = cleanLlmResponse(rawContent);
            }

            const content = _normalizeContent(rawContent);

            const partHtml = _formatMessageHtml(role, content);
            htmlParts.push(partHtml);
        }
    }

    const result = htmlParts.join("\n");

    // Return Strict
    return result;
};

/**
 * Formatta una stringa di testo puro aggiungendo indentazione e separatori.
 * 
 * @param {string} txt - Testo da formattare.
 * @returns {string} Testo formattato.
 */
export const textFormatter = function(txt) {
    // Fail Fast
    if (!txt) {
        const empty = "";
        return empty;
    }

    // Pulizia HTML (se presente)
    const plainText = txt.replace(/<[^>]*>/g, "");

    // Divisione in frasi per aggiungere indentazione
    const sentences = plainText.split(/([.!?:])(?=\s|$)/);
    const formattedSentences = [];

    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i];
        const delimiter = sentences[i + 1] || "";
        const trimmedSentence = sentence.trim();

        if (trimmedSentence.length > 0) {
            const entry = `  ${trimmedSentence}${delimiter}`;
            formattedSentences.push(entry);
        }
    }

    const baseFormatted = formattedSentences.join("\n");

    // Sostituzione identificatori User/Assistant con intestazioni chiare
    const withUser = baseFormatted.replace(/User:/g, "\n\nUSER:\n");
    const withAssistant = withUser.replace(/Assistant:/g, "\n\nASSISTANT:\n");
    const result = withAssistant.trim();

    // Return Strict
    return result;
};
