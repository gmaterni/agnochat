/**
 * app_ui.js - Interfaccia utente e gestione comandi.
 *
 * Gestisce l'interazione con il DOM, la creazione di finestre fluttuanti,
 * il sistema di comandi e l'aggiornamento dinamico della UI.
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
import { clearAllTables } from "./services/db_instance.js";
import { LlmProvider, getProviderConfig } from "./llm_provider.js";
import { textFormatter, messages2html, escapeHtml } from "./services/history_utils.js";
import { ConversationMgr, MessageStore } from "./conversation_mgr.js";
import { PromptMgr } from "./prompt_mgr.js";
import { SettingsMgr } from "./settings_mgr.js";
import { ChatEngine } from "./chat_engine.js";
import { addApiKey, getApiKey, restoreDefaultApiKeys } from "./services/key_retriever.js";
import { LlmUpdater } from "./llm_updater.js";
import { createLlmSelectionWindow } from "./llm/llm-selection.js";
import { getLlmDb } from "./app_mgr.js";
import { formatErrorPrefix } from "./services/error_utils.js";
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

/** Codice di errore che indica l'interruzione manuale dell'utente. */
const ERROR_CODE_CANCELLED = 499;

/** Durata del feedback visivo "copiato" sul pulsante (millisecondi). */
const COPIED_FEEDBACK_MS = 2000;

/** Livelli z-index delle finestre fluttuanti principali. */
const WINDOW_Z_MAIN = 12;
const WINDOW_Z_INFO = 11;

/** Posizione orizzontale (vw) delle finestre con e senza menu aperto. */
const WINDOW_X_MENU_OPEN = 22;
const WINDOW_X_DEFAULT = 2;

/** Posizione verticale (vw) delle finestre fluttuanti. */
const WINDOW_Y_VW = 6;

/** Margine minimo del popup help rispetto ai bordi dello schermo (px). */
const POPUP_MARGIN_PX = 10;

/** Distanza del popup help dall'elemento di riferimento (px). */
const POPUP_GAP_PX = 12;

/** Spazio laterale del popup help rispetto al menu (px). */
const POPUP_MENU_GAP_PX = 8;

/** Ritardo prima della chiusura del popup help (millisecondi). */
const POPUP_HIDE_DELAY_MS = 300;

/** Durata della transizione di scomparsa del popup help (millisecondi). */
const POPUP_FADE_MS = 200;

/** Icona SVG del pulsante copia, condivisa da tutte le finestre che la usano. */
const COPY_ICON_SVG = '<svg class="icon copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>';

// ============================================================================
// COMPONENTE SPINNER (con STOP, per procedure interrompibili)
// ============================================================================

/**
 * Crea un gestore di overlay spinner con pulsante STOP.
 * @param {string} elementId - ID dell'elemento spinner nel DOM.
 * @param {Function} stopHandler - Azione eseguita alla conferma dello STOP.
 * @param {string} [stopMessage] - Messaggio della conferma dello STOP.
 * @param {boolean} [hideOnStop=true] - Se nascondere lo spinner dopo lo STOP.
 * @returns {{show: Function, hide: Function}}
 */
const _createSpinner = function(elementId, stopHandler, stopMessage = "Confermi lo STOP?", hideOnStop = true) {
  /**
   * Recupera gli elementi DOM necessari.
   * @returns {Object} Elementi outputArea, spinner e content.
   */
  const _getElements = function () {
    const els = {
      outputArea: document.querySelector("#id-text-out .div-text"),
      spinner: document.getElementById(elementId),
      spinnerContent: document.querySelector(`#${elementId} .spinner-content`),
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
    const confirmed = await confirm(stopMessage);
    if (confirmed) {
      stopHandler();
      if (hideOnStop) {
        hide();
      }
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

  const api = { show: show, hide: hide };
  return api;
};

/** Spinner della chat: lo STOP interrompe la risposta in corso. */
const _Spinner = _createSpinner("spinner", function() {
  ChatEngine.stop();
});

/** Spinner della procedura di aggiornamento LLM: lo STOP annulla il test in corso. */
const _waitSpinner = _createSpinner(
  "spinner-wait",
  function() {
    LlmUpdater.cancelUpdate();
  },
  "Confermi lo STOP della procedura di aggiornamento LLM?",
  false
);

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

        _win.drag().setZ(WINDOW_Z_MAIN);

        const isMenuOpen = document.body.classList.contains(CSS_MENU_OPEN);
        const xPos = isMenuOpen ? WINDOW_X_MENU_OPEN : WINDOW_X_DEFAULT;
        _win.vw_vh().setXY(xPos, WINDOW_Y_VW, 1);

        const copyBtnHtml = showCopy ? `
                    <button class="btn-copy wcp tt-left" data-tt="Copia" onclick="wnds.${copyMethodName}.copy()">
                        ${COPY_ICON_SVG}
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

        _win.drag().setZ(WINDOW_Z_INFO);
        // Ripristina la larghezza di default: le finestre specializzate
        // (es. editor dei prompt) possono fissarla dopo la show().
        _win.setStyle({ width: "auto" });

        const isMenuOpen = document.body.classList.contains(CSS_MENU_OPEN);
        const xPos = isMenuOpen ? WINDOW_X_MENU_OPEN : WINDOW_X_DEFAULT;
        _win.vw_vh().setXY(xPos, WINDOW_Y_VW, -1);

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
            left = menuRect.right + POPUP_MENU_GAP_PX;
            top = rect.top + (rect.height / 2) - (pHeight / 2);
        } else {
            top = rect.top - pHeight - POPUP_GAP_PX;
            left = rect.left + (rect.width / 2) - (pWidth / 2);

            if (top < POPUP_MARGIN_PX || el.closest(".head-wrapper")) {
                top = rect.bottom + POPUP_GAP_PX;
            }
        }

        if (left < POPUP_MARGIN_PX) left = POPUP_MARGIN_PX;
        if (left + pWidth > window.innerWidth - POPUP_MARGIN_PX) {
            left = window.innerWidth - pWidth - POPUP_MARGIN_PX;
        }

        if (top + pHeight > window.innerHeight - POPUP_MARGIN_PX) {
            top = rect.top - pHeight - POPUP_GAP_PX;
        }
        if (top < POPUP_MARGIN_PX) top = POPUP_MARGIN_PX;

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
                }, POPUP_FADE_MS);
            }
            _hideTimer = null;
        }, POPUP_HIDE_DELAY_MS);
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
        const escName = escapeHtml(doc.fileName);
        const itemHtml = `<span class="doc-item tt-top" data-tt="${escName}">
          <svg class="doc-icon" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z"/></svg>
          <button class="doc-remove" data-doc-name="${escName}" title="Rimuovi">
            <svg class="icon-remove" viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
          </button>
        </span>`;
        return itemHtml;
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
            const title = escapeHtml(c.title || "Senza titolo");
            jfh.append(`<td>${title}${activeMark}</td>`);
            jfh.append(`<td>${date}</td>`);
            jfh.append('<td>');
            jfh.append(`<button class="btn-success" onclick="wnds.viewConversation(${c.id})">Visualizza</button>`);
            jfh.append(`<button class="btn-success btn-ml5" onclick="wnds.selectConversation(${c.id})">Attiva</button>`);
            jfh.append(`<button class="btn-danger btn-ml5" onclick="wnds.deleteConversation(${c.id})">Elimina</button>`);
            jfh.append('</td></tr>');
        });
        jfh.append('</tbody></table>');
    }

    jfh.append('</div>');

    wnds.viewConversation = _showConversationViewAsync;
    wnds.selectConversation = _selectConversationAsync;
    wnds.deleteConversation = _deleteConversationAsync;

    wnds.winfo.show(jfh.html());
};

/**
 * Mostra i messaggi di una conversazione in una finestra con pulsante copia.
 * @param {number} id - Id della conversazione.
 */
const _showConversationViewAsync = async function(id) {
    const conv = await ConversationMgr.get(id);
    const messages = await MessageStore.list(id);

    if (!messages || messages.length === 0) {
        await alert("Nessun messaggio in questa conversazione.");
        return;
    }

    const conversationHtml = messages2html(messages);
    const jfhView = UaJtfh();
    const viewTitle = escapeHtml(conv.title || "Senza titolo");
    jfhView.append('<div class="data-dialog">');
    jfhView.append(`<h4>${viewTitle}</h4>`);
    jfhView.append('<div class="conversation-view">');
    jfhView.append(conversationHtml);
    jfhView.append('</div>');
    jfhView.append('</div>');

    wnds.winfo.show(jfhView.html());

    const convWin = UaWindowAdm.get("id-wnd-info");
    if (convWin) convWin.setStyle({ width: "70vw" });

    // Aggiungi pulsante Copy nella btn-wrapper
    const container = convWin.getElement();
    if (container) {
        const btnWrapper = container.querySelector(".btn-wrapper");
        if (btnWrapper) {
            const copyBtn = document.createElement("button");
            copyBtn.className = "btn-copy tt-left";
            copyBtn.setAttribute("data-tt", "Copia");
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyBtn.onclick = () => _copyConversationAsync(copyBtn, messages);
            btnWrapper.insertBefore(copyBtn, btnWrapper.firstChild);
        }
    }
};

/**
 * Copia la conversazione negli appunti e mostra il feedback sul pulsante.
 * @param {HTMLElement} copyBtn - Pulsante copia.
 * @param {Array<Object>} messages - Messaggi della conversazione.
 */
const _copyConversationAsync = async function(copyBtn, messages) {
    try {
        const text = messages.map(m => {
            const role = m.role === "user" ? "Tu" : "Assistente";
            const line = `[${role}]\n${m.content}`;
            return line;
        }).join("\n\n");
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add("copied");
        setTimeout(() => copyBtn.classList.remove("copied"), COPIED_FEEDBACK_MS);
    } catch (err) {
        console.error("viewConversation.copy:", err);
    }
};

/**
 * Attiva una conversazione come attiva.
 * @param {number} id - Id della conversazione.
 */
const _selectConversationAsync = async function(id) {
    await SettingsMgr.setActiveConversationId(id);
    await showHtmlThread();
    wnds.winfo.close();
    UaLog.log(">>> Conversazione selezionata. <<<");
};

/**
 * Elimina una conversazione e i suoi messaggi dopo conferma.
 * @param {number} id - Id della conversazione.
 */
const _deleteConversationAsync = async function(id) {
    const conv = await ConversationMgr.get(id);
    const name = conv && conv.title ? conv.title : "Senza titolo";
    const convName = escapeHtml(name);
    if (!await confirm(`Eliminare la conversazione "${convName}" e tutti i suoi messaggi?`)) return;
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
    const editorTitle = isEdit ? "Modifica Prompt" : "Nuovo Prompt";
    jfh.append(`<h4>${editorTitle}</h4>`);
    jfh.append('<div class="ak-form">');
    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Nome</label></div></div>');
    const promptName = isEdit ? escapeHtml(prompt.name) : '';
    jfh.append(`<input type="text" id="prompt-inp-name" class="ak-input-key" value="${promptName}" placeholder="Nome del prompt">`);

    if (!isEdit) {
        _appendPromptExampleOptions(jfh);
    }

    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Contenuto</label></div></div>');
    jfh.append('<textarea id="prompt-inp-content" class="ak-input-key" rows="10" placeholder="Istruzioni per il modello"></textarea>');
    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<button class="ak-btn-add" onclick="wnds.handleSavePrompt()">Salva</button>');
    jfh.append('<button class="btn-danger ak-btn-del" onclick="wnds.winfo.close()">Annulla</button>');
    jfh.append('</div></div></div>');

    wnds.handleSavePrompt = () => _savePromptAsync(prompt, isEdit);
    wnds.handlePromptExample = _applyPromptExample;

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
 * Aggiunge il selettore dei prompt di sistema di esempio alla finestra editor.
 * @param {Object} jfh - Istanza UaJtfh della finestra editor.
 */
const _appendPromptExampleOptions = function(jfh) {
    jfh.append('<div class="ak-form-row"><div><label class="ak-label">Esempi</label></div></div>');
    jfh.append('<select id="prompt-inp-examples" class="ak-input-key" onchange="wnds.handlePromptExample(this.value)">');
    jfh.append('<option value="">— Scegli un prompt di sistema di esempio —</option>');
    PROMPT_EXAMPLES.forEach((example, index) => {
        const optionHtml = `<option value="${index}">${example.name}</option>`;
        jfh.append(optionHtml);
    });
    jfh.append('</select>');
};

/**
 * Salva il prompt di sistema letto dai campi della finestra editor.
 * @param {Object|null} prompt - Prompt in modifica o null per crearne uno nuovo.
 * @param {boolean} isEdit - True se si sta modificando un prompt esistente.
 */
const _savePromptAsync = async function(prompt, isEdit) {
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

/**
 * Applica un prompt di sistema di esempio ai campi della finestra editor.
 * @param {string|number} index - Indice dell'esempio scelto.
 */
const _applyPromptExample = function(index) {
    const exampleIndex = Number(index);
    const example = PROMPT_EXAMPLES[exampleIndex];
    if (!example) return;

    const nameInput = document.getElementById("prompt-inp-name");
    const contentInput = document.getElementById("prompt-inp-content");
    if (nameInput) nameInput.value = example.name;
    if (contentInput) contentInput.value = example.content;
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
            const promptName = escapeHtml(p.name);
            jfh.append(`<td>${promptName}${activeMark}</td>`);
            jfh.append('<td>');
            const actionLabel = isActive ? "Attivo" : "Attiva";
            jfh.append(`<button class="btn-success" onclick="wnds.activatePrompt(${p.id})">${actionLabel}</button>`);
            jfh.append(`<button class="btn-warning btn-ml5" onclick="wnds.editPrompt(${p.id})">Modifica</button>`);
            jfh.append(`<button class="btn-danger btn-ml5" onclick="wnds.deletePrompt(${p.id})">Elimina</button>`);
            jfh.append('</td></tr>');
        });
        jfh.append('</tbody></table>');
    }

    jfh.append('<div class="ak-form-row-inputs">');
    jfh.append('<button class="btn-success" onclick="wnds.newPrompt()">Nuovo Prompt</button>');
    jfh.append('</div></div>');

    wnds.activatePrompt = _activatePromptAsync;
    wnds.editPrompt = _editPromptAsync;
    wnds.deletePrompt = _deletePromptAsync;
    wnds.newPrompt = _newPrompt;

    wnds.winfo.show(jfh.html());
};

/**
 * Attiva un prompt di sistema come attivo.
 * @param {number} id - Id del prompt.
 */
const _activatePromptAsync = async function(id) {
    await PromptMgr.setActive(id);
    wnds.winfo.close();
    await _actionListPromptsAsync();
    UaLog.log(">>> Prompt di sistema selezionato. <<<");
};

/**
 * Apre l'editor per modificare un prompt di sistema esistente.
 * @param {number} id - Id del prompt.
 */
const _editPromptAsync = async function(id) {
    const prompt = await PromptMgr.get(id);
    if (prompt) _showPromptEditorAsync(prompt);
};

/**
 * Elimina un prompt di sistema dopo conferma.
 * @param {number} id - Id del prompt.
 */
const _deletePromptAsync = async function(id) {
    const prompt = await PromptMgr.get(id);
    const promptName = escapeHtml(prompt.name);
    if (!await confirm(`Eliminare il prompt "${promptName}"?`)) return;
    await PromptMgr.delete(id);
    wnds.winfo.close();
    await _actionListPromptsAsync();
    UaLog.log(">>> Prompt eliminato. <<<");
};

/**
 * Apre l'editor per creare un nuovo prompt di sistema.
 */
const _newPrompt = function() {
    _showPromptEditorAsync(null);
};

// ============================================================================
// API PUBBLICA - Windows (wnds)
// ============================================================================

export const wnds = {
    wdiv: null, winfo: null,
    init: function() {
        wnds.wdiv = _UaWindowFactory("id-wnd-div", "div-text", "wdiv", false);
        wnds.winfo = _UaWindowInfoFactory("id-wnd-info");
        window.wnds = wnds;
    },
    closeAll: function() {
        if (wnds.wdiv) wnds.wdiv.close();
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
        await clearAllTables();
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
            const ready = false;
            return ready;
        }
        const provider = config.provider;
        const apiKey = await getApiKey(provider);
        if (!apiKey) {
            await alert(`API key mancante per il provider "${provider}".\nAggiungere una chiave valida in Gestisci API Key.`);
            const ready = false;
            return ready;
        }
        const ready = true;
        return ready;
    },
    sendMessageAsync: async function() {
        if (!TextInput._inputEl) return;
        const query = TextInput._inputEl.value.trim();
        if (query.length === 0) { await alert("Inserisci una domanda."); return; }
        if (!await TextInput._checkProviderReady()) return;

        _Spinner.show();
        try {
            const rr = await ChatEngine.sendMessage(query);
            if (rr && rr.ok === false && rr.error && rr.error.code !== ERROR_CODE_CANCELLED) {
                const err = rr.error;
                const errMsg = formatErrorPrefix(err, "ERRORE CRITICO");
                await alert(errMsg);
            }
            await showHtmlThread();
            TextInput.clear();
        } catch (error) {
            if (error && error.code === ERROR_CODE_CANCELLED) return;
            const errCode = error.code ? `[${error.code}] ` : "";
            const errorText = error.message || error;
            await alert(`ERRORE CRITICO:\n${errCode}${errorText}`);
        } finally {
            _Spinner.hide();
        }
    }
};

// ============================================================================
// API PUBBLICA - Output e Cronologia (TextOutput)
// ============================================================================

export const TextOutput = {
    copyAsync: async function() {
        const outputEl = document.querySelector("#id-text-out .div-text");
        const rawText = outputEl ? outputEl.textContent.trim() : "";
        if (rawText.length < 2) return;
        try {
            await navigator.clipboard.writeText(textFormatter(rawText));
            const btn = document.getElementById("btn-copy-output");
            if (btn) { btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), COPIED_FEEDBACK_MS); }
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
        const emptyHtml = "";
        return emptyHtml;
    }

    const jfh = UaJtfh();

    jfh.append('<div class="provider-tree-header">')
       .append('  <span>Seleziona Modello</span>')
       .append('  <button class="provider-tree-close-btn tt-left" data-tt="Chiudi">&times;</button>')
       .append('</div>')
       .append('<ul class="provider-tree">');

    for (const providerName in providerConfig) {
        const provider = providerConfig[providerName];
        _appendProviderNode(jfh, providerName, provider, currentConfig);
    }

    jfh.append(`</ul>`);

    const treeHtml = jfh.html();
    return treeHtml;
};

/**
 * Aggiunge il nodo di un provider (intestazione e lista modelli) all'albero.
 * @param {Object} jfh - Istanza UaJtfh dell'albero.
 * @param {string} providerName - Nome del provider.
 * @param {Object} provider - Dati del provider {models}.
 * @param {Object} currentConfig - Configurazione attiva {provider, model}.
 */
const _appendProviderNode = function(jfh, providerName, provider, currentConfig) {
    const isActive = providerName === currentConfig.provider;
    const icon = isActive ? "&#9660;" : "&#9658;";
    const activeClass = isActive ? "active" : "";
    const visibleClass = isActive ? " model-list--visible" : "";

    jfh.append(`<li class="provider-node">`)
       .append(`  <span class="${activeClass}" data-provider="${providerName}">`)
       .append(`    ${icon} ${providerName}`)
       .append(`  </span>`)
       .append(`  <ul class="model-list${visibleClass}">`);

    _appendModelNodes(jfh, providerName, provider.models, isActive, currentConfig.model);

    jfh.append(`  </ul>`)
       .append(`</li>`);
};

/**
 * Aggiunge i nodi dei modelli di un provider all'albero.
 * @param {Object} jfh - Istanza UaJtfh dell'albero.
 * @param {string} providerName - Nome del provider.
 * @param {Object} models - Mappa modello → dati {windowSize}.
 * @param {boolean} isActive - True se il provider è quello attivo.
 * @param {string} activeModel - Modello attivo.
 */
const _appendModelNodes = function(jfh, providerName, models, isActive, activeModel) {
    Object.keys(models).forEach(function(modelName) {
        const modelData = models[modelName];
        const isActiveModel = isActive && modelName === activeModel;
        const activeModelClass = isActiveModel ? " active" : "";

        jfh.append(`    <li class="model-node${activeModelClass}"`)
           .append(`        data-provider="${providerName}"`)
           .append(`        data-model="${modelName}">`)
           .append(`      ${modelName} (${modelData.windowSize}k)`)
           .append(`    </li>`);
    });
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
 * Gestore della voce di menu "Aggiorna LLM".
 * Usa il modulo dedicato per scoprire e testare i modelli, salva in IndexedDB.
 */
const _actionLlmUpdateAsync = async function() {
    const menuBtn = document.getElementById("id-menu-btn");
    if (menuBtn) menuBtn.checked = false;
    document.body.classList.remove(CSS_MENU_OPEN);

    const proceed = await confirm("Avviare la procedura di Aggiorna LLM? Verranno scaricati e testati i modelli di ogni provider con chiave attiva.\n\nIl test può richiedere del tempo. Confermi?");
    if (!proceed) return;

    _waitSpinner.show();
    try {
        const results = await runLlmUpdate();

        const passed = results.filter(r => r.ok);

        if (results.length === 0) {
            _waitSpinner.hide();
            await alert("Aggiorna LLM: nessun provider con chiave API attiva. Aggiungere una chiave in Gestisci API Key e riprovare.");
            return;
        }

        _waitSpinner.hide();
        await alert(`Aggiorna LLM completato.\n\nScaricati e testati: ${results.length}\nSuperati il test: ${passed.length}`);
    } catch (error) {
        console.error("_actionLlmUpdateAsync:", error);
        _waitSpinner.hide();
        const errorText = error.message || error;
        await alert(`ERRORE durante l'aggiornamento LLM:\n${errorText}`);
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
        const errorText = error.message || error;
        await alert(`ERRORE durante il reset LLM:\n${errorText}`);
    }
};

// ============================================================================
// ASSOCIAZIONE EVENTI (Event Binding)
// ============================================================================

export const bindEventListener = function() {
    _bindActionButtons();
    _bindInputEvents();
    _bindDocBarEvents();
    _bindHelpPopups();
};

/**
 * Associa i pulsanti e le voci di menu alle azioni corrispondenti.
 */
const _bindActionButtons = function() {
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
};

/**
 * Associa gli eventi agli elementi di input (clear, text-input, menu).
 */
const _bindInputEvents = function() {
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
};

/**
 * Associa gli eventi della doc-bar (rimozione documento e persistenza).
 */
const _bindDocBarEvents = function() {
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

    setOnDocumentsChanged(async function(docs) {
        renderDocBar();
        const activeId = await SettingsMgr.getActiveConversationId();
        if (activeId) {
            ConversationMgr.saveDocuments(activeId, docs);
        }
    });
};

/**
 * Inizializza i tooltip informativi (HelpPopup) di pulsanti e voci di menu.
 */
const _bindHelpPopups = function() {
    // Header
    HelpPopup.bind("btn-help", "<strong>Help</strong><br>Apre il manuale utente con l'elenco dei comandi dell'app.");
    HelpPopup.bind("btn-readme", "<strong>README</strong><br>Apre la guida completa dell'applicazione in una nuova scheda.");
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
    HelpPopup.bind("menu-list-conversations", "<strong>Gestisci Conversazioni</strong><br>Elenca, visualizza, attiva o elimina le conversazioni salvate.");

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