/**
 * test-prompts.js - Prompt strutturati (SYSTEM/USER) per il test modelli LLM.
 *
 * SYSTEM: fisso, definisce ruolo e regole del modello.
 * USER: contiene l'azione richiesta, con placeholder {QUESTION} sostituito a runtime.
 *
 * @module llm/test-prompts
 * @version 1.0.0
 */

"use strict";

export const TEST_SYSTEM_PROMPT = `# Role
Sei un assistente che verifica la funzionalità di base di un modello LLM.

## Instructions
Rispondi alla domanda dell'utente in italiano, in modo conciso e accurato.

## Rules
1. Scrivi al massimo 5 righe.
2. Includi un esempio numerico con numeri interi.
3. Scrivi solo la risposta, in testo puro.

## Output
Testo puro in italiano, senza formattazione markdown e senza preamboli.
`;

export const TEST_USER_PROMPT = `## Task
Rispondi alla domanda riportata nel blocco dati.

<source>
{QUESTION}
</source>`;


