/**
 * fetcher_siliconflow.js - Fetcher modelli SiliconFlow (porting di models_siliconflow.py).
 *
 * Recupera i modelli SiliconFlow dall'endpoint OpenAI-compatibile e applica la
 * medesima logica di filtraggio (solo text/chat) e normalizzazione dello script Python.
 *
 * @module fetcher_siliconflow
 */

"use strict";

import { ModelFetcher } from "./fetcher.js";

const API_URL = "https://api.siliconflow.com/v1/models";

/**
 * Parole chiave che escludono i modelli non testuali.
 * @type {string[]}
 */
const EXCLUDE_KEYWORDS = [
    "embedding", "reranker", "image", "video", "audio", "speech",
    "tts", "flux", "wan-", "wan2", "wan2.2", "fish-speech",
    "cosyvoice", "index-tts", "-img-", "-edit", "-vl-", "-vision"
];

/**
 * Verifica se il modello è un text/chat model (porting di is_text_chat_model).
 * @param {string} modelId
 * @returns {boolean}
 */
const isTextChatModel = function(modelId) {
    const lower = (modelId || "").toLowerCase();
    for (const kw of EXCLUDE_KEYWORDS) {
        if (lower.includes(kw)) {
            return false;
        }
    }
    return true;
};

/**
 * Stima la finestra di contesto in base al nome (porting di get_context_window).
 * @param {string} modelId
 * @returns {number}
 */
const getContextWindow = function(modelId) {
    const lower = (modelId || "").toLowerCase();

    if (lower.includes("gemini-2.5") || lower.includes("gemini-3")) {
        return 1048576;
    }
    if (lower.includes("gemma-4-31b") || lower.includes("gemma-4-26b")) {
        return 262144;
    }
    if (lower.includes("llama-3.1") || lower.includes("llama-3.3")) {
        return 131072;
    }
    if (lower.includes("qwen2.5") || lower.includes("qwen-2.5")) {
        return 131072;
    }
    if (lower.includes("deepseek-v2") || lower.includes("deepseek-v3")) {
        return 131072;
    }
    if (lower.includes("yi-1.5")) {
        return 131072;
    }
    if (lower.includes("llama3") || lower.includes("llama-3")) {
        return 8192;
    }
    if (lower.includes("qwen")) {
        return 32768;
    }
    if (lower.includes("mistral") || lower.includes("mixtral")) {
        return 32768;
    }
    if (lower.includes("deepseek")) {
        return 4096;
    }
    if (lower.includes("glm") || lower.includes("chatglm")) {
        return 128000;
    }
    if (lower.includes("internlm")) {
        return 32768;
    }
    if (lower.includes("baichuan")) {
        return 32768;
    }
    if (lower.includes("yi")) {
        return 32768;
    }
    if (lower.includes("phi")) {
        return 128000;
    }
    if (lower.includes("starcoder")) {
        return 16384;
    }
    if (lower.includes("codestral")) {
        return 32768;
    }
    return 8192;
};

/**
 * Recupera e filtra i modelli SiliconFlow.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, contextWindow: number}>>}
 */
export const fetchSiliconFlowModels = async function(apiKey) {
    const response = await fetch(API_URL, {
        headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        throw new Error(`SiliconFlow: HTTP ${response.status}`);
    }
    const data = await response.json();
    const models = (data.data || []).map(function(m) {
        return {
            id: m.id || "",
            raw: m
        };
    });

    const fetcher = new ModelFetcher("siliconflow");
    const filtered = fetcher.filterAndSortModels(models, function(m) {
        return isTextChatModel(m.id);
    });

    return filtered.map(function(m) {
        return {
            id: m.id,
            contextWindow: getContextWindow(m.id)
        };
    });
};
