# agnochat — Architettura dell'Applicazione

**Versione:** 1.0.0
**Data:** 2026-09-02

---

## 1. Identità del Progetto

**agnochat** è un'applicazione di chat LLM 100% client-side, senza backend, senza build system, senza dipendenze npm. Interfaccia in italiano, codice JavaScript ES2020+, stili LESS compilati a runtime nel browser.

---

## 2. Struttura delle Directory

```
agnochat/
├── index.html                          # Reindirizzamento → static/index.html
├── README.md
├── openspec/                           # OpenSpec (specifiche e change management)
├── docs/                               # Documentazione
└── static/
    ├── index.html                      # ENTRY POINT PRINCIPALE
    ├── agnochat.html                   # Landing page marketing
    ├── README.html                     # README come HTML
    ├── favicon.ico
    ├── data/
    │   ├── api_x.json                  # Chiavi API seed (offuscate)
    │   └── models/                     # Cataloghi modelli per provider
    │       ├── cerebras.txt
    │       ├── gemini.txt
    │       ├── groq.txt
    │       ├── mistral.txt
    │       └── openrouter.txt
    ├── js/                             # Tutto il JavaScript applicativo
    │   ├── app.js                      # Entry point, bootstrapper
    │   ├── app_mgr.js                  # Gestore configurazione app
    │   ├── app_ui.js                   # Controller UI (1426 righe)
    │   ├── chat_engine.js              # Costruttore payload + retry
    │   ├── conversation_mgr.js         # CRUD conversazioni/messaggi
    │   ├── llm_provider.js             # Stato provider + factory client
    │   ├── llm_updater.js              # Discovery + test + voto modelli
    │   ├── prompt_mgr.js               # CRUD prompt di sistema
    │   ├── settings_mgr.js             # Persistenza impostazioni
    │   ├── uploader.js                 # Upload documenti
    │   ├── commands/
    │   │   ├── update-llm.js           # Comando "Aggiorna LLM"
    │   │   └── reset-llm.js            # Comando "Reset LLM"
    │   ├── llm/
    │   │   ├── llm-catalog.js          # Lettura cataloghi locali
    │   │   ├── llm-db.js               # IndexedDB modelli LLM
    │   │   ├── llm-logging.js          # Logger formattato
    │   │   ├── llm-selection.js        # UI selezione modelli
    │   │   └── test-prompts.js         # Prompt di test
    │   ├── llmclient/                  # Astrazione provider LLM
    │   │   ├── base_client.js          # Classe astratta base
    │   │   ├── gemini_client.js        # Google Gemini
    │   │   ├── mistral_client.js       # Mistral AI
    │   │   ├── groq_client.js          # Groq
    │   │   ├── openrouter_client.js    # OpenRouter
    │   │   ├── cerebras_client.js      # Cerebras
    │   │   ├── siliconflow_client.js   # SiliconFlow
    │   │   └── models.js              # Modelli dati + validatori
    │   ├── llmlist/                    # Discovery modelli live
    │   │   ├── index.js                # Dispatcher fetcher
    │   │   ├── fetcher.js              # Classe base ModelFetcher
    │   │   └── fetcher_*.js            # Fetcher per provider
    │   └── services/                   # Libreria interna "UA toolkit"
    │       ├── config.js               # Rilevamento ambiente
    │       ├── data_keys.js            # Costanti chiavi storage
    │       ├── db_instance.js          # Istanza Dexie.js
    │       ├── key_retriever.js        # Gestione chiavi API
    │       ├── sender.js               # Telemetria analytics (UaSender; spec: openspec/specs/analytics/spec.md)
    │       ├── uadb.js                 # Wrapper key-value DB
    │       ├── uadialog.js             # Dialoghi alert/confirm/prompt
    │       ├── uadrag.js               # Utilità drag mouse
    │       ├── uajtfh.js               # Builder stringhe HTML
    │       ├── ualog3.js               # Finestra log浮动
    │       ├── uawindow.js             # Gestore finestre浮动
    │       └── vendor/                 # Librerie locali (no CDN)
    │           ├── dexie.js
    │           ├── marked.min.js
    │           ├── pdf.min.js
    │           ├── mammoth.browser.min.js
    │           └── jszip.min.js
    └── less/                           # Stili LESS
        ├── less.js                     # Compilatore LESS runtime
        ├── style.less                  # Stylesheet principale
        ├── tooltip.less
        ├── uadialog.less
        ├── ualog3.less
        └── modules/
            ├── variables.less          # Variabili LESS
            ├── layout_base.less        # Gabbia verticale
            ├── layout.less             # Layout app (output/input)
            ├── themes.less             # Mixin temi dark/light
            ├── components.less         # Menu, header, pulsanti
            ├── tree.less               # Albero provider
            ├── actions.less            # Pulsanti azione, finestre
            ├── spinner.less            # Overlay spinner
            ├── apikeys.less            # Finestra gestione chiavi
            ├── help.less               # Finestra help
            ├── app_ui.less             # Finestre gestione
            └── upload.less             # Drop-zone upload
```

---

## 3. Sequenza di Avvio

1. `index.html` reindirizza a `static/index.html`
2. `static/index.html` carica:
   - Fogli LESS via `<link rel="stylesheet/less">`
   - `less.js` (compilatore runtime)
   - **Import map** per alias dei percorsi moduli:
     ```json
     {
       "agnochat/": "./js/",
       "agnochat/services/": "./js/services/",
       "agnochat/llm/": "./js/llm/",
       "agnochat/llmclient/": "./js/llmclient/",
       "agnochat/commands/": "./js/commands/",
       "agnochat/llmlist/": "./js/llmlist/"
     }
     ```
   - `<script type="module" src="js/app.js">`
   - `marked.min.js` come script globale
3. `app.js` su `window.load`:
   - `wnds.init()` — inizializza sistema finestre浮动
   - `UaLog.setXY(40, 6).setZ(111).new()` — finestra log
   - `AppMgr.initApp()` — init DB LLM, fetch API keys, carica config provider
   - `AppMgr.loadSelectedModels()` — carica modelli selezionati
   - `TextInput.init()` — setup textarea input
   - `bindEventListener()` — bind eventi UI
   - `showHtmlThread()` — carica ultima conversazione
   - `getTheme()` / `updateActiveModelDisplay()` — applica preferenze
   - `UaSender.init()` + analytics (`static/js/services/sender.js`; spec: `openspec/specs/analytics/spec.md`)

---

## 4. Pattern Architetturali

### 4.1 Sistema Moduli

- **ES Modules** nativi (`import`/`export`) con `"use strict"` ovunque
- **Import map** per alias dei percorsi (`prefisso agnochat/`)
- **Nessun bundler** — caricamento nativo dei moduli nel browser
- **Nessun TypeScript** — JavaScript puro con annotazioni JSDoc
- **Barrel export** via file `index.js` (es. `llmclient/index.js`, `llmlist/index.js`)

### 4.2 Gestione dello Stato

- **Nessun framework** — vanilla JS con pattern singleton
- **Stato privato a livello di modulo** (variabili closure, es. `_activeClient`, `_providerModels`)
- **API pubbliche** esportate come oggetti: `const LlmProvider = { ... }`, `const AppMgr = { ... }`
- **Persistenza via IndexedDB** (Dexie.js) per tutto lo stato che sopravvive al riavvio
- **Cache in memoria** per dati caldi (client attivo, catalogo modelli provider)

### 4.3 UI Framework

- **Nessun UI framework** — manipolazione DOM vanilla
- **Sistema finestre浮动** custom (`UaWindowAdm` + `UaDrag`)
- **Sistema dialoghi** custom (`DialogManager` — alert/confirm/prompt)
- **Pannello log** custom (`UaLog`)
- **Builder stringhe** custom (`UaJtfh` per composizione HTML)
- **Tooltip CSS** via attributi `data-tt`
- **Menu hamburger CSS** via checkbox hack
- **Compilazione LESS runtime** (nessun passo di build)

---

## 5. Database e Storage

### 5.1 Database Principale: `agnochat` (Dexie.js)

| Table | Campi | Scopo |
|-------|-------|-------|
| `kvStore` | key-value generico | Store generico |
| `settings` | key-value (JSON) | Temi, ID attivi, chiavi API |
| `conversations` | id, title, createdAt, updatedAt | Conversazioni |
| `messages` | id, conversationId, role, content, timestamp | Messaggi |
| `prompts` | id, name, content, createdAt, updatedAt | Prompt di sistema |

### 5.2 Database LLM: `agnochat-llm` (IndexedDB raw)

| Object Store | Scopo |
|-------------|-------|
| `discovered-models` | Modelli scoperti dalla discovery API |
| `selected-models` | Modelli selezionati dall'utente per l'albero LLM |

### 5.3 Pattern di Storage

- `UaDb` wrappa la tabella `settings` con operazioni `read/write/delete/saveJson/readJson`
- `DATA_KEYS` centralizza tutti i nomi delle chiavi di storage
- Chiavi API memorizzate come blob JSON nella tabella `settings` sotto la chiave `"api_keys"`
- Tema salvato sotto la chiave `"theme"`
- Config provider attiva salvata sotto la chiave `"llm_provider"`

---

## 6. Integrazione LLM

### 6.1 Pattern Strategy per i Provider

```
BaseClient (astratta)
  ├── GeminiClient      (formato nativo Gemini)
  ├── MistralClient     (OpenAI-compatibile, adattato)
  ├── GroqClient        (OpenAI-compatibile)
  ├── OpenRouterClient  (OpenAI-compatibile)
  ├── CerebrasClient    (OpenAI-compatibile)
  └── SiliconFlowClient (OpenAI-compatibile)
```

### 6.2 Flusso di una Richiesta

1. **`llm_provider.js`** mantiene un catalogo `_providerModels` in memoria (mappa provider → modelli)
2. **`LlmProvider.getClient()`** crea l'istanza del client appropriato con la API key da IndexedDB
3. **`chat_engine.js`** compone il payload via `createLlmPayload()`, invia tramite il client, gestisce retry/abort
4. Ogni client trasforma il payload nel formato specifico del provider, chiama `BaseClient._fetch()`, e parsa la risposta

### 6.3 Discovery e Test Modelli

- **Catalogo statico:** file `data/models/<provider>.txt` con formato `model|windowSize`
- **Discovery live:** fetcher in `llmlist/` chiamano le API dei provider
- **Test:** `llm_updater.js` testa ogni modello con un prompt fisso, misura tempo risposta, calcola un voto qualità
- **Selezione utente:** `llm-selection.js` fornisce un'interfaccia checkbox per selezionare quali modelli appaiono

### 6.4 Hot-Swap

- Cambio provider/modello invalida l'istanza client in cache
- Nuovo client viene creato alla successiva chiamata `getClient()` con la API key del nuovo provider
- Nessun riavvio della pagina necessario

---

## 7. Sistema Temi

- **Mixin LESS** `.apply-theme()` in `themes.less` applica ~80+ variabili CSS custom
- **Due temi:** `.theme-dark` e `.theme-light`
- **Compilazione runtime:** LESS compilato nel browser tramite `less.js`
- **Persistenza:** tema salvato in IndexedDB, ripristinato all'avvio
- **Default:** tema scuro

---

## 8. Architettura dei Vendor

Tutte le librerie esterne sono copie locali in `static/js/services/vendor/`, nessuna dipendenza CDN:

| Libreria | Scopo |
|----------|-------|
| Dexie.js | Wrapper IndexedDB |
| marked.js | Parsing markdown |
| PDF.js | Estrazione testo PDF |
| mammoth.js | Estrazione testo DOCX |
| jszip.js | Gestione file ZIP |
| LESS.js | Compilatore LESS runtime |

---

## 9. Principi Architetturali Chiave

1. **Zero Build Pipeline:** Nessun Webpack, Vite, npm, o transpilazione. Il codice esegue esattamente come scritto.
2. **Tutte le Librerie Locali:** Nessuna dipendenza CDN. Copie locali di tutto.
3. **Privacy-First:** Le chiavi API non lasciano mai il browser. Tutti i dati in IndexedDB. Analytics solo in ambienti non locali.
4. **Lingua Italiana:** UI interamente in italiano, commenti del codice e JSDoc in italiano.
5. **Isolamento dei Database:** Dati app (conversazioni, impostazioni) in un DB Dexie, dati modelli LLM in un IndexedDB separato.
6. **Compilazione LESS Runtime:** Stili compilati nel browser, abilitando il cambio tema tramite parametri mixin.
7. **6 Provider LLM:** Gemini (formato nativo), 5 provider OpenAI-compatibili, tutti dietro un'interfaccia `BaseClient` unificata.
8. **Librerie interne:** Sistema di layout (gabbia verticale), librerie interne UA (`uawindow`, `uadrag`, `uajtfh`, `ualog3`, `uadialog`), gestione provider/modelli.
