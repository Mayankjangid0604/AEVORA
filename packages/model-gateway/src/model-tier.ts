export enum ModelTier {
  LOCAL_BASIC = 'LOCAL_BASIC',
  LOCAL_COMPLEX = 'LOCAL_COMPLEX',
  LOCAL_CODE = 'LOCAL_CODE',
  LOCAL_VISION = 'LOCAL_VISION', // kept for backward compat, maps to STRATEGIC
  LOCAL_STRATEGIC = 'LOCAL_STRATEGIC',
  LOCAL_FAST = 'LOCAL_FAST',
  GEMINI = 'GEMINI',
  SONNET = 'SONNET',
  OPUS = 'OPUS',
  FABLE = 'FABLE',
}

export interface TierConfig {
  tier: ModelTier;
  model: string;
  provider: 'ollama' | 'anthropic' | 'gemini';
  maxTokens: number;
  useCase: string;
}

export function getTierConfig(tier: ModelTier): TierConfig {
  const configs: Record<ModelTier, TierConfig> = {
    [ModelTier.LOCAL_BASIC]: {
      tier: ModelTier.LOCAL_BASIC,
      model: process.env.AEVORA_MODEL_NORMAL || process.env.CEO_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:12b',
      provider: 'ollama',
      maxTokens: 4000,
      useCase: 'Chairman, Assistant, CEO daily reviews, general AI tasks',
    },
    [ModelTier.LOCAL_COMPLEX]: {
      tier: ModelTier.LOCAL_COMPLEX,
      model: process.env.AEVORA_MODEL_COMPLEX || process.env.CEO_MODEL_COMPLEX || process.env.OLLAMA_COMPLEX_MODEL || 'qwen3:14b',
      provider: 'ollama',
      maxTokens: 8000,
      useCase: 'CEO complex strategy, venture planning, major decisions',
    },
    [ModelTier.LOCAL_CODE]: {
      tier: ModelTier.LOCAL_CODE,
      model: process.env.AEVORA_MODEL_CODING || process.env.OLLAMA_CODE_MODEL || 'qwen3-coder:30b',
      provider: 'ollama',
      maxTokens: 8000,
      useCase: 'CTO, engineering, code generation, technical architecture',
    },
    [ModelTier.LOCAL_VISION]: {
      tier: ModelTier.LOCAL_VISION,
      model: process.env.AEVORA_MODEL_STRATEGIC || process.env.OLLAMA_VISION_MODEL || 'qwen3:14b',
      provider: 'ollama',
      maxTokens: 8000,
      useCase: 'Strategic/executive decisions, vision tasks (backward compat alias for STRATEGIC)',
    },
    [ModelTier.LOCAL_STRATEGIC]: {
      tier: ModelTier.LOCAL_STRATEGIC,
      model: process.env.AEVORA_MODEL_STRATEGIC || process.env.OLLAMA_VISION_MODEL || 'qwen3:14b',
      provider: 'ollama',
      maxTokens: 8000,
      useCase: 'Executive strategy, venture planning, major decisions',
    },
    [ModelTier.LOCAL_FAST]: {
      tier: ModelTier.LOCAL_FAST,
      model: process.env.AEVORA_MODEL_FAST || process.env.OLLAMA_FAST_MODEL || 'qwen2.5:7b',
      provider: 'ollama',
      maxTokens: 2000,
      useCase: 'Fast background tasks, classification, simple extraction',
    },
    [ModelTier.GEMINI]: {
      tier: ModelTier.GEMINI,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      provider: 'gemini',
      maxTokens: 16000,
      useCase: 'Important tasks when local models are insufficient, CEO escalations',
    },
    [ModelTier.SONNET]: {
      tier: ModelTier.SONNET,
      model: process.env.MODEL_TIER_2 || 'claude-sonnet-5',
      provider: 'anthropic',
      maxTokens: 8000,
      useCase: 'Rs10000 tier client websites and demos',
    },
    [ModelTier.OPUS]: {
      tier: ModelTier.OPUS,
      model: process.env.MODEL_TIER_3 || 'claude-opus-5-5',
      provider: 'anthropic',
      maxTokens: 16000,
      useCase: 'Rs20000 tier complex projects',
    },
    [ModelTier.FABLE]: {
      tier: ModelTier.FABLE,
      model: process.env.MODEL_TIER_4 || 'claude-fable-5-1',
      provider: 'anthropic',
      maxTokens: 32000,
      useCase: 'Rs30000+ premium projects SaaS CRM',
    },
  };
  return configs[tier];
}

export function getBudgetTier(budgetPaise: number): ModelTier {
  const t1 = parseInt(process.env.BUDGET_TIER_1_MAX || '500000');
  const t2 = parseInt(process.env.BUDGET_TIER_2_MAX || '1000000');
  const t3 = parseInt(process.env.BUDGET_TIER_3_MAX || '2000000');
  if (budgetPaise <= t1) return ModelTier.LOCAL_BASIC;
  if (budgetPaise <= t2) return ModelTier.SONNET;
  if (budgetPaise <= t3) return ModelTier.OPUS;
  return ModelTier.FABLE;
}

export function shouldUseComplexModel(
  decisionTypes: string[],
  budgetPaise: number,
): boolean {
  const complexTypes = ['HIRE_AGENT', 'CREATE_VENTURE', 'ESCALATE_TO_CHAIRMAN'];
  const highBudget = budgetPaise > 5000000;
  const hasComplexDecision = decisionTypes.some(t => complexTypes.includes(t));
  return highBudget || hasComplexDecision;
}

/** Map a department or role name to the best local tier. */
export function tierForRole(department?: string, role?: string): ModelTier {
  const d = (department || '').toLowerCase();
  const r = (role || '').toLowerCase();
  if (r.includes('cto') || d === 'development' || d === 'engineering' || r.includes('developer') || r.includes('devops')) return ModelTier.LOCAL_CODE;
  if (r.includes('research') || d === 'research') return ModelTier.LOCAL_STRATEGIC;
  if (r.includes('ceo') || r.includes('chief executive')) return ModelTier.LOCAL_COMPLEX;
  return ModelTier.LOCAL_BASIC;
}
