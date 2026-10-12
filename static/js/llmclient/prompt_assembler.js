// prompt_assembler.js — mette in lista i messaggi (system/user/assistant) di un prompt.
// ES module (Node >= 17 e browser). Non entra nel contenuto: `content` è opaco (stringa o array di blocchi).

export class PromptAssembler {
  constructor() {
    this.system = null;
    this.messages = [];
  }

  setSystemMessage(content) {
    this.system = content;
    return this;
  }

  addUserMessage(content) {
    this.messages.push({ role: "user", content });
    return this;
  }

  addAssistantMessage(content) {
    this.messages.push({ role: "assistant", content });
    return this;
  }

  /** Solo il system (stile Anthropic: parametro `system`). */
  getSystem() {
    return this.system;
  }

  /** Solo user/assistant (stile Anthropic: parametro `messages`). */
  getChatMessages() {
    return [...this.messages];
  }

  /** Lista completa, system incluso (stile OpenAI). */
  getMessages() {
    const head = this.system !== null ? [{ role: "system", content: this.system }] : [];
    return [...head, ...this.getChatMessages()];
  }
}
