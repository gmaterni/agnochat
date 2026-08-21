/**
 * app_ui.js - Interfaccia utente e gestione comandi.
 *
 * Gestisce l'interazione con il DOM, la creazione di finestre fluttuanti,
 * il sistema di comandi e l'aggiornamento dinamico della UI.
 * Adattato da ragindex: nessuna pipeline RAG, solo chat.
 *
 * @module  app_ui
 * @version 1.0.0
 * @date    2026-08-20
 */

"use strict";

import { UaWindowAdm } from "./services/uawindow.js";
import { UaJtfh } from "./services/uajtfh.js";
import { UaLog } from "./services/ualog3.js";
import { help0_html } from "./services/help.js";
import { UaDb } from "./services/uadb.js";
import { DATA_KEYS } from "./services/data_keys.js";
import { idbMgr } from "./services/idb_mgr.js";
import { LlmProvider, getProviderConfig } from "./llm_provider.js";
import { textFormatter, messages2html } from "./services/history_utils.js";
import { ConversationMgr, MessageStore } from "./conversation_mgr.js";
import { PromptMgr } from "./prompt_mgr.js";
import { SettingsMgr } from "./settings_mgr.js";
import { ChatEngine } from "./chat_engine.js";
import { addApiKey, getApiKey, restoreDefaultApiKeys } from "./services/key_retriever.js";
import { LlmUpdater } from "./llm_updater.js";
import { UaSender } from "./services/sender.js";

import "./services/uadialog.js";

// ============================================================================
// COSTANTI DI MODULO
// ============================================================================

const CSS_SPINNER_BG = "spinner-bg";
const CSS_SHOW_SPINNER = "show-spinner";
const CSS_MENU_OPEN = "menu-open";

// ============================================================================
// COMPONENTE SPINNER
// ============================================================================

/**
 * Gestore dell'indicatore di caricamento (Spinner).
 * Utilizza una closure per incapsulare la logica.
 */
const _Spinner = (function () {
  /**
   * Recupera gli elementi DOM necessari.
   * @returns {Object} Elementi outputArea, spinner e content.
   */
  const _getElements = function () {
    const els = {
      outputArea: document.querySelector("#id-text-out .div-text"),
      spinner: document.getElementById("spinner"),
      spinnerContent: document.querySelector("#spinner .spinner-content"),
    };
    return els;
  };

  /**
   * Interrompe le operazioni in corso dopo conferma.
   * @param {Event} event - L'evento click.
   */
  const stopAsync = async function (event) {
    if (event) {
      event.stopPropagation();
    }
    const confirmed = await confirm("Confermi lo STOP?");
    if (confirmed) {
      ChatEngine.stop();
      hide();
    }
  };

  /**
   * Mostra lo spinner.
   */
  const show = function () {
    const { outputArea, spinner, spinnerContent } = _getElements();

    if (outputArea) {
      outputArea.classList.add(CSS_SPINNER_BG);
    }

    if (spinner) {
      spinner.classList.add(CSS_SHOW_SPINNER);
    }

    if (spinnerContent) {
      spinnerContent.addEventListener("click", stopAsync);
    }
  };

  /**
   * Nasconde lo spinner.
   */
  const hide = function () {
    const { outputArea, spinner, spinnerContent } = _getElements();

    if (outputArea) {
      outputArea.classList.remove(CSS_SPINNER_BG);
    }

    if (spinner) {
      spinner.classList.remove(CSS_SHOW_SPINNER);
    }

    if (spinnerContent) {
      spinnerContent.removeEventListener("click", stopAsync);
    }
  };

  return {
    show: show,
    hide: hide,
  };
})();

// ============================================================================
// COMPONENTE SPINNER WAIT (con STOP, per procedure interrompibili)
// ============================================================================

/**
 * Interrompe la procedura di aggiornamento LLM dopo conferma.
 * @param {Event} event - L'evento click.
 */
const _stopLlmUpdateAsync = async function(event) {
    if (event) {
        event.stopPropagation();
    }
    const confirmed = await confirm("Confermi lo STOP della procedura di aggiornamento LLM?");
    if (confirmed) {
        LlmUpdater.cancelUpdate();
    }
};

/**
 * Mostra l'overlay di attesa "spinner-wait" (con pulsante STOP).
 */
const _showWaitSpinner = function() {
    const outputArea = document.querySelector("#id-text-out .div-text");
    if (outputArea) {
        outputArea.classList.add(CSS_SPINNER_BG);
    }
    const wait = document.getElementById("spinner-wait");
    if (wait) {
        wait.classList.add(CSS_SHOW_SPINNER);
        const content = wait.querySelector(".spinner-content");
        if (content) {
            content.addEventListener("click", _stopLlmUpdateAsync);
        }
    }
};

/**
 * Nasconde l'overlay di attesa "spinner-wait".
 */
const _hideWaitSpinner = function() {
    const outputArea = document.querySelector("#id-text-out .div-text");
    if (outputArea) {
        outputArea.classList.remove(CSS_SPINNER_BG);
    }
    const wait = document.getElementById("spinner-wait");
    if (wait) {
        wait.classList.remove(CSS_SHOW_SPINNER);
        const content = wait.querySelector(".spinner-content");
        if (content) {
            content.removeEventListener("click", _stopLlmUpdateAsync);
        }
    }
};

// ============================================================================
// FACTORY FINESTRE
// ============================================================================

/**
 * Factory base per finestre con pulsante copia e chiusura.
 */
const _UaWindowFactory = function(id, contentClass, copyMethodName, showCopy = true) {
    const _win = UaWindowAdm.create(id);

    const close = function() {
        _win.close();
    };

    const copyAsync = async function() {
        const selector = `.${contentClass}`;
        const element = _win.getElement().querySelector(selector);

        if (!element) return;

        const text = element.textContent;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error(`_UaWindowFactory.copyAsync (${id}):`, err);
        }
    };

    const show = function(content, delAll = true) {
        if (delAll) wnds.closeAll();

        _win.drag().setZ(12);

        const isMenuOpen = document.body.classList.contains(CSS_MENU_OPEN);
        const xPos = isMenuOpen ? 22 : 2;
        _win.vw_vh().setXY(xPos, 6, 1);

        const copyBtnHtml = showCopy ? `
                    <button class="btn-copy wcp tt-left" data-tt="Copia" onclick="wnds.${copyMethodName}.copy()">
                        <svg class="icon copy-icon" viewBox="0 0 24 24">
                            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path>
                        </svg>
                    </button>
                    <button class="btn-close wcl tt-left" data-tt="Chiudi" onclick="wnds.${copyMethodName}.close()">X</button>
                    ` : `
                    <button class="btn-copy wcl tt-left" data-tt="Chiudi" onclick="wnds.${copyMethodName}.close()">
                        <svg class="icon close-icon-yellow" viewBox="0 0 24 24">
                            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                        </svg>
                    </button>
                    `;
        const contentTag = contentClass === "pre-text" ? "pre" : "div";

        const html = `
            <div class="window-text">
                <div class="btn-wrapper">
                    ${copyBtnHtml}
                </div>
                <${contentTag} class="${contentClass}">${content}</${contentTag}>
            </div>
        `;

        _win.setHtml(html);
        _win.show();
    };

    const api = { show, close, copy: copyAsync };
    return api;
};

/**
 * Factory specifica per finestre informative (Info).
 */
const _UaWindowInfoFactory = function(id) {
    const _win = UaWindowAdm.create(id);

    const close = function() {
        _win.close();
    };

    const show = function(content, delAll = true) {
        if (delAll) wnds.closeAll();

        _win.drag().setZ(11);

        const isMenuOpen = document.body.classList.contains(CSS_MENU_OPEN);
        const xPos = isMenuOpen ? 22 : 2;
        _win.vw_vh().setXY(xPos, 6, -1);

        const innerContent = typeof content === "string" ? `<div>${content}</div>` : (content.innerHTML || content);

        const html = `
            <div class="window-info">
                <div class="btn-wrapper">
                    <button class="btn-close tt-left" data-tt="Chiudi" onclick="wnds.winfo.close()">X</button>
                </div>
                <div class="div-info">${innerContent}</div>
            </div>
        `;

        _win.setHtml(html);
        _win.show();
    };

    const showPre = function(text) {
        const content = `<pre class="pre-text">${text}</pre>`;
        show(content);
    };

    const getElement = function() {
        const el = _win.getElement();
        return el;
    };

    const api = { show, showe: showPre, close, getElement };
    return api;
};

// ============================================================================
// COMPONENTE HELP POPUP (Tooltip Personalizzati)
// ============================================================================

const HelpPopup = (function() {
    let _popupEl = null;
    let _hideTimer = null;

    const _createPopup = function() {
        if (_popupEl) return;
        _popupEl = document.createElement("div");
        _popupEl.className = "help-popup-window";
        _popupEl.style.display = "none";
        document.body.appendChild(_popupEl);
    };

    const show = function(event, text) {
        _createPopup();
        if (_hideTimer) {
            clearTimeout(_hideTimer);
            _hideTimer = null;
        }
        _popupEl.innerHTML = text;
        _popupEl.classList.remove("visible");
        _popupEl.style.display = "block";

        const el = event.currentTarget;
        const rect = el.getBoundingClientRect();
        const pWidth = _popupEl.offsetWidth;
        const pHeight = _popupEl.offsetHeight;

        let top, left;
        const isMenu = el.closest(".menu-box");

        if (isMenu) {
            const menuBox = document.querySelector(".menu-box");
            const menuRect = menuBox.getBoundingClientRect();
            left = menuRect.right + 8;
            top = rect.top + (rect.height / 2) - (pHeight / 2);
        } else {
            top = rect.top - pHeight - 12;
            left = rect.left + (rect.width / 2) - (pWidth / 2);

            if (top < 10 || el.closest(".head-wrapper")) {
                top = rect.bottom + 12;
            }
        }

        if (left < 10) left = 10;
        if (left + pWidth > window.innerWidth - 10) {
            left = window.innerWidth - pWidth - 10;
        }

        if (top + pHeight > window.innerHeight - 10) {
            top = rect.top - pHeight - 12;
        }
        if (top < 10) top = 10;

        _popupEl.style.top = `${top}px`;
        _popupEl.style.left = `${left}px`;

        void _popupEl.offsetWidth;
        _popupEl.classList.add("visible");
    };

    const hide = function() {
        if (_hideTimer) return;
        _hideTimer = setTimeout(function() {
            if (_popupEl) {
                _popupEl.classList.remove("visible");
                setTimeout(function() {
                    _popupEl.style.display = "none";
                }, 200);
            }
            _hideTimer = null;
        }, 300);
    };

    const bind = function(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.removeAttribute("data-tt");
        el.removeAttribute("title");
        const classesToRemove = Array.from(el.classList).filter(c => c.startsWith("tt-"));
        classesToRemove.forEach(c => el.classList.remove(c));
        const trigger = el.closest("li") || el;
        trigger.addEventListener("mouseenter", (e) => show(e, text));
        trigger.addEventListener("mouseleave", hide);
        trigger.addEventListener("click", hide);
    };

    const api = { bind };
    return api;
})();

// ============================================================================
// HELPER PRIVATI
// ============================================================================

const _setResponseHtml = function(html) {
    const outputContainer = document.querySelector("#id-text-out .div-text");
    if (!outputContainer) return;
    outputContainer.innerHTML = html;
    outputContainer.scrollTo({ top: outputContainer.scrollHeight, behavior: "smooth" });
};

const _updateThemeAsync = async function(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("theme-light", isLight);
    document.body.classList.toggle("theme-dark", !isLight);

    const btn = document.getElementById("btn-theme-toggle");
    if (btn) {
        const sunIcon = btn.querySelector(".icon-sun");
        const moonIcon = btn.querySelector(".icon-moon");
        if (sunIcon && moonIcon) {
            sunIcon.style.display = isLight ? "none" : "block";
            moonIcon.style.display = isLight ? "block" : "none";
        }
        btn.setAttribute("data-tt", isLight ? "Tema Scuro" : "Tema Chiaro");
    }

    await SettingsMgr.setTheme(theme);
};

const toggleThemeAsync = async function() {
    const currentTheme = document.body.classList.contains("theme-light") ? "light" : "dark";
    const newTheme = currentTheme === "light" ? "dark" : "light";
    await _updateThemeAsync(newTheme);
};

// ============================================================================
// GESTORI AZIONI MENU (Privati)
// ============================================================================

/**
 * Crea una nuova conversazione vuota e la attiva.
 */
const _actionNewConversationAsync = async function() {
    if (!await confirm("Creare una nuova conversazione? La conversazione attiva resterà salvata.")) return;
    const created = await ConversationMgr.create();
    if (!created || !created.id) return;
    await SettingsMgr.setActiveConversationId(created.id);

    // Notifica avvio conversazione al worker di analytics
    await UaSender.sendEventAsync("vanillallm", "startConversation");

    _setResponseHtml("");
    UaLog.log(">>> Nuova conversazione creata. <<<");
};

/**
 * Mostra la finestra di gestione conversazioni (elenco, attiva, elimina).
 */
const _actionListConversationsAsync = async function() {
    const jfh = UaJtfh();
    const list = await ConversationMgr.list();
    const activeId = await SettingsMgr.getActiveConversationId();

    jfh.append('<div class="data-dialog"><h4>Gestione Conversazioni</h4>');

    if (list.length === 0) {
        jfh.append('<p>Nessuna conversazione salvata.</p>');
    } else {
        jfh.append('<table class="table-data"><thead><tr><th>Titolo</th><th>Aggiornata</th><th>Azioni</th></tr></thead><tbody>');
        list.forEach(function(c) {
            const isActive = c.id === activeId;
            const activeMark = isActive ? ' <span class="status-presente">(attiva)</span>' : "";
            const date = new Date(c.updatedAt).toLocaleString("it-IT");
            jfh.append('<tr>');
            jfh.append(`<td>${c.title || "Senza titolo"}${activeMark}</td>`);
            jfh.append(`<td>${date}</td>`);
            jfh.append('<td>');
            jfh.append(`<button class="btn-success" onclick="wnds.selectConversation(${c.id})">Attiva</button>`);
            jfh.append(`<button class="btn-danger btn-ml5" onclick="wnds.deleteConversation(${c.id})">Elimina</button>`);
            jfh.append('</td></tr>');
        });
        jfh.append('</tbody></table>');
    }

    jfh.append('</div>');

    wnds.selectConversation = async function(id) {
        await SettingsMgr.setActiveConversationId(id);
        await showHtmlThread();
        wnds.winfo.close();
        UaLog.log(">>> Conversazione selezionata. <<<");
    };

    wnds.deleteConversation = async function(id) {
        const conv = await ConversationMgr.get(id);
        const name = conv && conv.title ? conv.title : "Senza titolo";
        if (!await confirm(`Eliminare la conversazione "${name}" e tutti i suoi messaggi?`)) return;
        await ConversationMgr.delete(id);
        const currentActiveId = await SettingsMgr.getActiveConversationId();
        if (currentActiveId === id) {
            await SettingsMgr.setActiveConversationId(null);
            _setResponseHtml("");
        }
        wnds.winfo.close();
        await _actionListConversationsAsync();
        UaLog.log(">>> Conversazione eliminata. <<<");
    };

    wnds.winfo.show(jfh.html());
};

/**
 * Mostra l'editor di un prompt di sistema (creazione o modifica).
 * @param {Object|null} prompt - Prompt da modificare o null per crearne uno nuovo.
 */
const _showPromptEditorAsync = function(prompt) {
    const jfh = UaJtfh();
    const isEdit = !!prompt;

    jfh.append('<div class="data-dialog">');
    jfh.append(`<h4>${isEdit ? "Modifica Prompt" : "Nuovo Prompt"}</h4>`);
    jfh.append('<div class="ak-form">');
    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Nome</label></div></div>');
    jfh.append(`<input type="text" id="prompt-inp-name" class="ak-input-key" value="${isEdit ? prompt.name : ''}" placeholder="Nome del prompt">`);
    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Contenuto</label></div></div>');
    jfh.append('<textarea id="prompt-inp-content" class="ak-input-key" rows="10" placeholder="Istruzioni per il modello"></textarea>');
    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<button class="ak-btn-add" onclick="wnds.handleSavePrompt()">Salva</button>');
    jfh.append('<button class="btn-danger ak-btn-del" onclick="wnds.winfo.close()">Annulla</button>');
    jfh.append('</div></div></div>');

    wnds.handleSavePrompt = async function() {
        const name = document.getElementById("prompt-inp-name").value.trim();
        const content = document.getElementById("prompt-inp-content").value;
        if (!name || !content.trim()) return await alert("Nome e contenuto obbligatori.");
        if (isEdit) {
            await PromptMgr.update(prompt.id, { name, content });
        } else {
            const created = await PromptMgr.create(name, content);
            if (created && created.id) {
                const activeId = await PromptMgr.getActiveId();
                if (!activeId) await PromptMgr.setActive(created.id);
            }
        }
        wnds.winfo.close();
        await _actionListPromptsAsync();
    };

    wnds.winfo.show(jfh.html());
    if (isEdit && prompt.content) {
        const textarea = document.getElementById("prompt-inp-content");
        if (textarea) textarea.value = prompt.content;
    }
};

/**
 * Mostra la finestra di gestione prompt di sistema (elenco, attiva, modifica, elimina).
 */
const _actionListPromptsAsync = async function() {
    const jfh = UaJtfh();
    const list = await PromptMgr.list();
    const activeId = await PromptMgr.getActiveId();

    jfh.append('<div class="data-dialog"><h4>Gestione Prompt di Sistema</h4>');

    if (list.length === 0) {
        jfh.append('<p>Nessun prompt di sistema. Creane uno con "Nuovo Prompt".</p>');
    } else {
        jfh.append('<table class="table-data"><thead><tr><th>Nome</th><th>Azioni</th></tr></thead><tbody>');
        list.forEach(function(p) {
            const isActive = p.id === activeId;
            const activeMark = isActive ? ' <span class="status-presente">(attivo)</span>' : "";
            jfh.append('<tr>');
            jfh.append(`<td>${p.name}${activeMark}</td>`);
            jfh.append('<td>');
            jfh.append(`<button class="btn-success" onclick="wnds.activatePrompt(${p.id})">${isActive ? "Attivo" : "Attiva"}</button>`);
            jfh.append(`<button class="btn-warning btn-ml5" onclick="wnds.editPrompt(${p.id})">Modifica</button>`);
            jfh.append(`<button class="btn-danger btn-ml5" onclick="wnds.deletePrompt(${p.id})">Elimina</button>`);
            jfh.append('</td></tr>');
        });
        jfh.append('</tbody></table>');
    }

    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<button class="btn-success" onclick="wnds.newPrompt()">Nuovo Prompt</button>');
    jfh.append('</div></div>');

    wnds.activatePrompt = async function(id) {
        await PromptMgr.setActive(id);
        wnds.winfo.close();
        await _actionListPromptsAsync();
        UaLog.log(">>> Prompt di sistema selezionato. <<<");
    };

    wnds.editPrompt = async function(id) {
        const prompt = await PromptMgr.get(id);
        if (prompt) _showPromptEditorAsync(prompt);
    };

    wnds.deletePrompt = async function(id) {
        const prompt = await PromptMgr.get(id);
        if (!await confirm(`Eliminare il prompt "${prompt.name}"?`)) return;
        await PromptMgr.delete(id);
        wnds.winfo.close();
        await _actionListPromptsAsync();
        UaLog.log(">>> Prompt eliminato. <<<");
    };

    wnds.newPrompt = async function() {
        _showPromptEditorAsync(null);
    };

    wnds.winfo.show(jfh.html());
};

// ============================================================================
// API PUBBLICA - Windows (wnds)
// ============================================================================

export const wnds = {
    wdiv: null, wpre: null, winfo: null,
    init: function() {
        wnds.wdiv = _UaWindowFactory("id-wnd-div", "div-text", "wdiv", false);
        wnds.wpre = _UaWindowFactory("id-wnd-pre", "pre-text", "wpre");
        wnds.winfo = _UaWindowInfoFactory("id-wnd-info");
        window.wnds = wnds;
    },
    closeAll: function() {
        if (wnds.wdiv) wnds.wdiv.close();
        if (wnds.wpre) wnds.wpre.close();
        if (wnds.winfo) wnds.winfo.close();
    },
    editLastQuestion: async function() {
        const conversationId = await SettingsMgr.getActiveConversationId();
        if (!conversationId) return;
        const messages = await MessageStore.list(conversationId);
        let lastUserIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") { lastUserIndex = i; break; }
        }
        if (lastUserIndex === -1) return;
        const lastQuestion = messages[lastUserIndex].content;
        await MessageStore.removeFrom(conversationId, messages[lastUserIndex].id);
        if (TextInput._inputEl) {
            TextInput._inputEl.value = lastQuestion;
            TextInput._inputEl.focus();
            TextInput._inputEl.setSelectionRange(lastQuestion.length, lastQuestion.length);
        }
        await showHtmlThread();
    }
};

// ============================================================================
// API PUBBLICA - Comandi Generali (Commands)
// ============================================================================

export const Commands = {
    init: function() {},
    help: function() { wnds.wdiv.show(help0_html); },
    log: function() {
        UaLog.toggle();
        const btn = document.getElementById("id_log");
        if (btn) {
            btn.setAttribute("data-tt", UaLog.active ? "Close" : "Open");
        }
    },
    providerSettings: function() { toggleProviderTree(); },
    resetAll: async function() {
        const msg1 = "Primo avviso: sta per eseguire un RESET TOTALE dell'applicazione.\n\nVerranno cancellati TUTTI i dati: conversazioni, messaggi, prompt di sistema, chiavi API e configurazione provider.\n\nConfermi?";
        if (!await confirm(msg1)) return;
        const msg2 = "SECONDO AVVISO: conferma definitiva.\n\nTutti i dati verranno persi. L'applicazione tornerà allo stato iniziale.\n\nProcedere?";
        if (!await confirm(msg2)) return;
        localStorage.clear();
        await idbMgr.clearAll();
        await UaDb.clear();
        location.reload();
    }
};

// ============================================================================
// API PUBBLICA - Input Utente (TextInput)
// ============================================================================

export const TextInput = {
    _inputEl: null,
    init: function() { TextInput._inputEl = document.querySelector(".text-input"); },
    handleEnter: function(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            TextInput.sendMessageAsync();
        }
    },
    clear: function() {
        if (TextInput._inputEl) { TextInput._inputEl.value = ""; TextInput._inputEl.focus(); }
    },
    _checkProviderReady: async function() {
        const config = LlmProvider.getConfig();
        if (!config || !config.provider) {
            await alert("Nessun provider configurato. Selezionare un provider LLM.");
            return false;
        }
        const provider = config.provider;
        const apiKey = await getApiKey(provider);
        if (!apiKey) {
            await alert(`API key mancante per il provider "${provider}".\nAggiungere una chiave valida in Gestisci API Key.`);
            return false;
        }
        return true;
    },
    sendMessageAsync: async function() {
        if (!TextInput._inputEl) return;
        const query = TextInput._inputEl.value.trim();
        if (query.length === 0) { await alert("Inserisci una domanda."); return; }
        if (!await TextInput._checkProviderReady()) return;

        _Spinner.show();
        try {
            const rr = await ChatEngine.sendMessage(query);
            if (rr && rr.ok === false && rr.error && rr.error.code !== 499) {
                const err = rr.error;
                const codePrefix = err.code ? `[${err.code}] ` : "";
                await alert(`ERRORE CRITICO:\n${codePrefix}${err.message || "Errore sconosciuto"}`);
            }
            await showHtmlThread();
            TextInput.clear();
        } catch (error) {
            if (error && error.code === 499) return;
            const errCode = error.code ? `[${error.code}] ` : "";
            await alert(`ERRORE CRITICO:\n${errCode}${error.message || error}`);
        } finally {
            _Spinner.hide();
        }
    }
};

// ============================================================================
// API PUBBLICA - Output e Cronologia (TextOutput)
// ============================================================================

export const TextOutput = {
    init: function() {},
    copyAsync: async function() {
        const outputEl = document.querySelector("#id-text-out .div-text");
        const rawText = outputEl ? outputEl.textContent.trim() : "";
        if (rawText.length < 2) return;
        try {
            await navigator.clipboard.writeText(textFormatter(rawText));
            const btn = document.getElementById("btn-copy-output");
            if (btn) { btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 2000); }
        } catch (err) { console.error("TextOutput.copyAsync:", err); }
    }
};

// ============================================================================
// API PUBBLICA - Utility UI
// ============================================================================

export const getTheme = async function() {
    const theme = await SettingsMgr.getTheme();
    await _updateThemeAsync(theme);
};

const _updateEditLastButton = function(messages) {
    const btn = document.getElementById("btn-edit-last");
    if (!btn) return;
    const hasUserMsg = Array.isArray(messages) && messages.some(m => m.role === "user");
    btn.style.display = hasUserMsg ? "flex" : "none";
};

export const showHtmlThread = async function() {
    const conversationId = await SettingsMgr.getActiveConversationId();
    if (!conversationId) {
        _setResponseHtml("");
        _updateEditLastButton([]);
        return;
    }
    const messages = await MessageStore.list(conversationId);
    _setResponseHtml(messages2html(messages));
    _updateEditLastButton(messages);
};

// ============================================================================
// PROVIDER TREE UI (albero di selezione provider/modelli)
// ============================================================================

/**
 * Aggiorna il display del modello attivo nell'header.
 */
export const updateActiveModelDisplay = function() {
    const displayElement = document.getElementById("active-model-display");
    if (!displayElement) {
        return;
    }

    const config = LlmProvider.getConfig();
    const displayText = config.model ? `${config.model} (${config.windowSize}k)` : "Nessun provider selezionato";
    displayElement.textContent = displayText;
};

/** @type {boolean} */
let _treeVisible = false;

const TREE_CONTAINER_ID = "provvider_id";

/**
 * Costruisce l'HTML dell'albero di selezione provider/modelli.
 * @returns {string}
 */
const _buildProviderTreeHtml = function() {
    const providerConfig = getProviderConfig();
    const currentConfig = LlmProvider.getConfig();
    const wnd = UaWindowAdm.get(TREE_CONTAINER_ID);
    const container = wnd.getElement();

    if (!container) {
        return "";
    }

    const jfh = UaJtfh();

    jfh.append('<div class="provider-tree-header">')
       .append('  <span>Seleziona Modello</span>')
       .append('  <button class="provider-tree-close-btn tt-left" data-tt="Chiudi">&times;</button>')
       .append('</div>')
       .append('<ul class="provider-tree">');

    for (const providerName in providerConfig) {
        const provider = providerConfig[providerName];
        const isActive = providerName === currentConfig.provider;
        const icon = isActive ? "&#9660;" : "&#9658;";
        const activeClass = isActive ? "active" : "";
        const visibleClass = isActive ? " model-list--visible" : "";

        jfh.append(`<li class="provider-node">`)
           .append(`  <span class="${activeClass}" data-provider="${providerName}">`)
           .append(`    ${icon} ${providerName}`)
           .append(`  </span>`)
           .append(`  <ul class="model-list${visibleClass}">`);

        Object.keys(provider.models).forEach(function(modelName) {
            const modelData = provider.models[modelName];
            const isActiveModel = isActive && modelName === currentConfig.model;
            const activeModelClass = isActiveModel ? " active" : "";

            jfh.append(`    <li class="model-node${activeModelClass}"`)
               .append(`        data-provider="${providerName}"`)
               .append(`        data-model="${modelName}">`)
               .append(`      ${modelName} (${modelData.windowSize}k)`)
               .append(`    </li>`);
        });

        jfh.append(`  </ul>`)
           .append(`</li>`);
    }

    jfh.append(`</ul>`);

    const treeHtml = jfh.html();
    return treeHtml;
};

/**
 * Aggiunge gli event listener all'albero di selezione.
 */
const _addProviderTreeListeners = function() {
    const wnd = UaWindowAdm.get(TREE_CONTAINER_ID);
    const container = wnd.getElement();

    if (!container) {
        return;
    }

    const closeBtn = container.querySelector(".provider-tree-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", function() {
            toggleProviderTree();
        });
    }

    container.querySelectorAll(".provider-node > span").forEach(function(span) {
        span.addEventListener("click", function(e) {
            const modelList = span.nextElementSibling;
            const isOpening = getComputedStyle(modelList).display === "none";

            container.querySelectorAll(".model-list").forEach(function(ml) {
                ml.removeAttribute("style");
                ml.style.display = "none";
            });

            container.querySelectorAll(".provider-node > span").forEach(function(s) {
                const provName = s.dataset.provider;
                s.innerHTML = `&#9658; ${provName}`;
            });

            if (isOpening) {
                modelList.style.display = "block";
                const provName = e.target.dataset.provider;
                e.target.innerHTML = `&#9660; ${provName}`;
            }
        });
    });

    container.querySelectorAll(".model-node").forEach(function(node) {
        node.addEventListener("click", function(e) {
            const providerName = e.target.dataset.provider;
            const modelName = e.target.dataset.model;
            _onProviderModelSelect(providerName, modelName);
        });
    });
};

/**
 * Gestisce la selezione di un provider/modello dall'albero.
 * @param {string} provider
 * @param {string} model
 */
const _onProviderModelSelect = function(provider, model) {
    const success = LlmProvider.setActive(provider, model);
    if (!success) return;

    LlmProvider.saveConfig();
    updateActiveModelDisplay();

    if (_treeVisible) {
        const treeHtml = _buildProviderTreeHtml();
        const wnd = UaWindowAdm.get(TREE_CONTAINER_ID);
        wnd.setHtml(treeHtml);
        _addProviderTreeListeners();
    }
    toggleProviderTree();
};

/**
 * Mostra/nasconde l'albero di selezione provider/modelli.
 */
export const toggleProviderTree = function() {
    const wnd = UaWindowAdm.create(TREE_CONTAINER_ID);
    const container = wnd.getElement();

    if (!container) {
        return;
    }

    wnd.addClassStyle("provider-tree-container");
    _treeVisible = !_treeVisible;
    container.style.display = _treeVisible ? "block" : "none";

    if (_treeVisible) {
        const treeHtml = _buildProviderTreeHtml();
        wnd.setHtml(treeHtml);
        _addProviderTreeListeners();
    }
};

// ============================================================================
// AGGIORNAMENTO LLM (procedura di test e repository dei modelli accettati)
// ============================================================================

/**
 * Sincronizza lo stato della checkbox del provider in base ai suoi modelli:
 * selezionata se tutti selezionati, indeterminata se solo una parte.
 * @param {string} providerName
 */
const _syncLlmProviderCheckbox = function(providerName) {
    const container = wnds.winfo.getElement();
    if (!container) return;

    const modelChecks = Array.from(container.querySelectorAll(`.llm-model-check[data-provider="${providerName}"]`));
    const providerCheck = container.querySelector(`.llm-provider-check[data-provider="${providerName}"]`);
    if (!providerCheck || modelChecks.length === 0) return;

    const checkedCount = modelChecks.filter(function(cb) { return cb.checked; }).length;
    providerCheck.checked = checkedCount === modelChecks.length;
    providerCheck.indeterminate = checkedCount > 0 && checkedCount < modelChecks.length;
};

/**
 * Gestore della voce di menu "Aggiorna LLM".
 * Chiude il drawer, mostra l'overlay di attesa, scarica e testa i modelli,
 * memorizza i superati nell'elenco (new) e mostra solo un riepilogo.
 */
const _actionLlmUpdateAsync = async function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);

    const proceed = await confirm("Avviare la procedura di Aggiorna LLM? Verranno scaricati e testati i modelli di ogni provider con chiave attiva.\n\nIl test può richiedere del tempo. Confermi?");
    if (!proceed) return;

    _showWaitSpinner();
    try {
        const results = await LlmUpdater.runUpdate();
        const passed = results.filter(function(r) { return r.ok; });

        if (results.length === 0) {
            _hideWaitSpinner();
            await alert("Aggiorna LLM: nessun provider con chiave API attiva. Aggiungere una chiave in Gestisci API Key e riprovare.");
            return;
        }

        // Memorizza i superati nell'elenco da selezionare (new).
        const newModels = {};
        passed.forEach(function(r) {
            if (!newModels[r.provider]) newModels[r.provider] = [];
            newModels[r.provider].push({ model: r.model, vote: r.vote, elapsedMs: r.elapsedMs });
        });
        await LlmUpdater.setNewModels(newModels);

        _hideWaitSpinner();
        await alert(`Aggiorna LLM completato.\n\nScaricati e testati: ${results.length}\nSuperati il test (filtrati): ${passed.length}`);
    } catch (error) {
        console.error("_actionLlmUpdateAsync:", error);
        _hideWaitSpinner();
        await alert(`ERRORE durante l'aggiornamento LLM:\n${error.message || error}`);
    }
};

/**
 * Mostra la finestra "Seleziona LLM": elenco dei modelli scaricati per i
 * provider con chiave API attiva, raggruppati per provider, con checkbox per
 * scegliere quali modelli rendere attivi nell'albero di scelta LLM.
 * All'apertura nessuna checkbox risulta selezionata.
 */
const _showSelectLlm = async function() {
    const newModels = await LlmUpdater.readNewModels();
    const providerConfig = getProviderConfig();

    const jfh = UaJtfh();
    jfh.append('<div class="data-dialog"><h4>Seleziona LLM</h4>');
    jfh.append('<div class="llm-results">');

    const providerSet = new Set(Object.keys(newModels));
    Object.keys(providerConfig).forEach(function(p) { providerSet.add(p); });
    const providers = Array.from(providerSet);

    if (providers.length === 0) {
        jfh.append('<p>Nessun modello disponibile. Esegui prima "Aggiorna LLM".</p>');
    } else {
        providers.forEach(function(providerName) {
            const models = newModels[providerName] || [];

            jfh.append(`<div class="llm-result-provider">`);
            if (models.length === 0) {
                jfh.append(`<label class="llm-provider-label"><b>${providerName}</b></label>`);
                jfh.append('<div class="llm-result-models"><p class="llm-no-models">Nessun modello ha superato il test.</p></div>');
            } else {
                jfh.append(`<label class="llm-provider-label"><input type="checkbox" class="llm-provider-check" data-provider="${providerName}"> <b>${providerName}</b></label>`);
                jfh.append('<div class="llm-result-models">');
                jfh.append('<div class="llm-result-head"><span>LLM</span><span>Voto</span><span>Tempo</span></div>');
                models.forEach(function(m) {
                    const modelId = typeof m === "string" ? m : m.model;
                    const vote = typeof m === "string" ? "-" : (m.vote != null ? m.vote : "-");
                    const time = typeof m === "string" ? "-" : (m.elapsedMs != null ? (m.elapsedMs / 1000).toFixed(1) + "s" : "-");
                    jfh.append(`<div class="llm-result-row">`);
                    jfh.append(`  <span class="llm-result-llm"><label><input type="checkbox" class="llm-model-check" data-provider="${providerName}" data-model="${modelId}"> ${modelId}</label></span>`);
                    jfh.append(`  <span class="llm-result-vote">${vote}</span>`);
                    jfh.append(`  <span class="llm-result-time">${time}</span>`);
                    jfh.append(`</div>`);
                });
                jfh.append('</div>');
            }
            jfh.append('</div>');
        });
    }

    jfh.append('</div>');
    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<div class="llm-select-btns">');
    jfh.append('<button class="btn-success" onclick="wnds.llmSelectSave()">Salva</button>');
    jfh.append('<button class="btn-danger" onclick="wnds.llmSelectCancel()">Annulla</button>');
    jfh.append('</div>');
    jfh.append('</div></div>');

    wnds.winfo.show(jfh.html());

    // Sposta la finestra a destra del menu laterale (menu = 20vw) ad ogni apertura.
    const win = UaWindowAdm.get("id-wnd-info");
    if (win && win.reset && win.vw_vh) {
        win.reset().vw_vh().setXY(24, 6, -1);
        win.show();
    }

    const container = wnds.winfo.getElement();
    const infoBox = container ? container.querySelector(".window-info") : null;
    if (infoBox) {
        infoBox.classList.add("window-info-select");
    }
    container.querySelectorAll(".llm-provider-check").forEach(function(cb) {
        cb.addEventListener("change", function() {
            const providerName = cb.dataset.provider;
            container.querySelectorAll(`.llm-model-check[data-provider="${providerName}"]`).forEach(function(modelCb) {
                modelCb.checked = cb.checked;
            });
            cb.indeterminate = false;
        });
    });
    container.querySelectorAll(".llm-model-check").forEach(function(cb) {
        cb.addEventListener("change", function() {
            _syncLlmProviderCheckbox(cb.dataset.provider);
        });
    });
};

wnds.llmSelectSave = async function() {
    const container = wnds.winfo.getElement();
    if (!container) return;

    const activeModels = {};
    let selectedCount = 0;
    container.querySelectorAll(".llm-model-check").forEach(function(cb) {
        if (!cb.checked) return;
        const provider = cb.dataset.provider;
        const model = cb.dataset.model;
        if (!activeModels[provider]) activeModels[provider] = [];
        activeModels[provider].push(model);
        selectedCount++;
    });

    if (selectedCount === 0) {
        const confirmed = await confirm("Nessun modello selezionato: l'albero di scelta LLM verrà svuotato. Confermi?");
        if (!confirmed) return;
    }

    await LlmUpdater.setActiveModels(activeModels);

    const available = await LlmUpdater.fetchAvailableModels();
    await LlmProvider.applyRepositoryToAvailable(available);
    LlmProvider.validateActive();
    updateActiveModelDisplay();
    wnds.winfo.close();
    UaLog.log(">>> Selezione LLM applicata all'albero. <<<");
};

wnds.llmSelectCancel = function() {
    wnds.winfo.close();
};

const _actionSelectLlm = function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);
    _showSelectLlm();
};

/**
 * Gestore della voce di menu "Reset LLM".
 * Azzera la selezione "active" su IndexedDB e ricostruisce il catalogo in
 * memoria con tutti i modelli presenti nei file data/models/, così l'albero
 * di scelta LLM mostra tutti i modelli indipendentemente dalla selezione
 * precedente.
 */
const _actionResetLlmAsync = async function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);

    const proceed = await confirm("Reset LLM: ripristinare l'albero di scelta con tutti i modelli presenti in data/models/? La selezione personalizzata verrà azzerata.");
    if (!proceed) return;

    try {
        const repository = await LlmUpdater.readRepository();
        await UaDb.saveJson(DATA_KEYS.KEY_LLM_REPOSITORY, {
            new: repository.new,
            active: null
        });

        await LlmProvider.loadModels();
        LlmProvider.validateActive();
        updateActiveModelDisplay();
        UaLog.log(">>> Reset LLM: albero ricostruito con tutti i modelli dai file. <<<");
    } catch (error) {
        console.error("_actionResetLlmAsync:", error);
        await alert(`ERRORE durante il reset LLM:\n${error.message || error}`);
    }
};

// ============================================================================
// ASSOCIAZIONE EVENTI (Event Binding)
// ============================================================================

export const bindEventListener = function() {

    // Pulsanti Header
    const ids = {
        "btn-help": Commands.help,
        "id_log": Commands.log,
        "btn-provider-settings": Commands.providerSettings,
        "btn-theme-toggle": toggleThemeAsync,
        "menu-new-conversation": _actionNewConversationAsync,
        "menu-list-conversations": _actionListConversationsAsync,
        "menu-new-prompt": () => _showPromptEditorAsync(null),
        "menu-list-prompts": _actionListPromptsAsync,
        "menu-provider-tree": _actionSelectLlm,
        "menu-llm-update": _actionLlmUpdateAsync,
        "menu-reset-llm": _actionResetLlmAsync,
        "menu-add-api-key": addApiKey,
        "menu-default-api-keys": restoreDefaultApiKeys,
        "menu-reset": Commands.resetAll,
        "btn-action-send": TextInput.sendMessageAsync,
        "btn-copy-output": TextOutput.copyAsync,
        "btn-copy-output-toolbar": TextOutput.copyAsync,
        "btn-clear-output": function() { _setResponseHtml(""); }
    };

    Object.entries(ids).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
    });

    // Eventi specifici per elementi con classi
    const elClearInput = document.querySelector(".clear-input");
    if (elClearInput) elClearInput.onclick = TextInput.clear;

    const elTextInput = document.querySelector(".text-input");
    if (elTextInput) elTextInput.onkeydown = TextInput.handleEnter;

    const menuBtn = document.querySelector("#id-menu-btn");
    const menuLabel = document.querySelector("#id-menu-icon-label");
    if (menuBtn && menuLabel) {
        menuBtn.onchange = function() {
            const isOpen = menuBtn.checked;
            document.body.classList.toggle(CSS_MENU_OPEN, isOpen);
            menuLabel.setAttribute("data-tt", isOpen ? "Close" : "Open");
        };
    }

    // --- INIZIALIZZAZIONE POPUP INFORMATIVI ---
    // Header
    HelpPopup.bind("btn-help", "<strong>Istruzioni</strong><br>Apre il manuale utente con l'elenco dei comandi dell'app.");
    HelpPopup.bind("id_log", "<strong>Registro Eventi</strong><br>Mostra i messaggi di log dell'applicazione in tempo reale.");
    HelpPopup.bind("btn-provider-settings", "<strong>Configurazione LLM</strong><br>Seleziona il provider AI e il modello specifico.");
    // btn-theme-toggle usa tooltip CSS (data-tt) — dinamico in _updateThemeAsync

    // Azioni
    HelpPopup.bind("btn-action-send", "<strong>Invia Messaggio</strong><br>Invia la domanda al modello attivo mantenendo la memoria della conversazione.");
    HelpPopup.bind("btn-copy-output", "<strong>Copia Output</strong><br>Copia il testo dell'output della chat negli appunti.");
    HelpPopup.bind("btn-copy-output-toolbar", "<strong>Copia Output</strong><br>Copia il testo dell'output della chat negli appunti.");
    HelpPopup.bind("btn-clear-output", "<strong>Cancella Output</strong><br>Svuota la vista dell'output senza cancellare la cronologia della conversazione.");

    // Menu — Conversazioni
    HelpPopup.bind("menu-new-conversation", "<strong>Nuova Conversazione</strong><br>Crea una nuova conversazione vuota e la attiva. La conversazione attiva resta salvata.");
    HelpPopup.bind("menu-list-conversations", "<strong>Gestisci Conversazioni</strong><br>Elenca, seleziona o elimina le conversazioni salvate.");

    // Menu — Prompt di Sistema
    HelpPopup.bind("menu-new-prompt", "<strong>Nuovo Prompt</strong><br>Crea un prompt di sistema personalizzato con nome e contenuto.");
    HelpPopup.bind("menu-list-prompts", "<strong>Gestisci Prompt</strong><br>Elenca, modifica, seleziona o elimina i prompt di sistema.");

    // Menu — LLM
    HelpPopup.bind("menu-reset-llm", "<strong>Reset LLM</strong><br>Azzera la selezione attiva e ripristina tutti i modelli disponibili dai file locali.");
    HelpPopup.bind("menu-provider-tree", "<strong>Seleziona LLM</strong><br>Apre l'elenco dei modelli scaricati con checkbox per aggiornare l'albero di scelta LLM.");
    HelpPopup.bind("menu-llm-update", "<strong>Aggiorna LLM</strong><br>Testa i modelli dei provider con chiave attiva e aggiorna l'albero di selezione LLM.");
    HelpPopup.bind("menu-add-api-key", "<strong>Gestione API Key</strong><br>Aggiungi, attiva o elimina le tue chiavi API personali.");
    HelpPopup.bind("menu-default-api-keys", "<strong>API Keys Default</strong><br>Ripristina le chiavi API predefinite, sovrascrivendo quelle attuali.");

    // Menu — Sistema
    HelpPopup.bind("menu-reset", "<strong>Reset</strong><br>Cancella TUTTI i dati: conversazioni, prompt, chiavi API e configurazione. Due conferme richieste.");
};