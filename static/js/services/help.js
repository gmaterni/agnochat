/** @format */
"use strict";

/**
 * HTML per la finestra di aiuto dei comandi (Help).
 * Descrive l'interfaccia e le funzioni dell'app di chat.
 */
export const help0_html = `
<div class="text">
    <p class="center help-title">Elenco Comandi vanillallm</p>

    <p class="center help-subtitle">
        Passa il mouse su ogni comando per un aiuto contestuale.
    </p>

    <div>
        <strong class="help-section-title">Barra Superiore (Header)</strong>
        <div class="help-grid">
            <strong>Icona Menu</strong> <span>Apre il menu laterale con le sezioni Conversazioni, Prompt di Sistema, LLM e Reset.</span>
            <strong>Help</strong> <span>Apre questa finestra con l'elenco completo dei comandi.</span>
            <strong>README</strong> <span>Apre la guida completa dell'applicazione in una nuova scheda.</span>
            <strong>LLM</strong> <span>Sceglie il provider AI (Gemini, Mistral, Groq, OpenRouter, ecc.) e il modello.</span>
            <strong>Log</strong> <span>Mostra la console tecnica con i messaggi di errore e di sistema.</span>
            <strong>Tema</strong> <span>Alterna tra tema scuro e tema chiaro.</span>
        </div>
    </div>

    <hr>

    <div>
        <strong class="help-section-title">Pulsanti di Controllo</strong>
        <div class="help-grid">
            <strong>Cancella Input</strong> <span>Elimina il testo nella casella di input.</span>
            <strong>Copia Output</strong> <span>Copia il contenuto del thread negli appunti.</span>
            <strong>Invia (Verde)</strong> <span>Invia la domanda al modello attivo mantenendo la memoria della conversazione.</span>
        </div>
    </div>

    <hr>

    <div>
        <strong class="help-section-title">Menu Laterale &mdash; Conversazioni</strong>
        <div class="help-grid">
            <strong>Nuova Conversazione</strong> <span>Crea una nuova conversazione vuota e la attiva.</span>
            <strong>Gestisci Conversazioni</strong> <span>Elenca, visualizza, attiva o elimina le conversazioni salvate.</span>
        </div>
    </div>

    <div>
        <strong class="help-section-title">Menu Laterale &mdash; Prompt di Sistema</strong>
        <div class="help-grid">
            <strong>Nuovo System Prompt</strong> <span>Crea un prompt di sistema personalizzato con nome e contenuto.</span>
            <strong>Gestisci System Prompt</strong> <span>Elenca, modifica, seleziona o elimina i prompt di sistema.</span>
        </div>
    </div>

    <div>
        <strong class="help-section-title">Menu Laterale &mdash; LLM</strong>
        <div class="help-grid">
            <strong>Seleziona LLM</strong> <span>Apre l'elenco dei modelli scaricati per aggiornare l'albero di scelta LLM.</span>
            <strong>Reset Api Keys</strong> <span>Ripristina le chiavi API predefinite.</span>
            <strong>Gestisci API Key</strong> <span>Aggiungi, attiva o elimina le tue chiavi API personali.</span>
        </div>
    </div>

    <div>
        <strong class="help-section-title">Menu Laterale &mdash; Sistema</strong>
        <div class="help-grid-last">
            <strong>Aiuto</strong> <span>Apre questa finestra con l'elenco completo dei comandi.</span>
            <strong>Reset</strong> <span>Cancella TUTTI i dati: conversazioni, messaggi, prompt, chiavi API e configurazione. Due conferme richieste.</span>
        </div>
    </div>
</div>
`;