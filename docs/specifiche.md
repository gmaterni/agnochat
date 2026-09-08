# agnochat — Specifiche Applicative

**Versione:** 1.1.0
**Data:** 2026-09-08

---

## Indice

1. [analytics](#1-analytics) — Telemetria eventi
2. [app-identity](#2-app-identity) — Identità applicativa
3. [chat](#3-chat) — Flusso conversazione
4. [conversations](#4-conversations) — Persistenza conversazioni
5. [doc-bar](#5-doc-bar) — Barra documenti
6. [input/document-upload](#6-inputdocument-upload) — Upload documenti
7. [layout](#7-layout) — Struttura interfaccia
8. [llm-access](#8-llm-access) — Accesso provider LLM
9. [llm-logging](#9-llm-logging) — Log aggiornamento LLM
10. [llm-management](#10-llm-management) — Persistenza modelli
11. [llm-reset](#11-llm-reset) — Reset LLM
12. [llm-selection-ui](#12-llm-selection-ui) — UI selezione modelli
13. [llm-update](#13-llm-update) — Aggiornamento LLM
14. [security](#14-security) — Sicurezza escaping
15. [system-prompts](#15-system-prompts) — Prompt di sistema
16. [llm-test](#16-llm-test) — Test modelli selezionati

---

## 1. analytics

**Purpose:** Invio di eventi di tracciamento asincroni al backend WWWANALYZER (Cloudflare Worker) tramite `UaSender`: raccoglie metadata dell'ambiente e disattiva l'invio automaticamente in ambiente locale.

**Dove vive:** implementazione in `static/js/services/sender.js` (`UaSender`, init da `static/js/app.js`); contract in `openspec/specs/analytics/spec.md`. Non esiste un modulo chiamato `analytics`: il nome indica solo questa sezione di specifica.

### Requisiti

#### Inizializzazione del servizio di invio eventi
Il sistema SHALL consentire l'inizializzazione del servizio con un URL del worker e un userId opzionale.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Init con URL e userId | Forniti `workerUrl` e `userId` validi | Servizio memorizza configurazione |
| Init senza userId | Fornito solo `workerUrl` | userId default: `"user"` |

#### Invio di eventi di tracciamento
Il sistema SHALL inviare un evento asincrono al worker con appName, actionName e userId.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Invio riuscito | Ambiente non locale, parametri validi | Payload inviato, risposta restituita |
| Parametri mancanti | Mancano appName o actionName | Nessuna richiesta, restituisce `null` |
| Errore di rete | Worker non raggiungibile | App non interrotta, restituisce `null` |

#### Disattivazione automatica in ambiente locale
Il sistema SHALL saltare l'invio su `localhost`, `127.0.0.1` o protocollo `file:`.

#### Raccolta metadata dell'ambiente
Ogni evento include: `userAgent`, `timezone`, `language`, `referrer`, `urlParams`, `timestamp`.

#### Evento di apertura
Evento `"agnochat"` / `"open"` all'avvio completato.

#### Evento di avvio conversazione
Evento `"agnochat"` / `"startConversation"` all'avvio di una nuova conversazione.

---

## 2. app-identity

**Purpose:** Identità applicativa: nome visualizzato, denominazione database, chiavi di persistenza, eventi analytics, assenza di residui del precedente nome.

### Requisiti

#### Nome applicazione visualizzato
Il sistema mostra "agnochat" in tutta la UI: titolo pagina, barra superiore, pagine informative, guida utente.

#### Assenza di riferimenti al precedente nome
Nessun riferimento al precedente nome nel codice sorgente, UI o documentazione (esclusi archivi storici).

#### Denominazione dei database
Database: `agnochat` (applicativo) e `agnochat-llm` (modelli LLM). Nessuna migrazione da database precedenti.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Primo avvio | Nessun DB esistente | Creati `agnochat` e `agnochat-llm` |
| DB precedenti presenti | Esistono DB con vecchio nome | Ignorati, usati solo i nuovi |

#### Chiave tema localStorage
Preferenza tema salvata/letta via chiave `agnochat-theme`. Default: `"dark"`.

#### Eventi di analytics
Eventi con nome applicazione `"agnochat"`.

#### Import map dei moduli
Import risolti tramite prefisso `agnochat/`.

#### File di identità
File: `static/agnochat.html`, `agnochat.code-workspace`.

#### Assenza di moduli di migrazione
Nessun modulo di migrazione importato né eseguito all'avvio.

---

## 3. chat

**Purpose:** Flusso di conversazione: messaggio utente → payload con cronologia + prompt di sistema → richiesta provider → risposta nell'output. Nessuna pipeline RAG.

### Requisiti

#### Invio di un messaggio utente
Il sistema mostra il messaggio nell'output e lo invia al provider attivo con la cronologia del thread.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Risposta riuscita | Provider risponde OK | Messaggio utente + risposta modello mostrati |
| Errore non retryable | Provider restituisce errore | Messaggio errore nell'output, cronologia intatta |

#### Composizione del payload
Payload include: cronologia messaggi + prompt di sistema (se selezionato) + domanda corrente.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Con prompt sistema | Prompt selezionato | Payload: prompt + cronologia + domanda |
| Senza prompt | Nessun prompt selezionato | Payload: cronologia + domanda |
| Primo messaggio | Conversazione nuova | Solo domanda corrente (+ prompt se attivo) |

#### Rendering del thread con markdown
Risposte del modello renderizzate come HTML formattato. Messaggi utente/assistente/sistema separati visivamente.

#### Attesa e interruzione
- Overlay di attesa visibile durante elaborazione
- Invio nuovi messaggi disabilitato fino al completamento
- Interruzione annulla la richiesta, nasconde overlay, lascia intatta la cronologia

---

## 4. conversations

**Purpose:** Persistenza su IndexedDB di conversazioni e messaggi: CRUD, ripristino all'avvio, cancellazione.

### Requisiti

#### Persistenza delle conversazioni
Ogni conversazione salvata con: titolo, createdAt, updatedAt, cronologia messaggi, documenti caricati.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Nuova conversazione | Primo messaggio inviato | Conversazione creata su DB |
| Aggiornamento | Nuovo messaggio/documento | Cronologia e timestamp aggiornati |

#### Elenco e ripristino
Elenco conversazioni ordinate per ultimo aggiornamento. Ripristino completo di cronologia e documenti.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Elenco | Gestione conversazioni aperta | Lista ordinata per data |
| Ripristino | Conversazione selezionata | Cronologia + documenti caricati |
| Ripristino all'avvio | Conversazione attiva precedente | Ripristinata con cronologia completa |

#### Cancellazione
Rimozione conversazione + messaggi + documenti da IndexedDB.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Cancellazione | Utente cancella conversazione | Tutto rimosso, area vuota |
| Ultima conversazione | Cancellazione ultima rimasta | Area output vuota, pronta per nuova |

---

## 5. doc-bar

**Purpose:** Barra con icone documenti caricati nel pannello output, con rimozione singola.

### Requisiti

#### Barra documenti nel pannello output
Icona per ogni documento caricato, tooltip con nome file. Nascondi se nessun documento.

#### Rimozione singola
Pulsante chiusura su ogni icona. Rimuove documento dalla barra e dai documenti attivi.

#### Aggiornamento reattivo
Barra si aggiorna automaticamente a caricamento/rimozione documenti e al ripristino conversazione.

---

## 6. input/document-upload

**Purpose:** Upload documenti (txt, md, pdf, docx, odt) nell'area input, estrazione testo client-side, formattazione con boundary tags per il prompt LLM.

### Requisiti

#### Pulsante upload visibile
Icona "+" nell'input wrapper, prima del pulsante "Modifica domanda", tooltip "Carica documento".

#### Dialogo selezione file
Apre file picker nativo filtrato per .txt, .md, .pdf, .docx, .odt. Annullamento = nessuna modifica.

#### Estrazione testo da file supportati

| Tipo | Metodo |
|------|--------|
| .txt | Lettura UTF-8 diretta |
| .md | Lettura UTF-8 (markdown preservato) |
| .pdf | Estrazione via pdfjs-dist |
| .docx | Estrazione via mammoth |
| .odt | Estrazione via parser ODT |
| Errore estrazione | Alert errore, nessuna modifica textarea |

#### Contenuto formattato e inserito nella textarea
Formato:
```
[Contenuto del documento: nomefile.ext]
<contenuto estratto>
[Fine documento]
```

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Singolo documento | Upload file | Blocco documento inserito al cursore |
| Documenti multipli | Upload sequenziale | Blocchi separati da riga vuota |
| File vuoto | File senza contenuto | Tag vuoti inseriti |
| Tags con nome file | Qualsiasi upload | Tag usa nome file originale con estensione |

#### Compliance prompt design
Contenuto documento precede il testo digitato dall'utente nel prompt finale.

#### TextArea funzionale
Dopo inserimento: modifica, invio e cancellazione funzionano normalmente.

---

## 7. layout

**Purpose:** Struttura visiva: barra superiore fissa, drawer laterale, due pannelli (output/input), overlay attesa, finestre浮动, tooltip, temi dark/light.

### Requisiti

#### Gabbia di layout a due pannelli
Header 4.5vh, input 20vh, output flessibile. Scroll output indipendente da input.

#### Menu hamburger e drawer laterale
Drawer con: gestione conversazioni, prompt sistema, provider/modelli, sezione API Key, tema. Nessuna voce "Aiuto" nel menu (accessibile da "?").

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Apertura | Click hamburger | Drawer si apre, contenuto si sposta |
| Chiusura | Click hamburger o voce menu | Drawer si chiude |
| Sezione API Key | Drawer aperto | Voci raggruppate in sezione "API Key" |
| Voce Aggiorna LLM | Drawer aperto | Presente, avvia verifica modelli |

#### Temi dark e light
Selezione immediata, persistenza su IndexedDB. Default: dark.

#### Indicatore di attesa e conferma
Overlay modale durante operazioni LLM. Dialogo di conferma per azioni distruttive.

#### Messaggi di sistema e aiuto
Messaggi sistema nell'output con stile distinto. Pannello aiuto accessibile da "?".

#### Colonna azioni input
Copia, Cancella, Invia impilati verticalmente a destra della textarea. Invia in basso.

#### Azioni nell'output
Icone "Copia Output" e "Cancella Output" in alto a destra. Cancella svuota solo la vista, non la cronologia.

#### Pulsante modifica domanda compatto
Icona matita in basso a destra dell'ultimo messaggio utente. Tooltip "Modifica domanda".

#### Finestra di selezione LLM
Finestra a destra del menu con: nome LLM, voto, tempo. Pulsanti "Salva" e "Annulla" stessa larghezza.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Apertura | Click "Seleziona LLM" | Finestra con elenco modelli superati |
| Provider senza modelli | Nessun modello superato | Provider mostrato con indicazione |
| Nessun modello | Nessun test superato | Messaggio dedicato |

---

## 8. llm-access

**Purpose:** Accesso ai provider LLM (Gemini, Mistral, Groq, OpenRouter, HuggingFace): selezione, chiavi API, retry, errori standardizzati.

### Requisiti

#### Selezione provider e modello attivi
Scelta persistita su IndexedDB, ripristinata all'avvio.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Selezione | Utente sceglie provider/modello | Stato aggiornato, salvato su DB |
| Ripristino | Avvio con scelta salvata | Provider/modello ripristinati |
| Nessuna scelta | Avvio senza scelta | Default: primo provider/modello disponibili |

#### Gestione chiavi API
Chiavi mai in chiaro nei sorgenti. Seed da `api_x.json` se DB vuoto.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Inserimento chiave | Utente inserisce/modifica chiave | Salvata su DB, attiva per richieste |
| Seed iniziale | DB vuoto + `api_x.json` disponibile | Chiavi prova caricate |
| Chiave mancante | Richiesta senza chiave provider | Avviso nome provider |

#### Invio con retry ed errori
Retry automatico errori transitori (timeout, 500, 502, 503, 504) fino a 3 volte, intervallo 5s.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Risposta OK | Invio riuscito | Risposta restituita |
| Errore transitorio | 502, 503, etc. | Retry fino a 3 volte |
| Errore token limit | Input troppo lungo | Nessun retry, errore chiaro |
| Interruzione manuale | Utente annulla | Nessun errore |

#### Catalogo modelli da dati locali
Modelli da `data/models/<provider>.txt`. Se esiste repository modelli accettati, albero mostra solo quelli.

---

## 9. llm-logging

**Purpose:** Formato log durante aggiornamento LLM: separatori provider, solo righe risultato, evidenziazione errori HTTP.

### Requisiti

#### Formato log con separatori
Riga: `=== Provider: <nome> ===` all'inizio di ogni gruppo provider.

#### Solo righe risultato
Nessuna riga "test:..." o debug intermedi.

#### Evidenziazione errori HTTP
Riga vuota prima/dopo errore. Formato: `errore <codice> <modello>`.

#### Riepilogo finale per provider
Riga: `--- <provider>: <successi> ok, <errori> error ---`

---

## 10. llm-management

**Purpose:** Persistenza modelli LLM scoperti e selezionati tramite due object store IndexedDB separati.

### Requisiti

#### Persistenza modelli scoperti
Salvataggio in `discovered-models` con chiave `provider:model`. Sovrascrittura ad ogni aggiornamento.

#### Persistenza modelli selezionati
Salvataggio in `selected-models`. "Salva" sostituisce, "Aggiungi" unisce.

#### Lettura per albero LLM
Albero LLM costruito da `selected-models` all'avvio.

#### Isolamento archivi
`discovered-models` e `selected-models` indipendenti.

---

## 11. llm-reset

**Purpose:** Comando "Reset LLM": cancella selezione corrente, ripristina modelli default da `static/data/models/`.

### Requisiti

#### Comando reset
Svuota `selected-models`, leggi file default, salva in `selected-models`, ricostruisci albero.

#### Lettura modelli default
File `.json` in `static/data/models/` con campi: provider, model, name (opzionale).

#### Sovrascrittura completa
Reset sostituisce completamente, non unisce.

---

## 12. llm-selection-ui

**Purpose:** Finestra modale "Seleziona LLM" con quattro azioni (Salva, Aggiungi, Annulla, Seleziona Attivi), tooltip differenziati, evidenziazione delle righe selezionate e apertura automatica a fine "Aggiorna LLM".

### Requisiti

#### Finestra con quattro azioni
Elenco modelli da `discovered-models` (validi `vote >= MIN_VOTE` più eletti già presenti) con checkbox. Quattro pulsanti: Salva, Aggiungi (giallo), Annulla, Seleziona Attivi (inverso di Annulla). Quando aperta automaticamente al termine di "Aggiorna LLM", mostra spuntati i modelli in `selected-models` ed evidenziate le righe, senza richiedere ulteriore interazione.

#### Pulsante Salva — sostituzione
Svuota `selected-models`, popola con selezione, chiudi finestra, aggiorna albero.

#### Pulsante Aggiungi — unione
Aggiungi selezione a `selected-models`, ignora duplicati, chiudi finestra, aggiorna albero.

#### Pulsante Annulla
Chiudi finestra senza modifiche. Deseleziona tutti i modelli.

#### Pulsante Seleziona Attivi — ripristino
Seleziona solo gli LLM già attivi nell'albero (quelli salvati in `selected-models`), deseleziona gli altri — operazione inversa di Annulla.

#### Tooltip differenziazione
- Salva: "sostituisce completamente la selezione corrente"
- Aggiungi: "unisce i modelli selezionati a quelli già presenti"
- Annulla: "deseleziona tutti i modelli per iniziare una nuova selezione"
- Seleziona Attivi: "seleziona solo gli LLM già attivi nell'albero (quelli salvati in selected-models), deseleziona tutti gli altri — operazione inversa di Annulla"

#### Stile pulsante Aggiungi
Background giallo per differenziarlo da Salva.

#### Evidenziazione e sincronizzazione
Righe dei modelli spuntati evidenziate (`tr.llm-row.selected`); ogni `change` su checkbox modello aggiorna la classe della riga e il flag provider (`checked`/`indeterminate`); il toggle provider propaga stato ed evidenziazione a tutte le sue righe. Se dopo l'apertura nessun checkbox è spuntato ma `selected-models` non è vuoto, auto-restore degli eletti ancora presenti (log "auto-restore attivi"). Ogni modello compare una sola volta (`provider:model` unico): nessuna riga `checked` senza `selected` né viceversa.

#### Apertura automatica post-Aggiorna
A elaborazione conclusa con modelli salvati (successo o STOP con parziali) si apre da sola un'unica finestra "Seleziona LLM" con spunta su eletti ed evidenziazione, senza dialog intermedia.

---

## 13. llm-update

**Purpose:** Procedura di aggiornamento e selezione modelli LLM: discovery, test, voto, memorizzazione, selezione.

### Requisiti

#### Scoperta automatica catalogo
Discovery dinamica per provider con client in `llmclient/` e chiave API attiva.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Provider considerati | Aggiornamento parte | Solo provider con client implementato |
| Provider senza chiave | Nessuna chiave attiva | Saltato, segnalato in UaLog |
| Filtro modelli non-chat | Modelli scaricati | Embedding, voce, immagine esclusi |

#### Avvio con conferma
Menu laterale "Aggiorna LLM" → conferma → avvio. Interrompibile con STOP.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Conferma | Utente conferma | Procedura parte |
| Annullamento | Utente non conferma | Procedura non parte |
| STOP | In corso | Termina con parziali salvati, log "interrotto — N modelli testati", apertura finestra se modelli salvati |
| Nessun provider | Nessuna chiave attiva | Termina in `UaLog` senza aprire la finestra elenco |

#### Test modelli
Ogni modello testato con prompt fisso, sequenziale, tracciamento in UaLog.

#### Criterio superamento test
Risposta corretta + non vuota + tempo < 20 secondi.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Risposta OK < 20s | Test superato | Incluso con tempo misurato |
| Errore provider | Qualsiasi errore | Escluso, motivo in UaLog |
| Tempo > 20s | Timeout | Escluso, soglia in UaLog |

#### Memorizzazione e riepilogo
Tutti i modelli scoperti salvati in `discovered-models` (con `elapsedMs`, `vote` per superati, `testError` per falliti). Nessuna dialog di riepilogo: riepilogo solo in `UaLog`/console ("completato/interrotto — N modelli testati"). Al termine con modelli salvati si apre automaticamente un'unica finestra "Seleziona LLM" con spunta su eletti ed evidenziazione.

#### Finestra selezione LLM
Elenco modelli scaricati con: nome, voto (6-10), tempo, finestra contesto. Raggruppati per provider.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Apertura manuale | Click "Seleziona LLM" | Finestra con elenco e quattro colonne |
| Apertura automatica | Fine "Aggiorna LLM" con modelli salvati | Unica finestra, spuntati su eletti, righe evidenziate, nessuna dialog |
| Nessun provider | Nessuna chiave attiva (`results.length === 0`) | Nessuna finestra, solo `UaLog`, spinner nascosto |
| Provider vuoto | Nessun modello superato | Provider mostrato con indicazione |
| Nessun modello | Nessun superato | Messaggio dedicato |

#### Selezione modelli e provider
Checkbox per modello e per provider (toggle tutti). Indipendenti tra provider.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Selezione singolo modello | Toggle checkbox | Solo quel modello cambia + riga evidenziata |
| Selezione provider | Toggle checkbox provider | Tutti i modelli del provider cambiano + righe evidenziate |
| All'apertura | Finestra aperta | Spuntati solo i modelli in `selected-models`, righe evidenziate, provider sincronizzati |

#### Salvataggio selezione nell'albero
"Salva" persiste modelli selezionati in un elenco "active", ricostruisce albero LLM.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Salvataggio | Click "Salva" con selezione | Elenco "active" aggiornato, albero ricostruito |
| Salvataggio vuoto | Click "Salva" senza selezione | Conferma richiesta |
| Persistenza | Riavvio dopo salvataggio | Albero costruito sui modelli "active" |

---

## 14. security

**Purpose:** Escaping dei contenuti utente nel DOM per prevenire interpretazione HTML/scripting.

### Requisiti

#### Escaping contenuti utente
Titoli conversazioni, nomi prompt, nomi chiavi API escapati prima di inserimento nel DOM.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Titolo con HTML | Caratteri `<`, `>`, `&` | Visualizzato come testo letterale |
| Nome prompt con markup | HTML o script | Testo letterale, nessuna esecuzione |
| Nome chiave con speciali | Virgolette, apostrofi | Testo letterale, pulsanti funzionanti |

#### Nessun handler inline con contenuti utente
Nessuna interpolazione in attributi `onclick`. Associazione tramite data-attribute e delega eventi.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Nome chiave con virgolette | Nome arbitrario | Renderizzato correttamente, azioni funzionanti |

---

## 15. system-prompts

**Purpose:** CRUD prompt di sistema su IndexedDB: creazione, modifica, selezione, cancellazione.

### Requisiti

#### Creazione e modifica
Prompt con nome e contenuto, salvati su IndexedDB.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Creazione | Nome + contenuto forniti | Prompt salvato, disponibile |
| Modifica | Nome/contenuto modificati | Prompt aggiornato su DB |

#### Elenco e selezione
Elenco prompt salvati, selezione prompt attivo, persistenza scelta.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Selezione | Utente seleziona prompt | Impostato come attivo |
| Nessun prompt | Nessuna selezione | Richieste senza prompt personalizzato |
| Ripristino all'avvio | Prompt selezionato in precedenza | Selezione ripristinata |

#### Cancellazione
Rimozione prompt da IndexedDB. Se era attivo, disattivato.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Cancellazione | Utente elimina prompt | Rimosso da DB, se attivo disattivato |

---

## 16. llm-test

**Purpose:** Comando "Test LLM" per confrontare i modelli già selezionati con uno stesso prompt utente: scelta provider, prove sequenziali con metriche su `UaLog` e finestra riepilogativa finale con codici errore.

**Dove vive:** `static/js/commands/test-llm.js`, voce menu `menu-test-llm` in `static/js/app_ui.js` (prima voce sezione LLM, tooltip llm-selected), stili in `static/less/modules/tree.less` (`#wnd-test-llm-summary` 84vw). Spec in `openspec/specs/llm-test/spec.md`.

### Requisiti

#### Voce di menu Test LLM
Prima voce della sezione LLM del drawer, tooltip "test sui modelli selezionabili dal comando LLM (llm-selected)".

#### Prompt di richiesta obbligatorio
Verifica che `.text-input` contenga testo; se vuoto, alert "digita prima un prompt" e nessuna prova.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Prompt presente | Testo digitato | Apre finestra provider |
| Prompt mancante | Input vuoto | Alert, nessuna prova |
| Nessun modello selezionato | `selected-models` vuoto | Alert "nessun modello selezionato" |

#### Scelta del provider e test dei suoi modelli
Finestra `wnd-test-llm-pick` con lista provider aventi modelli selezionati e conteggio; click provider avvia test sequenziale di tutti i suoi modelli con lo stesso prompt (60s timeout, 512 max_tokens, temp 0.7).

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Avvio test | Click provider | Testa in sequenza ogni modello del provider |

#### Metriche su UaLog durante il test
Spinner STOP con conferma "Confermi lo STOP del Test LLM?"; per ogni prova logga `>>> provider/model | req: N char | resp: N char | tempo: s <<<` o `>>> ERRORE provider/model | codice | motivo | req | tempo <<<`; su STOP logga "interrotto" e interrompe il ciclo.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Prova riuscita | Risposta non vuota | Log con dimensioni e tempo |
| Errore/timeout | Errore provider o vuoto | Log con codice errore |
| STOP utente | Click STOP | Annulla richiesta in corso, interrompe ciclo |

#### Riepilogo finale con errori
A fine ciclo (anche parziale su STOP) apre `wnd-test-llm-summary` (84vw, stili in `tree.less`) con tabella Modello / Response / Tempo o `ERRORE codice: X` + motivo; ripristina il provider/modello attivi precedenti.

| Scenario | Condizione | Risultato |
|----------|-----------|-----------|
| Riepilogo completo | Prove terminate | Riga per modello con nome, dimensione response, tempo o codice errore |
