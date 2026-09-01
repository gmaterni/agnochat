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
import { createLlmSelectionWindow } from "./llm/llm-selection.js";
import { getLlmDb } from "./app_mgr.js";
import { runUpdate as runLlmUpdate } from "./commands/update-llm.js";
import { runReset as runLlmReset } from "./commands/reset-llm.js";
import { documentUploader, getDocuments, removeDocument, clearDocuments, setOnDocumentsChanged, setDocuments } from "./uploader.js";
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
        // Ripristina la larghezza di default: le finestre specializzate
        // (es. editor dei prompt) possono fissarla dopo la show().
        _win.setStyle({ width: "auto" });

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

const _escapeHtml = function(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const renderDocBar = function() {
    const docBar = document.getElementById("doc-bar");
    if (!docBar) return;
    const docs = getDocuments();
    if (docs.length === 0) {
        docBar.innerHTML = "";
        docBar.style.display = "none";
        return;
    }
    docBar.style.display = "flex";
    docBar.innerHTML = docs.map(doc => {
        const escName = _escapeHtml(doc.fileName);
        return `<span class="doc-item tt-top" data-tt="${escName}">
          <svg class="doc-icon" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z"/></svg>
          <button class="doc-remove" data-doc-name="${escName}" title="Rimuovi">
            <svg class="icon-remove" viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
          </button>
        </span>`;
    }).join("");
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

    clearDocuments();
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
            clearDocuments();
            _setResponseHtml("");
        }
        wnds.winfo.close();
        await _actionListConversationsAsync();
        UaLog.log(">>> Conversazione eliminata. <<<");
    };

    wnds.winfo.show(jfh.html());
};

/**
 * Prompt di sistema di esempio proposti nella creazione di un nuovo prompt.
 * @type {Array<{name: string, content: string}>}
 */
const PROMPT_EXAMPLES = [
    {
        name: "Assistente Generale",
        content: "Sei un assistente utile e preciso. Rispondi sempre in italiano, con un tono professionale e diretto. Se una richiesta è ambigua, poni una domanda di chiarimento prima di rispondere. Preferisci elenchi puntati quando migliorano la leggibilità."
    },
    {
        name: "Sviluppatore JavaScript",
        content: "Sei un esperto di JavaScript vanilla ES2020+ e Web API, senza framework né bundler. Fornisci codice completo e funzionante, con commenti brevi in italiano e identificatori in inglese. Spiega le scelte tecniche solo se richiesto."
    },
    {
        name: "Traduttore IT/EN",
        content: "Sei un traduttore professionista. Traduci il testo ricevuto dall'italiano all'inglese o dall'inglese all'italiano, rilevando automaticamente la lingua di partenza. Conserva tono, registro e formattazione dell'originale. Restituisci solo la traduzione, senza commenti."
    },
    {
        name: "Sintetizzatore di Testi",
        content: "Riceverai testi da riassumere. Producisci un riassunto chiaro e strutturato: prima una frase con l'idea centrale, poi i punti chiave in elenco puntato. Non aggiungere informazioni non presenti nel testo originale."
    }
];

/**
 * Mostra l'editor di un prompt di sistema (creazione o modifica).
 * In creazione propone una lista di prompt di sistema di esempio.
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

    if (!isEdit) {
        jfh.append('<div class="ak-form-row"><div><label class="ak-label">Esempi</label></div></div>');
        jfh.append('<select id="prompt-inp-examples" class="ak-input-key" onchange="wnds.handlePromptExample(this.value)">');
        jfh.append('<option value="">— Scegli un prompt di sistema di esempio —</option>');
        PROMPT_EXAMPLES.forEach((example, index) => {
            const optionHtml = `<option value="${index}">${example.name}</option>`;
            jfh.append(optionHtml);
        });
        jfh.append('</select>');
    }

    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Contenuto</label></div></div>');
    jfh.append('<textarea id="prompt-inp-content" class="ak-input-key" rows="10" placeholder="Istruzioni per il modello"></textarea>');
    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<button class="ak-btn-add" onclick="wnds.handleSavePrompt()">Salva</button>');
    jfh.append('<button class="btn-danger ak-btn-del" onclick="wnds.winfo.close()">Annulla</button>');
    jfh.append('</div></div></div>');

    wnds.handleSavePrompt = async function() {
        const name = document.getElementById("prompt-inp-name").value.trim();
        const content = document.getElementById("prompt-inp-content").value;
        if (!name || !content.trim()) {
            alert("Nome e contenuto obbligatori.");
            return;
        }
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

    wnds.handlePromptExample = function(index) {
        const exampleIndex = Number(index);
        const example = PROMPT_EXAMPLES[exampleIndex];
        if (!example) return;

        const nameInput = document.getElementById("prompt-inp-name");
        const contentInput = document.getElementById("prompt-inp-content");
        if (nameInput) nameInput.value = example.name;
        if (contentInput) contentInput.value = example.content;
    };

    wnds.winfo.show(jfh.html());

    // Finestra dell'editor prompt a larghezza fissa 60vw
    const promptWin = UaWindowAdm.get("id-wnd-info");
    if (promptWin) promptWin.setStyle({ width: "60vw" });

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
    readme: function() { window.open("README.html", "_blank"); },
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
    init: function() {
        TextInput._inputEl = document.querySelector(".text-input");
    },
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
        setDocuments([]);
        renderDocBar();
        _updateEditLastButton([]);
        return;
    }
    const messages = await MessageStore.list(conversationId);
    _setResponseHtml(messages2html(messages));
    _updateEditLastButton(messages);
    const docs = await ConversationMgr.loadDocuments(conversationId);
    setDocuments(docs);
    renderDocBar();
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
const _onProviderModelSelect = async function(provider, model) {
    const success = LlmProvider.setActive(provider, model);
    if (!success) return;

    try {
        await LlmProvider.saveConfig();
    } catch (error) {
        console.error("_onProviderModelSelect:", error);
    }

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

/**
 * Ricostruisce l'albero di selezione provider/modelli se è visibile.
 * Usato dopo una modifica della selezione LLM per rifletterla subito.
 */
export const refreshProviderTree = function() {
    if (!_treeVisible) return;

    const wnd = UaWindowAdm.get(TREE_CONTAINER_ID);
    if (!wnd) return;

    const container = wnd.getElement();
    if (!container) return;

    const treeHtml = _buildProviderTreeHtml();
    wnd.setHtml(treeHtml);
    _addProviderTreeListeners();
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
 * Usa il modulo dedicato per scoprire e testare i modelli, salva in IndexedDB.
 */
const _actionLlmUpdateAsync = async function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);

    const proceed = await confirm("Avviare la procedura di Aggiorna LLM? Verranno scaricati e testati i modelli di ogni provider con chiave attiva.\n\nIl test può richiedere del tempo. Confermi?");
    if (!proceed) return;

    _showWaitSpinner();
    try {
        const results = await runLlmUpdate();

        const passed = results.filter(function(r) { return r.ok; });

        if (results.length === 0) {
            _hideWaitSpinner();
            await alert("Aggiorna LLM: nessun provider con chiave API attiva. Aggiungere una chiave in Gestisci API Key e riprovare.");
            return;
        }

        _hideWaitSpinner();
        await alert(`Aggiorna LLM completato.\n\nScaricati e testati: ${results.length}\nSuperati il test: ${passed.length}`);
    } catch (error) {
        console.error("_actionLlmUpdateAsync:", error);
        _hideWaitSpinner();
        await alert(`ERRORE durante l'aggiornamento LLM:\n${error.message || error}`);
    }
};

/**
 * Mostra la finestra "Seleziona LLM" usando il modulo dedicato.
 */
const _showSelectLlm = async function() {
    const db = getLlmDb();
    if (!db) {
        UaLog.log("ERRORE: Database LLM non inizializzato.");
        return;
    }

    try {
        const selectionWindow = createLlmSelectionWindow(db);
        await selectionWindow.show();
    } catch (error) {
        console.error("_showSelectLlm:", error);
        UaLog.log("ERRORE: Impossibile aprire la selezione LLM.");
    }
};

const _actionSelectLlm = function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);
    _showSelectLlm();
};

/**
 * Gestore della voce di menu "Reset LLM".
 * Usa il modulo dedicato per ripristinare i modelli di default.
 */
const _actionResetLlmAsync = async function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);

    const proceed = await confirm("Reset LLM: ripristinare l'albero di scelta con tutti i modelli presenti in data/models/? La selezione personalizzata verrà azzerata.");
    if (!proceed) return;

    try {
        await runLlmReset();
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
        "btn-readme": Commands.readme,
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
        "btn-clear-output": function() { _setResponseHtml(""); },
        "btn-upload-doc": function() { documentUploader.open(); }
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
    HelpPopup.bind("btn-help", "<strong>Help</strong><br>Apre il manuale utente con l'elenco dei comandi dell'app.");
    HelpPopup.bind("btn-readme", "<strong>README</strong><br>Apre la guida completa dell'applicazione in una nuova scheda.");
    HelpPopup.bind("id_log", "<strong>Registro Eventi</strong><br>Mostra i messaggi di log dell'applicazione in tempo reale.");
    HelpPopup.bind("btn-provider-settings", "<strong>Configurazione LLM</strong><br>Seleziona il provider AI e il modello specifico.");
    // btn-theme-toggle usa tooltip CSS (data-tt) — dinamico in _updateThemeAsync

    // Azioni
    HelpPopup.bind("btn-action-send", "<strong>Invia Messaggio</strong><br>Invia la domanda al modello attivo mantenendo la memoria della conversazione.");

    // --- DOC BAR: event delegation per rimozione singola ---
    const docBar = document.getElementById("doc-bar");
    if (docBar) {
        docBar.addEventListener("click", function(e) {
            const btn = e.target.closest(".doc-remove");
            if (!btn) return;
            const name = btn.getAttribute("data-doc-name");
            if (name) {
                removeDocument(name);
            }
        });
    }

    // --- DOC BAR: callback per aggiornamento automatico e persistenza ---
    setOnDocumentsChanged(async function(docs) {
        renderDocBar();
        const activeId = await SettingsMgr.getActiveConversationId();
        if (activeId) {
            ConversationMgr.saveDocuments(activeId, docs);
        }
    });
    HelpPopup.bind("btn-copy-output", "<strong>Copia Output</strong><br>Copia il testo dell'output della chat negli appunti.");
    HelpPopup.bind("btn-copy-output-toolbar", "<strong>Copia Output</strong><br>Copia il testo dell'output della chat negli appunti.");
    HelpPopup.bind("btn-clear-output", "<strong>Cancella Output</strong><br>Svuota la vista dell'output senza cancellare la cronologia della conversazione.");

    // Menu — Conversazioni
    HelpPopup.bind("menu-new-conversation", "<strong>Nuova Conversazione</strong><br>Crea una nuova conversazione vuota e la attiva. La conversazione attiva resta salvata.");
    HelpPopup.bind("menu-list-conversations", "<strong>Gestisci Conversazioni</strong><br>Elenca, seleziona o elimina le conversazioni salvate.");

    // Menu — Prompt di Sistema
    HelpPopup.bind("menu-new-prompt", "<strong>Nuovo System Prompt</strong><br>Crea un prompt di sistema personalizzato con nome e contenuto.");
    HelpPopup.bind("menu-list-prompts", "<strong>Gestisci System Prompt</strong><br>Elenca, modifica, seleziona o elimina i prompt di sistema.");

    // Menu — LLM
    HelpPopup.bind("menu-reset-llm", "<strong>Reset LLM</strong><br>Azzera la selezione attiva e ripristina tutti i modelli disponibili dai file locali.");
    HelpPopup.bind("menu-provider-tree", "<strong>Seleziona LLM</strong><br>Apre l'elenco dei modelli scaricati con checkbox per aggiornare l'albero di scelta LLM.");
    HelpPopup.bind("menu-llm-update", "<strong>Aggiorna LLM</strong><br>Testa i modelli dei provider con chiave attiva e aggiorna l'albero di selezione LLM.");
    HelpPopup.bind("menu-add-api-key", "<strong>Gestione API Key</strong><br>Aggiungi, attiva o elimina le tue chiavi API personali.");
    HelpPopup.bind("menu-default-api-keys", "<strong>Reset Api Keys</strong><br>Ripristina le chiavi API predefinite, sovrascrivendo quelle attuali.");

    // Menu — Sistema
    HelpPopup.bind("menu-reset", "<strong>Reset</strong><br>Cancella TUTTI i dati: conversazioni, prompt, chiavi API e configurazione. Due conferme richieste.");
};