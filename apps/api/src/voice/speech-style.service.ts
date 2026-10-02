import { Injectable } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { VoiceProfile } from '@prisma/client';

export interface SpeechContext {
  emotion?: 'NORMAL' | 'URGENT' | 'HAPPY' | 'CONCERNED' | 'EXCITED' | 'FRUSTRATED' | 'CONFIDENT' | 'SYMPATHETIC' | 'FORMAL';
  emotionIntensity?: number; // 0.0 to 1.0
  urgency?: 'NORMAL' | 'URGENT' | 'CRITICAL';
  audience?: 'CHAIRMAN' | 'INTERNAL' | 'CLIENT' | 'PUBLIC';
  eventType?: string;
  conversationState?: string;
  formalityRequirement?: 'LOW' | 'MEDIUM' | 'HIGH';
  reason?: string;
}

export interface SpeechStyleRules {
  sentenceLength: 'SHORT' | 'MEDIUM' | 'LONG';
  directness: 'HIGH' | 'MEDIUM' | 'LOW';
  formality: 'HIGH' | 'MEDIUM' | 'LOW';
  enthusiasm: 'HIGH' | 'MEDIUM' | 'LOW';
  hedging: 'HIGH' | 'MEDIUM' | 'LOW';
  speakingRateModifier: number;
  pitchModifier: number;
  expressivenessModifier: number;
  warmthModifier: number;
  authorityModifier: number;
  energyModifier: number;
}

@Injectable()
export class SpeechStyleService {
  constructor(private readonly gateway: ModelGateway) {}

  /** Deterministically calculate speech style rules based on employee and context */
  calculateRules(
    roleTitle: string,
    departmentName: string,
    context: SpeechContext,
    profile?: VoiceProfile
  ): SpeechStyleRules {
    const role = (roleTitle || '').toLowerCase();
    const dept = (departmentName || '').toLowerCase();
    const urgency = context.urgency || 'NORMAL';
    const emotion = context.emotion || 'NORMAL';
    const audience = context.audience || 'INTERNAL';
    const intensity = Math.min(1.0, Math.max(0.0, context.emotionIntensity ?? 1.0));

    const rules: SpeechStyleRules = {
      sentenceLength: 'MEDIUM',
      directness: 'MEDIUM',
      formality: 'MEDIUM',
      enthusiasm: 'MEDIUM',
      hedging: 'LOW',
      speakingRateModifier: 1.0,
      pitchModifier: 1.0,
      expressivenessModifier: 1.0,
      warmthModifier: 1.0,
      authorityModifier: 1.0,
      energyModifier: 1.0
    };

    // Use explicit profile traits if they exist, otherwise fallback to defaults
    if (profile) {
      if (profile.formality > 0.7) rules.formality = 'HIGH';
      else if (profile.formality < 0.3) rules.formality = 'LOW';
      else rules.formality = 'MEDIUM';

      if (profile.authority > 0.7) {
        rules.directness = 'HIGH';
        rules.hedging = 'LOW';
      } else if (profile.authority < 0.3) {
        rules.directness = 'LOW';
        rules.hedging = 'HIGH';
      } else {
        rules.directness = 'MEDIUM';
      }

      if (profile.energy > 0.7) rules.enthusiasm = 'HIGH';
      else if (profile.energy < 0.3) rules.enthusiasm = 'LOW';
      else rules.enthusiasm = 'MEDIUM';
      
      if (profile.authority > 0.6) rules.sentenceLength = 'SHORT';
    } else {
      // Base Role & Department Traits Fallback
      if (role.includes('chairman') && role.includes('assistant')) {
        rules.formality = 'HIGH';
        rules.directness = 'HIGH';
        rules.enthusiasm = 'LOW';
        rules.hedging = 'LOW';
        rules.sentenceLength = 'SHORT';
      } else if (role.includes('ceo') || role.includes('chief executive')) {
        rules.formality = 'MEDIUM';
        rules.directness = 'HIGH';
        rules.sentenceLength = 'SHORT';
      } else if (dept.includes('sales')) {
        rules.formality = 'LOW';
        rules.enthusiasm = 'HIGH';
        rules.directness = 'MEDIUM';
        rules.sentenceLength = 'MEDIUM';
      } else if (dept.includes('support')) {
        rules.formality = 'MEDIUM';
        rules.enthusiasm = 'MEDIUM';
        rules.hedging = 'MEDIUM';
        rules.directness = 'MEDIUM';
      } else if (dept.includes('finance') || dept.includes('legal')) {
        rules.formality = 'HIGH';
        rules.enthusiasm = 'LOW';
        rules.hedging = 'HIGH';
        rules.directness = 'MEDIUM';
        rules.sentenceLength = 'LONG';
      } else if (dept.includes('it') || dept.includes('technology')) {
        rules.formality = 'LOW';
        rules.enthusiasm = 'LOW';
        rules.directness = 'HIGH';
        rules.sentenceLength = 'SHORT';
      }
    }

    // 2. Audience Modifiers
    if (audience === 'CHAIRMAN') {
      rules.formality = 'HIGH';
      if (rules.directness === 'LOW') rules.directness = 'MEDIUM';
    } else if (audience === 'CLIENT') {
      rules.formality = 'HIGH';
      rules.enthusiasm = rules.enthusiasm === 'LOW' ? 'MEDIUM' : 'HIGH';
      rules.hedging = 'LOW';
    }

    // 3. Contextual Emotion & Urgency Delivery Modifiers (Scaled by Intensity)
    if (urgency === 'URGENT' || urgency === 'CRITICAL') {
      rules.sentenceLength = 'SHORT';
      rules.directness = 'HIGH';
      rules.speakingRateModifier += (urgency === 'CRITICAL' ? 0.15 : 0.08) * intensity;
      rules.pitchModifier += 0.05 * intensity;
      rules.energyModifier += 0.1 * intensity;
      rules.hedging = 'LOW';
    }

    // Emotion Delivery Modifications
    switch (emotion) {
      case 'URGENT':
        rules.sentenceLength = 'SHORT';
        rules.directness = 'HIGH';
        rules.speakingRateModifier += 0.08 * intensity;
        rules.energyModifier += 0.1 * intensity;
        break;
      case 'HAPPY':
        rules.warmthModifier += 0.1 * intensity;
        rules.energyModifier += 0.05 * intensity;
        rules.expressivenessModifier += 0.1 * intensity;
        break;
      case 'CONCERNED':
        rules.speakingRateModifier -= 0.05 * intensity;
        rules.warmthModifier += 0.05 * intensity;
        rules.energyModifier -= 0.05 * intensity;
        rules.pitchModifier -= 0.02 * intensity;
        break;
      case 'EXCITED':
        rules.energyModifier += 0.15 * intensity;
        rules.speakingRateModifier += 0.05 * intensity;
        rules.expressivenessModifier += 0.15 * intensity;
        rules.enthusiasm = 'HIGH';
        break;
      case 'FRUSTRATED':
        rules.directness = 'HIGH';
        rules.energyModifier += 0.05 * intensity;
        rules.warmthModifier -= 0.1 * intensity;
        rules.speakingRateModifier += 0.02 * intensity;
        break;
      case 'CONFIDENT':
        rules.authorityModifier += 0.1 * intensity;
        rules.directness = 'HIGH';
        rules.speakingRateModifier = 1.0; // stable pace
        break;
      case 'SYMPATHETIC':
        rules.warmthModifier += 0.15 * intensity;
        rules.speakingRateModifier -= 0.05 * intensity;
        rules.energyModifier -= 0.1 * intensity;
        break;
      case 'FORMAL':
        rules.formality = 'HIGH';
        rules.speakingRateModifier -= 0.02 * intensity;
        rules.expressivenessModifier -= 0.1 * intensity;
        break;
      case 'NORMAL':
      default:
        break;
    }

    // 4. Department-Specific Emotional Overrides
    if (dept.includes('sales') && emotion === 'EXCITED') {
      rules.energyModifier += 0.05 * intensity;
      rules.enthusiasm = 'HIGH';
    } else if (dept.includes('support') && emotion === 'SYMPATHETIC') {
      rules.warmthModifier += 0.05 * intensity;
      rules.speakingRateModifier -= 0.02 * intensity;
    } else if (dept.includes('finance') && emotion === 'CONCERNED') {
      rules.expressivenessModifier -= 0.1 * intensity;
      rules.formality = 'HIGH';
    } else if ((dept.includes('it') || dept.includes('technology')) && emotion === 'URGENT') {
      rules.sentenceLength = 'SHORT';
      rules.directness = 'HIGH';
    }

    // Role Specific Emotion Overrides
    if (role.includes('chairman') && role.includes('assistant') && emotion === 'URGENT') {
      rules.speakingRateModifier = 1.0; // highly controlled
      rules.expressivenessModifier -= 0.1 * intensity;
      rules.authorityModifier += 0.1 * intensity;
    } else if (role.includes('ceo') && emotion === 'URGENT') {
      rules.directness = 'HIGH';
      rules.authorityModifier += 0.1 * intensity;
    }

    return rules;
  }

  /**
   * Applies behavioral speech style to a raw text string using the LLM.
   * Modifies phrasing to match sentence length, directness, formality, etc.
   */
  async transformText(rawText: string, rules: SpeechStyleRules): Promise<string> {
    if (!rawText.trim()) return rawText;
    
    // We only transform if we need to enforce stylistic traits
    const prompt = `Rewrite the following statement to perfectly match this speaker's behavioral style.
DO NOT change the core factual meaning or language (keep Hindi/Hinglish if present, but translate strictly formal English if required).
DO NOT add conversational filler unless enthusiasm is high.

STYLE RULES:
- Sentence Length: ${rules.sentenceLength}
- Directness: ${rules.directness} (High = blunt/concise, Low = soft/indirect)
- Formality: ${rules.formality}
- Enthusiasm: ${rules.enthusiasm}
- Hedging: ${rules.hedging} (High = use "perhaps", "might", "I recommend", Low = absolute certainty)

ORIGINAL TEXT:
"${rawText}"

REWRITTEN TEXT (only output the rewritten sentence, nothing else):`;

    try {
      const response = await this.gateway.callWithTier(
        ModelTier.LOCAL_BASIC,
        prompt,
        'You are an expert ghostwriter and speech stylist for professional corporate personas.',
        { json: false }
      );
      return response.trim().replace(/^["']|["']$/g, '');
    } catch (err) {
      return rawText; // Fallback to raw text
    }
  }
}
