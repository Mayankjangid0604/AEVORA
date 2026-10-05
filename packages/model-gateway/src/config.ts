export class Config {
  static get OLLAMA_BASE_URL(): string {
    return process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  }

  // ── Role-based Ollama models ──
  // AEVORA_MODEL_* takes precedence, then OLLAMA_*_MODEL for backward compat.
  // FAST: lightweight background tasks
  static get OLLAMA_FAST_MODEL(): string {
    return process.env.AEVORA_MODEL_FAST || process.env.OLLAMA_FAST_MODEL || 'qwen2.5:7b';
  }
  // NORMAL: general-purpose (chairman, assistant, default)
  static get OLLAMA_DEFAULT_MODEL(): string {
    return process.env.AEVORA_MODEL_NORMAL || process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:12b';
  }
  // COMPLEX: stronger reasoning (CEO decisions, strategy)
  static get OLLAMA_COMPLEX_MODEL(): string {
    return process.env.AEVORA_MODEL_COMPLEX || process.env.OLLAMA_COMPLEX_MODEL || 'qwen3:14b';
  }
  // CODING: code generation and engineering
  static get OLLAMA_CODE_MODEL(): string {
    return process.env.AEVORA_MODEL_CODING || process.env.OLLAMA_CODE_MODEL || 'qwen3-coder:30b';
  }
  // STRATEGIC: strongest reasoning (executive decisions)
  static get OLLAMA_STRATEGIC_MODEL(): string {
    return process.env.AEVORA_MODEL_STRATEGIC || process.env.OLLAMA_VISION_MODEL || 'qwen3:14b';
  }

  // ── Gemini API ──
  static get GEMINI_API_KEY(): string {
    return process.env.GEMINI_API_KEY || '';
  }
  static get GEMINI_MODEL(): string {
    return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }

  static get OLLAMA_TIMEOUT_MS(): number {
    return parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);
  }

  static get OLLAMA_MAX_CONCURRENT_REQUESTS(): number {
    return parseInt(process.env.OLLAMA_MAX_CONCURRENT_REQUESTS || '2', 10);
  }

  /** All Ollama models the system needs. Used by health check. */
  static get REQUIRED_OLLAMA_MODELS(): string[] {
    return [this.OLLAMA_DEFAULT_MODEL, this.OLLAMA_COMPLEX_MODEL, this.OLLAMA_CODE_MODEL, this.OLLAMA_STRATEGIC_MODEL, this.OLLAMA_FAST_MODEL, 'phi4:latest']
      .filter((m, i, a) => a.indexOf(m) === i);
  }

  /** Returns the role→model mapping for diagnostics. */
  static get MODEL_ROLES(): Record<string, string> {
    return {
      FAST: this.OLLAMA_FAST_MODEL,
      NORMAL: this.OLLAMA_DEFAULT_MODEL,
      COMPLEX: this.OLLAMA_COMPLEX_MODEL,
      CODING: this.OLLAMA_CODE_MODEL,
      STRATEGIC: this.OLLAMA_STRATEGIC_MODEL,
    };
  }

  static validate() {
    if (isNaN(this.OLLAMA_TIMEOUT_MS) || this.OLLAMA_TIMEOUT_MS <= 0) {
      throw new Error('OLLAMA_TIMEOUT_MS must be a positive integer');
    }
    if (isNaN(this.OLLAMA_MAX_CONCURRENT_REQUESTS) || this.OLLAMA_MAX_CONCURRENT_REQUESTS <= 0) {
      throw new Error('OLLAMA_MAX_CONCURRENT_REQUESTS must be a positive integer');
    }
  }
}
