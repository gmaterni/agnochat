/**
 * document_processor.js - Estrazione testo da documenti (txt, md, pdf, docx, odt).
 *
 * Modulo puro: nessuna UI, nessun riferimento al DOM.
 * Espone processFile(file) che rileva il tipo e restituisce Promise<string>.
 *
 * @module document_processor
 * @version 1.0.0
 * @date    2026-08-24
 */

"use strict";

// Limite dimensione file (10 MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Tipi MIME supportati per validazione aggiuntiva
const SUPPORTED_MIME_TYPES = {
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.oasis.opendocument.text": [".odt"]
};

// Estensioni supportate (per rilevamento da nome file)
export const SUPPORTED_TYPES = [
  ".txt", ".md", ".markdown", ".pdf", ".docx", ".odt"
];

/**
 * Verifica se il tipo di file è supportato.
 * @param {File} file - File da verificare
 * @returns {boolean} True se supportato
 */
function isSupportedFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  return SUPPORTED_TYPES.includes(ext);
}

/**
 * Verifica la dimensione del file.
 * @param {File} file - File da verificare
 * @throws {Error} Se il file supera il limite
 */
function checkFileSize(file) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File troppo grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Limite: ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }
}

/**
 * Estrae testo da file .txt e .md usando FileReader.
 * @param {File} file - File di testo
 * @returns {Promise<string>} Contenuto del file
 */
async function extractText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Errore durante la lettura del file di testo"));
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * Estrae testo da file PDF usando pdfjs-dist.
 * @param {File} file - File PDF
 * @returns {Promise<string>} Testo estratto da tutte le pagine
 */
async function extractPdf(file) {
  // Import dinamico di pdfjs-dist
  const pdfjsLib = await import("pdfjs-dist/");
  
  // Configura il worker (usa quello di default da CDN)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText.trim();
}

/**
 * Estrae testo da file DOCX usando mammoth.
 * @param {File} file - File DOCX
 * @returns {Promise<string>} Testo estratto
 */
async function extractDocx(file) {
  const mammoth = await import("mammoth/");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/**
 * Estrae testo da file ODT usando odt-to-txt.
 * @param {File} file - File ODT
 * @returns {Promise<string>} Testo estratto
 */
async function extractOdt(file) {
  const odtToTxt = await import("odt-to-txt/");
  const arrayBuffer = await file.arrayBuffer();
  const text = await odtToTxt(arrayBuffer);
  return text.trim();
}

/**
 * Rileva il tipo di file e chiama l'estrattore appropriato.
 * @param {File} file - File da processare
 * @returns {Promise<string>} Testo estratto
 */
async function processFile(file) {
  if (!file) {
    throw new Error("Nessun file fornito");
  }
  
  checkFileSize(file);
  
  if (!isSupportedFile(file)) {
    const ext = file.name.split(".").pop().toLowerCase();
    throw new Error(`Tipo di file non supportato: .${ext}. Formati supportati: ${SUPPORTED_TYPES.join(", ")}`);
  }
  
  const ext = "." + file.name.split(".").pop().toLowerCase();
  
  try {
    switch (ext) {
      case ".txt":
      case ".md":
      case ".markdown":
        return await extractText(file);
      
      case ".pdf":
        return await extractPdf(file);
      
      case ".docx":
        return await extractDocx(file);
      
      case ".odt":
        return await extractOdt(file);
      
      default:
        throw new Error(`Estensione non gestita: ${ext}`);
    }
  } catch (error) {
    if (error.message.includes("troppo grande") || error.message.includes("non supportato")) {
      throw error;
    }
    console.error(`Errore estrazione ${ext}:`, error);
    throw new Error(`Impossibile estrarre il testo dal file ${file.name}: ${error.message}`);
  }
}

export default {
  processFile,
  SUPPORTED_TYPES,
  MAX_FILE_SIZE
};