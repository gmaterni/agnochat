/**
 * chat_engine.js - Motore di conversazione chat LLM.
 *
 * Orchestratore del flusso di invio: compone il payload con cronologia e
 * system prompt, invia tramite LlmProvider.getClient() con retry, gestisce
 * gli errori standard e salva i messaggi nella conversazione attiva.
 *
 * Nessuna pipeline RAG: solo chat.
 *
 * @module chat_engine
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { LlmProvider } from "./llm_provider.js";
import { createLlmPayload } from "./llmclient/index.js";
import { ConversationMgr, MessageStore } from "./conversation_mgr.js";
import { PromptMgr } from "./prompt_mgr.js";
import { SettingsMgr } from "./settings_mgr.js";
import { getDocuments } from "./uploader.js";

// ============================================================================
// COSTANTI
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const RETRYABLE_STATUS_CODES = [408, 500, 502, 503, 504];
const REQUEST_TIMEOUT_SEC = 90;
const TEMPERATURE = 0.7;
const MAX_TOKENS = 4000;

// ============================================================================
// STATO PRIVATO
// ============================================================================

/** @type {Object|null} Client LLM attivo durante una richiesta. */
let _activeClient = null;

/** @type {boolean} True se una richiesta è in corso. */
let _busy = false;

/** @type {boolean} True se è stato richiesto lo stop durante il backoff. */
let _stopRequested = false;

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

const _cancellableSleep = function(ms) {
    return new Promise(function(resolve) {
        const interval = 100;
        let elapsed = 0;
        const timer = setInterval(function() {
            elapsed += interval;
            if (_stopRequested || elapsed >= ms) {
                clearInterval(timer);
                resolve();
            }
        }, interval);
    });
};

/**
 * Compone i messaggi del payload:
 * system prompt selezionato (se presente) + documenti caricati + cronologia + domanda corrente.
 * @param {Array<Object>} history - Messaggi salvati {role, content}.
 * @param {Object|null} systemPrompt - Prompt di sistema attivo {content}.
 * @param {string} question - Domanda corrente dell'utente.
 * @returns {Array<Object>}
 */
const _composeMessages = function(history, systemPrompt, question) {
    const messages = [];

    if (systemPrompt && systemPrompt.content && systemPrompt.content.trim() !== "") {
        messages.push({ role: "system", content: systemPrompt.content });
    }

    // Inietta i documenti caricati come parte del contesto (prima della cronologia)
    const documents = getDocuments();
    if (documents.length > 0) {
        const docBlocks = documents.map((doc) =>
            "[Contenuto del documento: " + doc.fileName + "]\n" + doc.content + "\n[Fine documento]"
        ).join("\n\n");
        messages.push({
            role: "system",
            content: "=== DOCUMENTI CARICATI ===\n" + docBlocks + "\n=== FINE DOCUMENTI ==="
        });
    }

    for (const msg of history) {
        if (msg.role === "user" || msg.role === "assistant") {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    const formattedQuestion = "# Domanda\n" + question;
    messages.push({ role: "user", content: formattedQuestion });

    return messages;
};

/**
 * Invia la richiesta con retry per gli errori transitori.
 * @param {Object} client - Client LLM attivo.
 * @param {Object} payload - Payload della richiesta.
 * @returns {Promise<Object|null>} Risultato standard o null.
 * @private
 */
const _sendRequest = async function(client, payload) {
    // Fail Fast
    if (!client || !payload) {
        console.error("_sendRequest: client o payload mancanti");
        return null;
    }

    let result = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const rr = await client.sendRequest(payload, REQUEST_TIMEOUT_SEC);

        if (!rr || rr.ok) {
            result = rr;
            break;
        }

        const err = rr.error;
        const errCode = err ? err.code : null;
        console.error(`_sendRequest (Attempt ${attempt}/${MAX_RETRIES}):`, err);

        const isRetryable = RETRYABLE_STATUS_CODES.includes(errCode);

        if (isRetryable && attempt < MAX_RETRIES) {
            console.warn(`Errore transitorio ${errCode}. Riprovo... (${attempt}/${MAX_RETRIES})`);
            await _cancellableSleep(RETRY_DELAY_MS);
        } else {
            result = rr;
            break;
        }
    }

    return result;
};

// ============================================================================
// API PUBBLICA
// ============================================================================

export const ChatEngine = {

    /**
     * True se una richiesta è in corso.
     * @returns {boolean}
     */
    isBusy: function() {
        return _busy;
    },

    /**
     * Interrompe la richiesta in corso (codice 499).
     * @returns {void}
     */
    stop: function() {
        _stopRequested = true;
        if (_activeClient) {
            _activeClient.cancelRequest();
            _activeClient = null;
        }
    },

    /**
     * Invia un messaggio utente al provider attivo.
     *
     * @param {string} question - Testo della domanda dell'utente.
     * @returns {Promise<Object|null>} Risultato { ok, data, error } o null.
     */
    sendMessage: async function(question) {
        if (_busy) {
            console.warn("ChatEngine.sendMessage: richiesta già in corso");
            return null;
        }
        if (!question || question.trim() === "") {
            console.error("ChatEngine.sendMessage: domanda vuota");
            return null;
        }

        _busy = true;
        _stopRequested = false;

        try {
            // 1. Configurazione attiva
            const config = LlmProvider.getConfig();
            if (!config.provider || !config.model) {
                console.error("ChatEngine.sendMessage: nessun provider/modello attivo");
                return null;
            }

            // 2. Client LLM (null se manca la chiave)
            const client = await LlmProvider.getClient();
            if (!client) {
                const result = {
                    ok: false,
                    response: null,
                    data: null,
                    error: { message: `Chiave API mancante per ${config.provider}`, type: "MissingKeyError", code: null, details: {} }
                };
                return result;
            }
            _activeClient = client;

            // 3. Conversazione attiva (crea se manca)
            let conversationId = await SettingsMgr.getActiveConversationId();
            if (!conversationId) {
                const created = await ConversationMgr.create();
                if (created && created.id) {
                    conversationId = created.id;
                    await SettingsMgr.setActiveConversationId(conversationId);
                    await ConversationMgr.saveDocuments(conversationId, getDocuments());
                }
            }

            // 4. Salva il messaggio utente nella conversazione
            if (conversationId) {
                await MessageStore.add(conversationId, "user", question);

                // Titolo automatico dalla prima domanda
                const conversation = await ConversationMgr.get(conversationId);
                if (conversation && conversation.title === "Nuova conversazione") {
                    const title = question.length > 48 ? `${question.slice(0, 48)}...` : question;
                    await ConversationMgr.update(conversationId, { title });
                }
            }

            // 5. Cronologia (senza l'ultimo messaggio: è la domanda corrente)
            let history = [];
            if (conversationId) {
                const all = await MessageStore.list(conversationId);
                history = all.slice(0, -1);
            }

            // 6. Prompt di sistema attivo
            const systemPrompt = await PromptMgr.getActive();

            // 7. Composizione payload
            const messages = _composeMessages(history, systemPrompt, question);
            const payload = createLlmPayload(config.model, messages, {
                temperature: TEMPERATURE,
                max_tokens: MAX_TOKENS
            });

            // 8. Invio con retry
            const rr = await _sendRequest(client, payload);
            if (!rr) {
                const result = {
                    ok: false,
                    response: null,
                    data: null,
                    error: { message: "Errore nell'invio della richiesta", type: "SendError", code: null, details: {} }
                };
                return result;
            }

            // 9. Gestione esiti
            if (rr.ok) {
                if (conversationId) {
                    await MessageStore.add(conversationId, "assistant", rr.data || "");
                }
            } else {
                const err = rr.error || {};
                // 499 (annullato): nessun messaggio salvato
                if (err.code !== 499 && conversationId) {
                    if (err.type === "TokenLimitError") {
                        await MessageStore.add(conversationId, "system", "Input troppo lungo - Superato il limite di token");
                    } else {
                        const codePrefix = err.code ? `[${err.code}] ` : "";
                        await MessageStore.add(conversationId, "system", `Errore: ${codePrefix}${err.message || "Errore sconosciuto"}`);
                    }
                }
            }

            return rr;
        } finally {
            _busy = false;
            _activeClient = null;
        }
    }
};