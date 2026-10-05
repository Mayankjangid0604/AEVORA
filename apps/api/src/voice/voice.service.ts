import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserVoiceProvider } from './providers/browser-voice.provider';
import { MockVoiceProvider } from './providers/mock-voice.provider';
import { IVoiceProvider, VoiceGenerationResult } from './voice-provider.interface';
import { SpeechStyleService, SpeechContext } from './speech-style.service';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { ISpeechToTextProvider } from './stt-provider.interface';
import { MockSttProvider } from './providers/mock-stt.provider';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private providers: Map<string, IVoiceProvider> = new Map();

  private sttProviders: Map<string, ISpeechToTextProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly browserProvider: BrowserVoiceProvider,
    private readonly mockProvider: MockVoiceProvider,
    private readonly elevenLabsProvider: ElevenLabsVoiceProvider,
    private readonly speechStyleService: SpeechStyleService,
    private readonly mockSttProvider: MockSttProvider
  ) {
    this.registerProvider(this.browserProvider);
    this.registerProvider(this.mockProvider);
    this.registerProvider(this.elevenLabsProvider);
    
    this.registerSttProvider(this.mockSttProvider);
  }

  private registerSttProvider(provider: ISpeechToTextProvider) {
    this.sttProviders.set(provider.name, provider);
  }

  private registerProvider(provider: IVoiceProvider) {
    this.providers.set(provider.name, provider);
  }

  async getEmployeeVoiceProfile(employeeId: string) {
    const profile = await this.prisma.voiceProfile.findUnique({
      where: { employeeId },
      include: { employee: { include: { role: true, department: true } } }
    });
    if (!profile) throw new NotFoundException('Voice profile not found');
    return profile;
  }

  async resolveEmployeeVoice(employeeId: string) {
    if (employeeId === 'system:assistant') {
      return {
        id: 'system:assistant',
        employeeId: 'system:assistant',
        provider: 'browser',
        voiceId: 'default',
        providerVoiceId: null,
        voiceFamily: 'chairman_assistant',
        language: 'en-US',
        accent: 'US',
        pitch: 0.9,
        speakingRate: 0.95,
        warmth: 0.4,
        authority: 0.9,
        energy: 0.5,
        formality: 0.95,
        stability: 1.0,
        expressiveness: 1.0,
        style: 'polished',
        personalityInfluence: 'composed, highly professional, discreet',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    // Attempt to find configured profile
    let profile = await this.prisma.voiceProfile.findUnique({
      where: { employeeId }
    });

    if (!profile) {
      // Auto-assign a voice based on employee properties if not found
      profile = await this.assignVoice(employeeId);
    }
    return profile;
  }

  async assignVoice(employeeId: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { role: true, department: true }
    });
    
    if (!emp) throw new NotFoundException('Employee not found');

    // Deterministic random variation based on identitySeed
    const hash = Array.from(emp.identitySeed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Personality System Integration
    const traits = ['confident', 'energetic', 'calm', 'empathetic', 'analytical', 'creative', 'reserved'];
    const dominantTrait1 = traits[hash % traits.length];
    const dominantTrait2 = traits[(hash * 3) % traits.length];
    const personalityTraits = Array.from(new Set([dominantTrait1, dominantTrait2]));
    
    // Base deterministic variations
    const pitchVariation = ((hash % 100) - 50) / 1000; // -0.05 to +0.05
    let rateVariation = (((hash * 13) % 100) - 50) / 1000; // -0.05 to +0.05
    let warmthVar = ((hash * 7) % 20) - 10; // -10 to +10
    let authorityVar = ((hash * 11) % 20) - 10; // -10 to +10
    let energyVar = ((hash * 17) % 20) - 10; // -10 to +10
    let formalityVar = ((hash * 23) % 20) - 10; // -10 to +10
    
    // Apply Personality Influence to Modifiers
    if (personalityTraits.includes('confident')) authorityVar += 15;
    if (personalityTraits.includes('energetic')) { rateVariation += 0.05; energyVar += 15; }
    if (personalityTraits.includes('calm')) { rateVariation -= 0.03; energyVar -= 10; }
    if (personalityTraits.includes('empathetic')) warmthVar += 15;
    if (personalityTraits.includes('analytical')) { rateVariation -= 0.02; formalityVar += 10; }
    if (personalityTraits.includes('creative')) energyVar += 10;
    if (personalityTraits.includes('reserved')) { energyVar -= 15; rateVariation -= 0.02; }
    
    let basePitch = 1.0;
    let baseRate = 1.0;
    let style = 'neutral';
    let baseWarmth = 50;
    let baseAuthority = 50;
    let baseEnergy = 50;
    let baseFormality = 50;
    let family = 'neutral';
    
    const roleTitle = emp.role?.title?.toLowerCase() || '';
    const roleLevel = emp.role?.level || 1; // higher is more senior
    const deptName = emp.department?.name?.toLowerCase() || '';

    // Hierarchy Influence
    const hierarchyAuthorityBonus = Math.min(25, roleLevel * 5);
    const hierarchyFormalityBonus = Math.min(15, roleLevel * 3);
    const hierarchyPaceModifier = -Math.min(0.1, roleLevel * 0.02); // More senior = slightly slower/measured

    if (roleTitle.includes('chairman') && roleTitle.includes('assistant')) {
      basePitch = 0.9; baseRate = 0.95; style = 'composed, precise, authoritative';
      family = 'chairman_assistant';
      baseWarmth = 40; baseAuthority = 90; baseEnergy = 50; baseFormality = 95;
    } else if (roleTitle.includes('ceo') || roleTitle.includes('chief executive')) {
      basePitch = 0.85; baseRate = 0.9; style = 'executive, confident, warm';
      family = 'ceo';
      baseWarmth = 60; baseAuthority = 95; baseEnergy = 60; baseFormality = 85;
    } else if (deptName.includes('sales')) {
      basePitch = 1.1; baseRate = 1.1; style = 'energetic, persuasive, confident';
      family = 'sales';
      baseWarmth = 70; baseAuthority = 60; baseEnergy = 85; baseFormality = 40;
    } else if (deptName.includes('marketing')) {
      basePitch = 1.15; baseRate = 1.05; style = 'expressive, charismatic, enthusiastic';
      family = 'marketing';
      baseWarmth = 75; baseAuthority = 50; baseEnergy = 80; baseFormality = 40;
    } else if (deptName.includes('support')) {
      basePitch = 1.05; baseRate = 0.9; style = 'warm, patient, reassuring';
      family = 'support';
      baseWarmth = 85; baseAuthority = 40; baseEnergy = 50; baseFormality = 60;
    } else if (deptName === 'it' || deptName.includes('technology')) {
      basePitch = 0.95; baseRate = 1.0; style = 'technical, logical, efficient';
      family = 'it';
      baseWarmth = 30; baseAuthority = 50; baseEnergy = 40; baseFormality = 60;
    } else if (deptName.includes('research & development') || deptName.includes('r&d')) {
      basePitch = 0.98; baseRate = 0.95; style = 'analytical, thoughtful, engaged';
      family = 'rd';
      baseWarmth = 40; baseAuthority = 60; baseEnergy = 50; baseFormality = 70;
    } else if (deptName.includes('research')) {
      basePitch = 0.97; baseRate = 0.95; style = 'investigative, measured, curious';
      family = 'research';
      baseWarmth = 40; baseAuthority = 55; baseEnergy = 55; baseFormality = 70;
    } else if (deptName.includes('hiring') || deptName.includes('training') || deptName.includes('hr')) {
      basePitch = 1.08; baseRate = 1.0; style = 'approachable, encouraging, friendly';
      family = 'hr';
      baseWarmth = 80; baseAuthority = 50; baseEnergy = 65; baseFormality = 50;
    } else if (deptName.includes('finance')) {
      basePitch = 0.95; baseRate = 0.92; style = 'precise, conservative, controlled';
      family = 'finance';
      baseWarmth = 30; baseAuthority = 70; baseEnergy = 40; baseFormality = 85;
    } else if (deptName.includes('operations')) {
      basePitch = 0.92; baseRate = 1.05; style = 'direct, efficient, practical';
      family = 'operations';
      baseWarmth = 40; baseAuthority = 65; baseEnergy = 60; baseFormality = 60;
    } else if (deptName.includes('legal') || deptName.includes('compliance')) {
      basePitch = 0.9; baseRate = 0.9; style = 'formal, precise, cautious';
      family = 'legal';
      baseWarmth = 20; baseAuthority = 80; baseEnergy = 40; baseFormality = 95;
    } else if (deptName.includes('product')) {
      basePitch = 1.02; baseRate = 1.0; style = 'strategic, analytical, collaborative';
      family = 'product';
      baseWarmth = 60; baseAuthority = 60; baseEnergy = 65; baseFormality = 60;
    } else if (deptName.includes('facilities') || deptName.includes('administration')) {
      basePitch = 1.0; baseRate = 1.0; style = 'practical, friendly, organized';
      family = 'administration';
      baseWarmth = 60; baseAuthority = 50; baseEnergy = 50; baseFormality = 50;
    }

    const finalPitch = Number(Math.max(0.5, Math.min(2.0, basePitch + pitchVariation)).toFixed(3));
    const finalRate = Number(Math.max(0.5, Math.min(2.0, baseRate + rateVariation + hierarchyPaceModifier)).toFixed(3));
    
    // Normalize 0-100 values to Float 0.0 - 1.0 for the VoiceProfile model floats
    const finalWarmth = Number(Math.max(0.0, Math.min(1.0, (baseWarmth + warmthVar) / 100)).toFixed(2));
    const finalAuthority = Number(Math.max(0.0, Math.min(1.0, (baseAuthority + hierarchyAuthorityBonus + authorityVar) / 100)).toFixed(2));
    const finalEnergy = Number(Math.max(0.0, Math.min(1.0, (baseEnergy + energyVar) / 100)).toFixed(2));
    const finalFormality = Number(Math.max(0.0, Math.min(1.0, (baseFormality + hierarchyFormalityBonus + formalityVar) / 100)).toFixed(2));

    return this.prisma.voiceProfile.upsert({
      where: { employeeId },
      update: {}, // Don't override if it already exists to preserve manual changes
      create: {
        employeeId,
        provider: 'browser',
        voiceId: 'default',
        voiceFamily: family,
        pitch: finalPitch,
        speakingRate: finalRate,
        warmth: finalWarmth,
        authority: finalAuthority,
        energy: finalEnergy,
        formality: finalFormality,
        style,
        personalityInfluence: personalityTraits.join(', '),
        language: 'en-US'
      }
    });
  }

  async provisionVoice(employeeId: string, force: boolean = false) {
    let profile = await this.resolveEmployeeVoice(employeeId);
    
    if (profile.providerVoiceId && !force) {
      return profile; // Already provisioned
    }

    const family = profile.voiceFamily || 'default';

    // Centralized mapping of VoiceFamily to ElevenLabs voice IDs.
    const voiceMap: Record<string, string> = {
      'ceo': process.env.EL_VOICE_CEO || 'TX3OmTkO3A6l0s5O0rC0', // placeholder
      'chairman_assistant': process.env.EL_VOICE_ASSISTANT || 'EXAVITQu4vr4xnSDxMaL',
      'sales': process.env.EL_VOICE_SALES || 'pNInz6obpgDQGcFmaJcg',
      'marketing': process.env.EL_VOICE_MARKETING || 'piTKgcLEGmPE4e6mUCvc',
      'support': process.env.EL_VOICE_SUPPORT || 'ThT5KcBeYPX3keUQqHPh',
      'it': process.env.EL_VOICE_IT || 'ODq5zmih8GrVes37Dizd',
      'rd': process.env.EL_VOICE_RD || 'GlO8VbX9G6K6n2vA1C2P',
      'research': process.env.EL_VOICE_RESEARCH || 'GlO8VbX9G6K6n2vA1C2P', 
      'hr': process.env.EL_VOICE_HR || 'MF3mGyEYCl7XYWbV9V6O',
      'finance': process.env.EL_VOICE_FINANCE || 'VR6AewLTigWG4xSOukaG',
      'operations': process.env.EL_VOICE_OPS || 'ZQe5CZNOzWyzPSCn5a3c',
      'legal': process.env.EL_VOICE_LEGAL || 'ErXwobaYiN019PkySvjV',
      'product': process.env.EL_VOICE_PRODUCT || 'yoZ06aRoZqZ9E6Rj1q3y',
      'administration': process.env.EL_VOICE_ADMIN || 'EXAVITQu4vr4xnSDxMaL',
      'default': process.env.EL_VOICE_DEFAULT || 'pNInz6obpgDQGcFmaJcg'
    };

    const targetVoiceId = voiceMap[family] || voiceMap['default'];

    profile = await this.prisma.voiceProfile.update({
      where: { employeeId: profile.employeeId },
      data: {
        providerVoiceId: targetVoiceId,
        provider: process.env.TTS_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'browser'
      }
    });

    return profile;
  }
  async generateSpeech(employeeId: string, text: string, context: SpeechContext = {}): Promise<VoiceGenerationResult> {
    const profile = await this.resolveEmployeeVoice(employeeId);

    if (!profile.enabled) {
      this.logger.warn(`Voice profile disabled for employee ${employeeId}`);
      throw new Error('Voice profile is disabled');
    }
    
    let roleTitle = 'Assistant';
    let deptName = 'General';
    
    if (employeeId !== 'system:assistant') {
      const emp = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { role: true, department: true } });
      if (emp) {
        roleTitle = emp.role?.title || '';
        deptName = emp.department?.name || '';
      }
    } else {
      roleTitle = 'Chairman Assistant';
      deptName = 'Executive';
      context.audience = context.audience || 'CHAIRMAN';
    }

    const rules = this.speechStyleService.calculateRules(roleTitle, deptName, context, profile);
    
    // Apply LLM behavioral transformation
    const transformedText = await this.speechStyleService.transformText(text, rules);

    // Try configured provider first
    let provider = this.providers.get(profile.provider);
    
    if (!provider || !provider.isAvailable()) {
      this.logger.warn(`Provider ${profile.provider} unavailable, falling back to browser`);
      provider = this.browserProvider;
    }

    return provider.generateSpeech({
      text: transformedText,
      voiceId: profile.providerVoiceId ?? profile.voiceId ?? undefined,
      language: profile.language,
      pitch: Number(Math.max(0.5, Math.min(2.0, profile.pitch * rules.pitchModifier)).toFixed(3)),
      speakingRate: Number(Math.max(0.5, Math.min(2.0, profile.speakingRate * rules.speakingRateModifier)).toFixed(3)),
      stability: profile.stability ?? 1.0,
      expressiveness: Number(Math.max(0.0, Math.min(2.0, (profile.expressiveness ?? 1.0) * rules.expressivenessModifier)).toFixed(3)),
      warmth: Number(Math.max(0.0, Math.min(2.0, (profile.warmth ?? 1.0) * rules.warmthModifier)).toFixed(3)),
      authority: Number(Math.max(0.0, Math.min(2.0, (profile.authority ?? 1.0) * rules.authorityModifier)).toFixed(3)),
      energy: Number(Math.max(0.0, Math.min(2.0, (profile.energy ?? 1.0) * rules.energyModifier)).toFixed(3)),
      formality: profile.formality ?? 1.0
    });
  }

  async updateProfile(employeeId: string, data: any) {
    const { enabled, provider, voiceId, providerVoiceId, voiceFamily, language, pitch, speakingRate, warmth, authority, energy, formality } = data;
    return this.prisma.voiceProfile.update({
      where: { employeeId },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(provider !== undefined && { provider }),
        ...(voiceId !== undefined && { voiceId }),
        ...(providerVoiceId !== undefined && { providerVoiceId }),
        ...(voiceFamily !== undefined && { voiceFamily }),
        ...(language !== undefined && { language }),
        ...(pitch !== undefined && { pitch }),
        ...(speakingRate !== undefined && { speakingRate }),
        ...(warmth !== undefined && { warmth }),
        ...(authority !== undefined && { authority }),
        ...(energy !== undefined && { energy }),
        ...(formality !== undefined && { formality })
      }
    });
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string) {
    const configuredProviderName = process.env.STT_PROVIDER || 'mock-stt';
    const provider = this.sttProviders.get(configuredProviderName);
    
    if (!provider || !provider.isAvailable()) {
      throw new Error('No Speech-to-Text provider is available or configured');
    }

    return provider.transcribe({ audioBuffer, mimeType });
  }
}
