/**
 * llm-selection.js - Finestra modale "Seleziona LLM" stile window-info.
 *
 * Carica lo stato corrente (selected-models), mostra provider con checkbox
 * per selezione multipla, evidenzia le righe selezionate e aggiorna subito
 * l'albero LLM dopo Salva/Aggiungi.
 *
 * @module llm/llm-selection
 * @version 4.0.0
 */

"use strict";

import { UaWindowAdm } from "vanillallm/services/uawindow.js";
import { UaJtfh } from "vanillallm/services/uajtfh.js";
import { UaLog } from "vanillallm/services/ualog3.js";
import { LlmProvider } from "vanillallm/llm_provider.js";
import { updateActiveModelDisplay, refreshProviderTree } from "vanillallm/app_ui.js";

/**
 * Crea la finestra di selezione LLM stile window-info.
 * @param {Object} db - Istanza del database (da createLlmDB())
 * @returns {Object} API: { show() }
 */
export const createLlmSelectionWindow = function(db) {
    let _windowId = "llm-selection-window";

    /**
     * Mostra la finestra modale con tabella LLM compatta.
     */
    const show = async function() {
        let discovered = [];
        let providerConfig = {};
        let selected = [];

        try {
            discovered = await db.getDiscovered();
            providerConfig = LlmProvider.getProviderConfig ? LlmProvider.getProviderConfig() : {};
            selected = await db.getSelected();
        } catch (error) {
            console.error("createLlmSelectionWindow.show:", error);
            UaLog.log("ERRORE: Impossibile leggere i modelli scoperti.");
        }

        // Set dei modelli già selezionati (id = provider:model)
        const selectedIds = new Set();
        for (const m of selected) {
            const id = m.provider + ":" + m.model;
            selectedIds.add(id);
        }

        // Mappa modelli scoperti per arricchire il salvataggio con windowSize/name/vote
        const discoveredMap = {};
        for (const m of discovered) {
            const id = m.provider + ":" + m.model;
            discoveredMap[id] = m;
        }

        const jfh = UaJtfh();

        const providerSet = new Set();
        for (const m of discovered) {
            providerSet.add(m.provider);
        }
        for (const p of Object.keys(providerConfig)) {
            providerSet.add(p);
        }
        const providers = Array.from(providerSet);

        jfh.append('<div class="window-info">');

        // Header con close button e pulsanti azione
        const ttSave = "Salva: sostituisce completamente la selezione corrente con i modelli selezionati";
        const ttAdd = "Aggiungi: unisce i modelli selezionati a quelli gi\u00E0 presenti nell'albero (non rimuove quelli esistenti)";
        const ttCancel = "Annulla: chiude la finestra senza modifiche";
        jfh.append('<div class="btn-wrapper llm-btn-wrapper">');
        jfh.append('<span class="llm-header-btns">');
        jfh.append("<button class=\"btn-success tt-left\" data-tt=\"" + ttSave + "\" onclick=\"llmSelectionSave()\">Salva</button>");
        jfh.append("<button class=\"btn-yellow tt-left\" data-tt=\"" + ttAdd + "\" onclick=\"llmSelectionAdd()\">Aggiungi</button>");
        jfh.append("<button class=\"btn-danger tt-left\" data-tt=\"" + ttCancel + "\" onclick=\"llmSelectionCancel()\">Annulla</button>");
        jfh.append('</span>');
        jfh.append('<button class="btn-close tt-left" data-tt="Chiudi" onclick="llmSelectionCancel()">X</button>');
        jfh.append('</div>');

        // Contenuto scrollabile
        jfh.append('<div class="div-info llm-select-content">');

        if (providers.length === 0) {
            jfh.append("<p>Nessun modello disponibile. Esegui prima \"Aggiorna LLM\".</p>");
        } else {
            // Raccolta di tutti i modelli in una lista piatta.
            // Vengono scartati gli LLM che non hanno superato il test
            // (nessun voto valido: voto nullo/assente o inferiore a 6).
            const MIN_VOTE = 6;
            const allModels = [];
            for (const providerName of providers) {
                const models = discovered.filter(function(m) {
                    const hasValidVote = m.vote !== null && m.vote !== undefined && m.vote >= MIN_VOTE;
                    return m.provider === providerName && hasValidVote;
                });
                for (const m of models) {
                    allModels.push({
                        provider: providerName,
                        model: m.model,
                        name: m.name,
                        windowSize: m.windowSize,
                        elapsedMs: m.elapsedMs,
                        vote: m.vote
                    });
                }
            }

            if (allModels.length === 0) {
                jfh.append("<p>Nessun modello scoperto.</p>");
            } else {
                // Ordina: prima per provider, poi per nome modello
                allModels.sort(function(a, b) {
                    const byProvider = a.provider.localeCompare(b.provider);
                    if (byProvider !== 0) return byProvider;
                    return a.model.localeCompare(b.model);
                });

                // Raggruppa per provider
                const byProvider = {};
                for (const m of allModels) {
                    if (!byProvider[m.provider]) byProvider[m.provider] = [];
                    byProvider[m.provider].push(m);
                }

                // Tabella compatta 4 colonne con header provider.
                // Header separato e fisso + corpo scrollabile in due tabelle
                // con la stessa larghezza di colonne (table-layout fixed).
                const HEADER_COLS = '<col style="width: 68%;"><col style="width: 8%;"><col style="width: 12%;"><col style="width: 10%;">';

                jfh.append('<div class="llm-scroll-wrap">');
                jfh.append('<table class="table-data llm-select-table llm-select-head">');
                jfh.append(HEADER_COLS);
                jfh.append('<thead><tr>');
                jfh.append('<th data-tt="LLM">LLM</th>');
                jfh.append('<th class="tt-left" data-tt="Voto (6-10): punteggio qualità basato su velocità e completezza risposta">V</th>');
                jfh.append('<th class="tt-left" data-tt="Tempo di risposta in secondi">T</th>');
                jfh.append('<th class="tt-left" data-tt="Dimensione finestra di contesto in migliaia di token (k)">W</th>');
                jfh.append('</tr></thead>');
                jfh.append('</table>');

                jfh.append('<div class="llm-scroll-body">');
                jfh.append('<table class="table-data llm-select-table">');
                jfh.append(HEADER_COLS);
                jfh.append('<tbody>');

                for (const providerName of Object.keys(byProvider).sort()) {
                    const models = byProvider[providerName];
                    const providerId = providerName + ":all";
                    // Riga provider (spans all columns) con flag selezione
                    jfh.append('<tr class="llm-provider-row" data-provider="' + providerName + '">');
                    jfh.append('<td colspan="4" class="llm-provider-cell">');
                    jfh.append('  <label class="llm-provider-label">');
                    jfh.append('    <input type="checkbox" class="llm-provider-check" data-provider="' + providerName + '">');
                    jfh.append('    <b>' + providerName + '</b>');
                    jfh.append('  </label>');
                    jfh.append('</td>');
                    jfh.append('</tr>');

                    for (const m of models) {
                        const label = m.name ? m.model + " (" + m.name + ")" : m.model;
                        const windowSize = m.windowSize ? m.windowSize : "-";
                        const elapsedMs = m.elapsedMs ? (m.elapsedMs / 1000).toFixed(1) + "s" : "-";
                        const vote = (m.vote !== undefined && m.vote !== null) ? m.vote : "-";
                        const providerModel = m.provider + ":" + m.model;
                        const checkedAttr = selectedIds.has(providerModel) ? "checked" : "";
                        const selectedClass = selectedIds.has(providerModel) ? " selected" : "";

                        jfh.append('<tr class="llm-row' + selectedClass + '" data-provider-model="' + providerModel + '">');
                        jfh.append('  <td class="llm-name-cell">');
                        jfh.append('    <label class="llm-row-label">');
                        jfh.append('      <input type="checkbox" class="llm-model-check" data-provider-model="' + providerModel + '" data-provider="' + m.provider + '" data-model="' + m.model + '" ' + checkedAttr + '>');
                        jfh.append('      <span class="llm-name-text">' + label + '</span>');
                        jfh.append('    </label>');
                        jfh.append('  </td>');
                        jfh.append('  <td class="llm-vote-cell">' + vote + '</td>');
                        jfh.append('  <td class="llm-time-cell">' + elapsedMs + '</td>');
                        jfh.append('  <td class="llm-window-cell">' + windowSize + '</td>');
                        jfh.append('</tr>');
                    }
                }

                jfh.append('</tbody></table>');
                jfh.append('</div>'); // .llm-scroll-body
                jfh.append('</div>'); // .llm-scroll-wrap
            }
        }

        jfh.append("</div>"); // .div-info

        jfh.append("</div>"); // .window-info

        // Crea finestra stile window-info (simile a Gestione API Key)
        const win = UaWindowAdm.create(_windowId);
        win.drag().setZ(12);
        win.setHtml(jfh.html());
        win.vw_vh().setXY(24, 6, -1);
        win.show();

        // Calcola altezza massima = output + input (container) senza aggiunte.
        // La finestra parte sotto la barra menu: max = bottom container - top finestra.
        const winEl = win.getElement();
        if (winEl) {
            winEl.style.width = "62vw";
            winEl.style.maxWidth = "89vw";
            winEl.style.overflow = "hidden";

            const container = document.querySelector(".container");
            const winRect = winEl.getBoundingClientRect();
            const containerRect = container ? container.getBoundingClientRect() : null;
            let maxH = 0;
            if (containerRect) {
                maxH = containerRect.bottom - winRect.top;
            } else {
                maxH = window.innerHeight - winRect.top;
            }
            const targetH = Math.max(120, maxH);

            // Imposta l'altezza massima sul window e un'altezza effettiva
            // sul contenuto interno (.window-info) così il body scrolla.
            winEl.style.height = targetH + "px";
            winEl.style.maxHeight = targetH + "px";

            const inner = winEl.querySelector(".window-info");
            if (inner) {
                inner.style.height = targetH + "px";
                inner.style.maxHeight = targetH + "px";
            }

            // Adatta l'altezza al contenuto: se il corpo della tabella è più corto del
            // limite (pochi modelli), usa l'altezza naturale; se è più lungo,
            // usa il limite e il body scrolla.
            const bodyEl = winEl.querySelector(".llm-scroll-body");
            const headEl = winEl.querySelector(".llm-select-head");
            const btnsEl = winEl.querySelector(".llm-btn-wrapper");
            const bodyNaturalH = bodyEl ? bodyEl.scrollHeight : 0;
            const headH = headEl ? headEl.getBoundingClientRect().height : 0;
            const btnsH = btnsEl ? btnsEl.getBoundingClientRect().height : 0;
            const naturalH = btnsH + headH + bodyNaturalH + 2;
            const finalH = Math.min(naturalH, targetH);
            winEl.style.height = finalH + "px";
            if (inner) {
                inner.style.height = finalH + "px";
                inner.style.maxHeight = targetH + "px";
            }

            // Gestione selezione riga con evidenziazione
            winEl.querySelectorAll(".llm-model-check").forEach(function(cb) {
                cb.addEventListener("change", function() {
                    const row = cb.closest(".llm-row");
                    if (row) {
                        row.classList.toggle("selected", cb.checked);
                    }
                    _syncProviderCheckbox(winEl, cb.dataset.provider);
                });
            });

            // Gestione flag provider: seleziona/deseleziona tutti i suoi modelli
            winEl.querySelectorAll(".llm-provider-check").forEach(function(cb) {
                cb.addEventListener("change", function() {
                    const providerName = cb.dataset.provider;
                    const modelCbs = winEl.querySelectorAll('.llm-model-check[data-provider="' + providerName + '"]');
                    modelCbs.forEach(function(modelCb) {
                        modelCb.checked = cb.checked;
                        const row = modelCb.closest(".llm-row");
                        if (row) {
                            row.classList.toggle("selected", cb.checked);
                        }
                    });
                });
            });

            // Sincronizza lo stato iniziale dei flag provider
            winEl.querySelectorAll(".llm-provider-check").forEach(function(cb) {
                _syncProviderCheckbox(winEl, cb.dataset.provider);
            });
        }

        /**
         * Raccoglie i modelli selezionati con dati completi da discoveredMap.
         * @returns {Array<Object>}
         */
        const _collectSelected = function() {
            const winEl = UaWindowAdm.get(_windowId).getElement();
            if (!winEl) return [];

            const collected = [];
            winEl.querySelectorAll(".llm-model-check").forEach(function(cb) {
                if (cb.checked) {
                    const providerModel = cb.dataset.provider + ":" + cb.dataset.model;
                    const full = discoveredMap[providerModel] || {};
                    collected.push({
                        provider: cb.dataset.provider,
                        model: cb.dataset.model,
                        name: full.name,
                        windowSize: full.windowSize,
                        elapsedMs: full.elapsedMs,
                        vote: full.vote
                    });
                }
            });
            return collected;
        };

        window.llmSelectionSave = async function() {
            const selectedModels = _collectSelected();
            const count = selectedModels.length;

            const proceed = await confirm("Salva: sostituire completamente la selezione corrente con i " + count + " modelli selezionati?");
            if (!proceed) return;

            try {
                await db.saveSelected(selectedModels);
                await _applySelection();
            } catch (error) {
                console.error("llmSelectionSave:", error);
                UaLog.log("ERRORE: Salvataggio selezione LLM fallito.");
                await alert("ERRORE: Salvataggio selezione LLM fallito.");
                return;
            }

            UaWindowAdm.get(_windowId).close();
            UaLog.log(">>> Selezione LLM salvata (sostituzione): " + count + " modelli. <<<");
            await alert("Salvataggio completato: " + count + " modelli selezionati.");
        };

        window.llmSelectionAdd = async function() {
            const selectedModels = _collectSelected();

            if (selectedModels.length === 0) {
                alert("Nessun modello selezionato da aggiungere.");
                return;
            }

            const proceed = await confirm("Aggiungi: unire i " + selectedModels.length + " modelli selezionati a quelli già presenti nell'albero?");
            if (!proceed) return;

            try {
                await db.addSelected(selectedModels);
                await _applySelection();
            } catch (error) {
                console.error("llmSelectionAdd:", error);
                UaLog.log("ERRORE: Aggiunta modelli alla selezione fallita.");
                await alert("ERRORE: Aggiunta modelli alla selezione fallita.");
                return;
            }

            UaWindowAdm.get(_windowId).close();
            UaLog.log(">>> Modelli aggiunti alla selezione LLM: " + selectedModels.length + ". <<<");
            await alert("Aggiunta completata: " + selectedModels.length + " modelli aggiunti all'albero.");
        };

        window.llmSelectionCancel = function() {
            UaWindowAdm.get(_windowId).close();
        };
    };

    /**
     * Sincronizza il flag del provider in base ai suoi modelli.
     * @param {HTMLElement} container
     * @param {string} providerName
     */
    const _syncProviderCheckbox = function(container, providerName) {
        const providerCb = container.querySelector('.llm-provider-check[data-provider="' + providerName + '"]');
        if (!providerCb) return;

        const modelCbs = container.querySelectorAll('.llm-model-check[data-provider="' + providerName + '"]');
        let checkedCount = 0;
        modelCbs.forEach(function(cb) {
            if (cb.checked) checkedCount++;
        });

        providerCb.checked = modelCbs.length > 0 && checkedCount === modelCbs.length;
        providerCb.indeterminate = checkedCount > 0 && checkedCount < modelCbs.length;
    };

    /**
     * Ricarica il catalogo modelli, applica il filtro della selezione
     * corrente salvata in IndexedDB, aggiorna il display del modello attivo
     * e l'albero LLM se aperto.
     */
    const _applySelection = async function() {
        await LlmProvider.loadModels();

        const selected = await db.getSelected();
        if (selected && selected.length > 0) {
            LlmProvider.ensureSelectedModels(selected);
            LlmProvider.applySelectionFilter(selected);
        }

        LlmProvider.validateActive();
        updateActiveModelDisplay();
        refreshProviderTree();
    };

    return { show };
};

export default { createLlmSelectionWindow };