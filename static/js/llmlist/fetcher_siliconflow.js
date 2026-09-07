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
            const result = false;
            return result;
        }
    }
    const result = true;
    return result;
};

/**
 * Stima la finestra di contesto in base al nome (porting di get_context_window).
 * @param {string} modelId
 * @returns {number}
 */
const getContextWindow = function(modelId) {
    const lower = (modelId || "").toLowerCase();

    let result = 8192;

    if (lower.includes("gemini-2.5") || lower.includes("gemini-3")) {
        result = 1048576;
    } else if (lower.includes("gemma-4-31b") || lower.includes("gemma-4-26b")) {
        result = 262144;
    } else if (lower.includes("llama-3.1") || lower.includes("llama-3.3")) {
        result = 131072;
    } else if (lower.includes("qwen2.5") || lower.includes("qwen-2.5")) {
        result = 131072;
    } else if (lower.includes("deepseek-v2") || lower.includes("deepseek-v3")) {
        result = 131072;
    } else if (lower.includes("yi-1.5")) {
        result = 131072;
    } else if (lower.includes("llama3") || lower.includes("llama-3")) {
        result = 8192;
    } else if (lower.includes("qwen")) {
        result = 32768;
    } else if (lower.includes("mistral") || lower.includes("mixtral")) {
        result = 32768;
    } else if (lower.includes("deepseek")) {
        result = 4096;
    } else if (lower.includes("glm") || lower.includes("chatglm")) {
        result = 128000;
    } else if (lower.includes("internlm")) {
        result = 32768;
    } else if (lower.includes("baichuan")) {
        result = 32768;
    } else if (lower.includes("yi")) {
        result = 32768;
    } else if (lower.includes("phi")) {
        result = 128000;
    } else if (lower.includes("starcoder")) {
        result = 16384;
    } else if (lower.includes("codestral")) {
        result = 32768;
    }

    return result;
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
    const models = (data.data || []).map(m => ({
        id: m.id || "",
        raw: m
    }));

    const fetcher = new ModelFetcher("siliconflow");
    const filtered = fetcher.filterAndSortModels(models, m => isTextChatModel(m.id));

    const mapped = filtered.map(m => ({
        id: m.id,
        contextWindow: getContextWindow(m.id)
    }));
    return mapped;
};
