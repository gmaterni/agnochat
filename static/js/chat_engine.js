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
import { createLlmPayload, toTextContent } from "./llmclient/index.js";
import { ConversationMgr, MessageStore } from "./conversation_mgr.js";
import { PromptMgr } from "./prompt_mgr.js";
import { SettingsMgr } from "./settings_mgr.js";
import { getDocuments } from "./uploader.js";
import { formatErrorPrefix } from "./services/error_utils.js";
import { UaLog } from "./services/ualog3.js";

// ============================================================================
// COSTANTI
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const RETRYABLE_STATUS_CODES = [408, 500, 502, 503, 504];
const REQUEST_TIMEOUT_SEC = 90;
const TEMPERATURE = 0.7;
const MAX_TOKENS = 4000;

/** Codice di errore che indica l'interruzione manuale dell'utente. */
const ERROR_CODE_CANCELLED = 499;

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
    const sleepPromise = new Promise(function(resolve) {
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
    return sleepPromise;
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
            messages.push({ role: msg.role, content: toTextContent(msg.content) });
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
        const outcome = null;
        return outcome;
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
// FUNZIONI PRIVATE (supporto a sendMessage)
// ============================================================================

/**
 * Recupera la conversazione attiva, creandola se manca.
 * @param {Array<Object>} documents - Documenti caricati da associare.
 * @returns {Promise<number|null>} Id della conversazione attiva o null.
 */
const _ensureConversationAsync = async function(documents) {
    let conversationId = await SettingsMgr.getActiveConversationId();
    if (!conversationId) {
        const created = await ConversationMgr.create();
        if (created && created.id) {
            conversationId = created.id;
            await SettingsMgr.setActiveConversationId(conversationId);
            await ConversationMgr.saveDocuments(conversationId, documents);
        }
    }
    return conversationId;
};

/**
 * Salva il messaggio utente e imposta il titolo automatico se è il primo.
 * @param {number} conversationId - Id della conversazione attiva.
 * @param {string} question - Domanda dell'utente.
 */
const _saveUserMessageAsync = async function(conversationId, question) {
    await MessageStore.add(conversationId, "user", question);

    // Titolo automatico dalla prima domanda
    const conversation = await ConversationMgr.get(conversationId);
    if (conversation && conversation.title === "Nuova conversazione") {
        const questionShort = question.slice(0, 48);
        const title = question.length > 48 ? `${questionShort}...` : question;
        await ConversationMgr.update(conversationId, { title });
    }
};

/**
 * Carica la cronologia senza l'ultimo messaggio (la domanda corrente).
 * @param {number|null} conversationId - Id della conversazione attiva.
 * @returns {Promise<Array<Object>>}
 */
const _loadHistoryAsync = async function(conversationId) {
    let history = [];
    if (conversationId) {
        const all = await MessageStore.list(conversationId);
        history = all.slice(0, -1);
    }
    return history;
};

/**
 * Registra su UaLog una riga sintetica con dimensioni e tempo della richiesta.
 * In caso di errore evidenzia modello e codice errore.
 * @param {Object} config - Configurazione attiva {provider, model}.
 * @param {Object} rr - Risultato standard {ok, data, error}.
 * @param {number} requestChars - Dimensione in caratteri del payload inviato.
 * @param {string} elapsedSec - Secondi impiegati dalla richiesta.
 */
const _logRequestStats = function(config, rr, requestChars, elapsedSec) {
    const provider = config.provider || "?";
    const model = config.model || "?";
    const target = provider + "/" + model;

    if (rr.ok) {
        const replyText = toTextContent(rr.data);
        const responseChars = replyText.length;
        const line = ">>> " + target + " | req: " + requestChars + " char | resp: " + responseChars + " char | tempo: " + elapsedSec + " s <<<";
        UaLog.log(line);
        return;
    }

    const err = rr.error || {};
    const code = err.code === undefined || err.code === null ? "-" : err.code;
    const errType = err.type || "Error";
    const rawMessage = err.message || "";
    const shortMessage = rawMessage.length > 120 ? rawMessage.slice(0, 120) + "..." : rawMessage;
    const errLine = ">>> ERRORE " + target + " | codice: " + code + " | " + errType + " | " + shortMessage + " | req: " + requestChars + " char | tempo: " + elapsedSec + " s <<<";
    UaLog.log(errLine);
};

/**
 * Persiste l'esito della risposta nella conversazione.
 * @param {number|null} conversationId - Id della conversazione attiva.
 * @param {Object} rr - Risultato standard {ok, data, error}.
 */
const _persistResultAsync = async function(conversationId, rr) {
    if (rr.ok) {
        if (conversationId) {
            const replyText = toTextContent(rr.data || "");
            await MessageStore.add(conversationId, "assistant", replyText);
        }
        return;
    }

    const err = rr.error || {};
    // 499 (annullato): nessun messaggio salvato
    if (err.code !== ERROR_CODE_CANCELLED && conversationId) {
        if (err.type === "TokenLimitError") {
            await MessageStore.add(conversationId, "system", "Input troppo lungo - Superato il limite di token");
        } else {
            const errPrefix = formatErrorPrefix(err, "Errore");
            await MessageStore.add(conversationId, "system", errPrefix);
        }
    }
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
            const output = null;
            return output;
        }
        if (!question || question.trim() === "") {
            console.error("ChatEngine.sendMessage: domanda vuota");
            const output = null;
            return output;
        }

        _busy = true;
        _stopRequested = false;

        try {
            // 1. Configurazione attiva
            const config = LlmProvider.getConfig();
            if (!config.provider || !config.model) {
                console.error("ChatEngine.sendMessage: nessun provider/modello attivo");
                const output = null;
                return output;
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
            const documents = getDocuments();
            const conversationId = await _ensureConversationAsync(documents);

            // 4. Salva il messaggio utente nella conversazione
            if (conversationId) {
                await _saveUserMessageAsync(conversationId, question);
            }

            // 5. Cronologia (senza l'ultimo messaggio: è la domanda corrente)
            const history = await _loadHistoryAsync(conversationId);

            // 6. Prompt di sistema attivo
            const systemPrompt = await PromptMgr.getActive();

            // 7. Composizione payload
            const messages = _composeMessages(history, systemPrompt, question);
            const payload = createLlmPayload(config.model, messages, {
                temperature: TEMPERATURE,
                max_tokens: MAX_TOKENS
            });

            // 8. Invio con retry (misura tempo e dimensione per il log)
            const requestStart = Date.now();
            const requestChars = JSON.stringify(payload).length;
            const rr = await _sendRequest(client, payload);
            const elapsedSec = ((Date.now() - requestStart) / 1000).toFixed(1);
            if (!rr) {
                const result = {
                    ok: false,
                    response: null,
                    data: null,
                    error: { message: "Errore nell'invio della richiesta", type: "SendError", code: null, details: {} }
                };
                return result;
            }

            _logRequestStats(config, rr, requestChars, elapsedSec);

            // 9. Persistenza dell'esito
            await _persistResultAsync(conversationId, rr);

            return rr;
        } finally {
            _busy = false;
            _activeClient = null;
        }
    }
};