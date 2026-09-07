<!-- @format -->

# agnochat: Chat LLM Pura, 100% Client-Side

**Versione:** 1.0.0

**agnochat** è un'applicazione web di chat con modelli linguistici (LLM) che opera interamente nel browser dell'utente. Nasce da RagIndex, da cui eredita layout, gestione provider/modelli/chiavi e librerie interne, lasciando fuori la pipeline RAG: nessuna indicizzazione, nessun worker — solo chat.

> 🚀 **Scopri di più**: per una presentazione delle funzionalità e dei caratteri originali del progetto, consulta la pagina [static/agnochat.html](static/agnochat.html).

## Setup Rapido

Essendo un'applicazione puramente statica, non richiede build system (Webpack, Vite, ecc.) né backend.

1. **Requisiti**: un qualsiasi web server statico (es: `python3 -m http.server`, `npx http-server .`, o l'estensione "Live Server" di VS Code), servito dalla root del progetto.
2. **Avvio**: apri il browser all'indirizzo locale della root — `index.html` redirige automaticamente a `static/index.html`.
3. **Configurazione API**:
    - Apri il menu laterale (☰).
    - Seleziona **"API Keys Default"** per caricare le chiavi di prova predefinite dal file locale `static/data/api_x.json` (solo a database vuoto).
    - Oppure seleziona **"Gestisci API Key"** per inserire la tua chiave personale (Gemini, Mistral, Groq, OpenRouter, Cerebras, SiliconFlow).
    > 🛡️ **Privacy**: le chiavi sono salvate esclusivamente nell'**IndexedDB** del tuo browser, mai nel codice né su server. La comunicazione AI avviene direttamente dal tuo computer al provider, senza intermediari.

## Caratteristiche Principali

- **Chat LLM pura**: componi messaggio + cronologia (+ eventuale prompt di sistema), invia al provider attivo, mostra la risposta. Niente RAG, niente complessità in più.
- **LLM-Agnostico**: il pacchetto `llmclient` astrae 6 provider dietro un'interfaccia unica, con cambio di provider/modello a runtime (hot-swap) senza ricaricare la pagina.
- **Catalogo modelli da dati locali**: provider e modelli sono descritti da `manifest.json` e file `.txt` in `static/data/models/` (con window size); la procedura *Aggiorna LLM* gestisce il repository dei modelli accettati e `llmlist` offre discovery live verso i provider.
- **Conversazioni persistenti**: creazione, elenco, ripristino della cronologia ed eliminazione su IndexedDB.
- **Prompt di sistema personalizzati**: crea, modifica, elimina e seleziona il prompt attivo da anteporre alle conversazioni.
- **Affidabilità**: retry automatico su errori transitori (408/500/502/503/504, max 3 tentativi), interruzione manuale delle richieste (stop) e gestione esplicita dei limiti di token.
- **Temi dark/light**: selezionabili e persistiti (default dark).
- **Telemetria minima**: eventi di apertura app e avvio conversazione verso il worker analytics WWWANALYZER (`UaSender` in `static/js/services/sender.js`; spec in `openspec/specs/analytics/spec.md`); invio automaticamente disattivato in ambiente locale (`localhost`/`file:`).

## Architettura del Codice

Tutto l'applicativo vive in `static/`:

- **Entry point**: `static/index.html` → `static/js/app.js` (inizializzazione, errori globali, sender eventi).
- **UI Controller**: `static/js/app_ui.js` (rendering thread con markdown, menu, gestione finestre ed eventi).
- **Core applicativo**: `app_mgr.js` (config/provider attivi), `chat_engine.js` (payload, retry, stop), `conversation_mgr.js` (conversazioni/messaggi), `prompt_mgr.js` (prompt di sistema), `settings_mgr.js` (preferenze persistenti).
- **LLM Clients**: `static/js/llmclient/` (6 provider: Gemini, Mistral, Groq, OpenRouter, Cerebras, SiliconFlow) + `llm_provider.js` (provider attivo, chiavi) + `llmlist/` (discovery modelli live) + `llm_updater.js` (repository modelli accettati).
- **Database Locale**: `static/js/services/idb_mgr.js` + `uadb.js` + `db_instance.js` (persistenza via Dexie.js; database `agnochat`: `conversations`, `messages`, `prompts`, `settings`).
- **Servizi**: `services/sender.js` (telemetria), `services/config.js` (flag ambiente locale), `services/key_retriever.js` (seed/gestione chiavi), librerie UA (`uajtfh.js`, `uawindow.js`, `uadrag.js`, `uadialog.js`, `ualog3.js`).
- **Vendor** (copie locali, nessun CDN): `dexie.js`, `marked.min.js`, `less.js`.
- **Stili**: `static/less/style.less` + `static/less/modules/` compilati a runtime da `less.js`.

