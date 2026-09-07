/**
 * uploader.js - Upload documenti (TXT, MD, PDF, DOCX, ODT).
 *
 * Finestra di upload con drop-zone, drag & drop, file multipli
 * e handler lazy che caricano script vendor locali.
 *
 * I documenti estratti vengono memorizzati in un document store
 * e iniettati nel prompt al momento della richiesta (in chat_engine).
 * NON vengono inseriti nel textarea di input.
 *
 * @module uploader
 * @version 2.0.0
 */

"use strict";

import { UaWindowAdm } from "./services/uawindow.js";

// ============================================================================
// DOCUMENT STORE - Memoria per documenti caricati
// ============================================================================

/**
 * Document store per i documenti caricati.
 * Ogni documento: { fileName, content, ext, uploadedAt }
 */
const _documents = [];

/**
 * Callback invocata quando l'elenco documenti cambia.
 * @type {Function|null}
 */
let _onDocumentsChanged = null;

/**
 * Imposta il callback invocato quando l'elenco documenti cambia.
 * @param {Function|null} callback - Funzione ricevente l'array aggiornato.
 */
export function setOnDocumentsChanged(callback) {
    _onDocumentsChanged = callback;
}

/**
 * Sostituisce l'intero store con un array di documenti caricati da IndexedDB.
 * Non invoca il callback (usato al caricamento conversazione).
 * @param {Array<Object>} docs - Array di documenti.
 */
export function setDocuments(docs) {
    _documents.length = 0;
    if (Array.isArray(docs)) {
        _documents.push(...docs);
    }
}

/**
 * Aggiunge un documento allo store.
 * @param {string} fileName - Nome del file
 * @param {string} content - Testo estratto
 * @param {string} ext - Estensione
 * @returns {void}
 */
export function addDocument(fileName, content, ext) {
    _documents.push({
        fileName,
        content,
        ext,
        uploadedAt: Date.now()
    });
    if (_onDocumentsChanged) _onDocumentsChanged([..._documents]);
}

/**
 * Restituisce tutti i documenti caricati.
 * @returns {Array<Object>} Array di documenti
 */
export function getDocuments() {
    const docs = [..._documents];
    return docs;
}

/**
 * Svuota lo store documenti.
 * @returns {void}
 */
export function clearDocuments() {
    _documents.length = 0;
    if (_onDocumentsChanged) _onDocumentsChanged([]);
}

/**
 * Rimuove un documento per nome.
 * @param {string} fileName
 * @returns {boolean}
 */
export function removeDocument(fileName) {
    const idx = _documents.findIndex(d => d.fileName === fileName);
    if (idx >= 0) {
        _documents.splice(idx, 1);
        if (_onDocumentsChanged) _onDocumentsChanged([..._documents]);
        const removed = true;
        return removed;
    }
    const removed = false;
    return removed;
}

// ============================================================================
// COSTANTI
// ============================================================================

const WINDOW_ID = "id_upload";
const SUPPORTED_EXTENSIONS = ["txt", "md", "pdf", "docx", "odt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// UTILITÀ LETTURA TESTO
// ============================================================================

const FileReaderUtil = {
    readTextFile: function(file) {
        const readPromise = new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(new Error("Errore lettura file: " + (error.message || "")));
            reader.readAsText(file);
        });
        return readPromise;
    }
};

// ============================================================================
// HANDLER LAZY PER FORMATI SPECIFICI
// ============================================================================

class PdfHandler {
    constructor() {
        this.pdfjsLib = null;
        this.scriptElement = null;
        this.workerScriptElement = null;
    }

    async loadPdfJs() {
        if (window["pdfjs-dist/build/pdf"]) {
            this.pdfjsLib = window["pdfjs-dist/build/pdf"];
            return;
        }
        this.scriptElement = document.createElement("script");
        this.scriptElement.src = "js/services/vendor/pdf.min.js";
        document.body.appendChild(this.scriptElement);

        await new Promise(function(resolve, reject) {
            this.scriptElement.onload = () => {
                this.pdfjsLib = window["pdfjs-dist/build/pdf"];
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/services/vendor/pdf.worker.min.js";

                this.workerScriptElement = document.createElement("script");
                this.workerScriptElement.src = "js/services/vendor/pdf.worker.min.js";
                document.body.appendChild(this.workerScriptElement);
                this.workerScriptElement.onload = resolve;
                this.workerScriptElement.onerror = () => reject(new Error("Impossibile caricare pdf.worker.min.js"));
            };
            this.scriptElement.onerror = () => reject(new Error("Impossibile caricare pdf.min.js"));
        }.bind(this));
    }

    async extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item) => item.str).join(" ");
            text += pageText + "\n";
        }
        return text;
    }

    cleanup() {
        if (this.scriptElement) document.body.removeChild(this.scriptElement);
        if (this.workerScriptElement) document.body.removeChild(this.workerScriptElement);
        this.pdfjsLib = null;
    }
}

class DocxHandler {
    constructor() {
        this.mammoth = null;
        this.scriptElement = null;
    }

    async loadMammoth() {
        if (window["mammoth"]) {
            this.mammoth = window["mammoth"];
            return;
        }
        this.scriptElement = document.createElement("script");
        this.scriptElement.src = "js/services/vendor/mammoth.browser.min.js";
        document.body.appendChild(this.scriptElement);

        await new Promise(function(resolve, reject) {
            this.scriptElement.onload = () => {
                this.mammoth = window["mammoth"];
                resolve();
            };
            this.scriptElement.onerror = () => reject(new Error("Impossibile caricare mammoth.browser.min.js"));
        }.bind(this));
    }

    async extractTextFromDocx(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await this.mammoth.extractRawText({ arrayBuffer });
        const text = result.value;
        return text;
    }

    cleanup() {
        if (this.scriptElement) document.body.removeChild(this.scriptElement);
        this.mammoth = null;
    }
}

class OdtHandler {
    constructor() {
        this.jszip = null;
        this.scriptElement = null;
    }

    async loadJsZip() {
        if (window["JSZip"]) {
            this.jszip = window["JSZip"];
            return;
        }
        this.scriptElement = document.createElement("script");
        this.scriptElement.src = "js/services/vendor/jszip.min.js";
        document.body.appendChild(this.scriptElement);

        await new Promise(function(resolve, reject) {
            this.scriptElement.onload = () => {
                this.jszip = window["JSZip"];
                resolve();
            };
            this.scriptElement.onerror = () => reject(new Error("Impossibile caricare jszip.min.js"));
        }.bind(this));
    }

    async extractTextFromOdt(file) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await this.jszip.loadAsync(arrayBuffer);
        const contentXml = await zip.file("content.xml").async("string");

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(contentXml, "text/xml");
        const paragraphs = xmlDoc.getElementsByTagName("text:p");

        const text = Array.from(paragraphs).map((p) => p.textContent).join("\n");
        return text;
    }

    cleanup() {
        if (this.scriptElement) document.body.removeChild(this.scriptElement);
        this.jszip = null;
    }
}

// ============================================================================
// UPLOADER
// ============================================================================

/**
 * Costruisce l'HTML della finestra di upload.
 * @returns {string} HTML della finestra.
 */
const _buildUploadHtml = function() {
    const htmlContent = `
      <div class="window-text">
        <div class="btn-wrapper">
         <button class="btn-close tt-left " data-tt="Chiudi">X</button>
        </div>
        <div class="upload-dialog-content">
          <p class="upload-description">Trascina uno o più file (testo, PDF, DOCX, ODT) o clicca per selezionarli. Il contenuto verrà aggiunto al contesto del prompt.</p>

          <div id="drop-zone" class="drop-zone">
            <p id="drop-zone-text">Trascina i file qui o clicca per selezionare</p>
            <input type="file" id="id_fileupload" multiple>
          </div>

          <div id="progress-container">
            <div>
              <div id="progress-bar"></div>
            </div>
            <p id="progress-text">0 / 0 file processati</p>
          </div>
          <div id="file-list-container"></div>
        </div>
      </div>
    `;
    return htmlContent;
};

/**
 * Raccoglie i file trascinati (con supporto directory) dalla drop-zone.
 * @param {DataTransfer} dataTransfer - Dati del trascinamento.
 * @returns {Promise<Array<Object>>} File raccolti.
 */
const _collectDroppedFilesAsync = async function(dataTransfer) {
    const items = dataTransfer.items;
    const files = [];

    if (items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) {
                await documentUploader.traverseFileTree(item, files);
            }
        }
    } else {
        for (const file of dataTransfer.files) {
            files.push(file);
        }
    }

    return files;
};

/**
 * Associa gli eventi di drag & drop alla drop-zone.
 * @param {HTMLElement} dropZone - Elemento drop-zone.
 * @param {HTMLElement} fileInput - Input file nascosto.
 */
const _bindDropZoneEvents = function(dropZone, fileInput) {
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");

        const files = await _collectDroppedFilesAsync(e.dataTransfer);

        if (files.length > 0) {
            await documentUploader.handleMultipleFiles(files);
        }
    });
};

/**
 * Associa l'evento di selezione file all'input file.
 * @param {HTMLElement} fileInput - Input file.
 */
const _bindFileInputEvent = function(fileInput) {
    fileInput.addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            await documentUploader.handleMultipleFiles(files);
        }
    });
};

/**
 * Aggiorna la barra di avanzamento del caricamento.
 * @param {HTMLElement} progressBar - Barra di avanzamento.
 * @param {HTMLElement} progressText - Testo dell'avanzamento.
 * @param {number} index - Indice del file corrente (0-based).
 * @param {number} total - Numero totale di file.
 */
const _updateProgress = function(progressBar, progressText, index, total) {
    const percentage = Math.round(((index + 1) / total) * 100);
    progressText.textContent = (index + 1) + " / " + total + " file processati";
    progressBar.style.width = percentage + "%";
    progressBar.textContent = percentage + "%";
};

/**
 * Filtra i file mantenendo solo quelli con estensione supportata.
 * @param {Array<Object>} files - File selezionati dall'utente.
 * @returns {Array<Object>} File con estensione supportata.
 */
const _filterValidFiles = function(files) {
    const validFiles = files.filter((file) => {
        const ext = file.name.split(".").pop().toLowerCase();
        const isSupported = SUPPORTED_EXTENSIONS.includes(ext);
        return isSupported;
    });
    return validFiles;
};

/**
 * Processa i file validi uno a uno aggiornando le statistiche.
 * @param {Array<Object>} files - File validi da processare.
 * @param {Object} stats - Statistiche {total, success, errors, errorFiles}.
 * @param {HTMLElement} progressBar - Barra di avanzamento.
 * @param {HTMLElement} progressText - Testo dell'avanzamento.
 */
const _processFilesAsync = async function(files, stats, progressBar, progressText) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        _updateProgress(progressBar, progressText, i, stats.total);

        const result = await documentUploader.handleFile(file);

        if (result.status === "success") {
            stats.success++;
        } else if (result.status === "error") {
            stats.errors++;
            stats.errorFiles.push({ name: file.name, error: result.error });
        }
    }
};

export const documentUploader = {
    dragoverHandler: null,
    dropHandler: null,

    open() {
        const htmlContent = _buildUploadHtml();

        const uploadWindow = UaWindowAdm.create(WINDOW_ID);
        uploadWindow.drag();
        uploadWindow.setZ(12);
        uploadWindow.vw_vh().setXY(16.5, 5, -1);
        uploadWindow.addClassStyle("upload-window");
        uploadWindow.setHtml(htmlContent);

        const winEl = document.getElementById(WINDOW_ID);
        const closeBtn = winEl.querySelector(".btn-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => documentUploader.close());
        }

        uploadWindow.show();

        const dropZone = document.getElementById("drop-zone");
        const fileInput = document.getElementById("id_fileupload");
        const fileListContainer = document.getElementById("file-list-container");
        const progressContainer = document.getElementById("progress-container");

        fileListContainer.innerHTML = "";
        progressContainer.style.display = "none";

        _bindDropZoneEvents(dropZone, fileInput);
        _bindFileInputEvent(fileInput);

        this.dragoverHandler = (e) => e.preventDefault();
        this.dropHandler = (e) => e.preventDefault();
        window.addEventListener("dragover", this.dragoverHandler);
        window.addEventListener("drop", this.dropHandler);
    },

    async traverseFileTree(item, files) {
        if (item.isFile) {
            const filePromise = new Promise((resolve) => {
                item.file((file) => {
                    files.push(file);
                    resolve();
                });
            });
            return filePromise;
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const entriesPromise = new Promise((resolve) => {
                dirReader.readEntries(async (entries) => {
                    for (const entry of entries) {
                        await this.traverseFileTree(entry, files);
                    }
                    resolve();
                });
            });
            return entriesPromise;
        }
    },

    async handleMultipleFiles(files) {
        const validFiles = _filterValidFiles(files);

        if (validFiles.length === 0) {
            await alert("Nessun file valido trovato. Formati supportati: .txt, .md, .pdf, .docx, .odt");
            return;
        }

        const unsupportedCount = files.length - validFiles.length;
        if (unsupportedCount > 0) {
            console.debug(unsupportedCount + " file ignorati (formato non supportato)");
        }

        const progressContainer = document.getElementById("progress-container");
        const progressBar = document.getElementById("progress-bar");
        const progressText = document.getElementById("progress-text");

        progressContainer.style.display = "block";

        const stats = {
            total: validFiles.length,
            success: 0,
            errors: 0,
            errorFiles: []
        };

        await _processFilesAsync(validFiles, stats, progressBar, progressText);

        progressText.textContent = stats.success + " documenti aggiunti al contesto, " + stats.errors + " errori";
        progressBar.style.width = "100%";

        if (stats.errors === 0) {
            setTimeout(() => {
                progressContainer.style.display = "none";
            }, 2500);
        }
    },

    handleFile(file) {
        const fileName = file.name;
        const fileListContainer = document.getElementById("file-list-container");

        if (file.size > MAX_FILE_SIZE) {
            const err = "File troppo grande (limite 10 MB)";
            const fileItem = document.createElement("div");
            fileItem.className = "file-list-item error";
            fileItem.textContent = fileName + " - " + err;
            fileListContainer.appendChild(fileItem);
            const errorResult = Promise.resolve({ status: "error", error: err, fileName });
            return errorResult;
        }

        const fileExtension = file.name.split(".").pop().toLowerCase();

        const result = (async function() {
            let text;
            try {
                if (fileExtension === "pdf") {
                    const pdfHandler = new PdfHandler();
                    await pdfHandler.loadPdfJs();
                    text = await pdfHandler.extractTextFromPDF(file);
                    pdfHandler.cleanup();
                } else if (fileExtension === "txt" || fileExtension === "md") {
                    text = await FileReaderUtil.readTextFile(file);
                } else if (fileExtension === "docx") {
                    const docxHandler = new DocxHandler();
                    await docxHandler.loadMammoth();
                    text = await docxHandler.extractTextFromDocx(file);
                    docxHandler.cleanup();
                } else if (fileExtension === "odt") {
                    const odtHandler = new OdtHandler();
                    await odtHandler.loadJsZip();
                    text = await odtHandler.extractTextFromOdt(file);
                    odtHandler.cleanup();
                } else {
                    throw new Error("Formato non supportato");
                }

                const cleanedText = text ? text.trim() : "";
                if (!cleanedText) {
                    throw new Error("Il documento non contiene testo leggibile.");
                }

                addDocument(fileName, cleanedText, fileExtension);

                const fileItem = document.createElement("div");
                fileItem.className = "file-list-item success";
                fileItem.textContent = fileName + " - Aggiunto al contesto";
                fileListContainer.appendChild(fileItem);

                const successResult = { status: "success", fileName };
                return successResult;
            } catch (error) {
                const errorMsg = error.message || "Errore sconosciuto";
                console.error("uploader.handleFile:", errorMsg);

                const fileItem = document.createElement("div");
                fileItem.className = "file-list-item error";
                fileItem.textContent = fileName + " - " + errorMsg;
                fileListContainer.appendChild(fileItem);

                const errorResult = { status: "error", error: errorMsg, fileName };
                return errorResult;
            }
        })();
        return result;
    },

    close() {
        window.removeEventListener("dragover", this.dragoverHandler);
        window.removeEventListener("drop", this.dropHandler);
        this.dragoverHandler = null;
        this.dropHandler = null;
        UaWindowAdm.close(WINDOW_ID);
    }
};