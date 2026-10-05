import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from './voice.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { SpeechContext } from './speech-style.service';
import { randomUUID } from 'crypto';
import { VoiceGenerationResult } from './voice-provider.interface';

export interface ConversationTurn {
  id: string;
  speakerEmployeeId: string;
  speakerName: string;
  speakerRole: string;
  speakerDepartment: string;
  text: string;
  context?: SpeechContext;
  audioResult?: VoiceGenerationResult;
  timestamp: number;
}

export interface CompanyConversation {
  id: string;
  participants: any[];
  turns: ConversationTurn[];
  subject: string;
  eventContext: string;
  urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
  status: 'ACTIVE' | 'STOPPED';
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class CompanyConversationService {
  private readonly logger = new Logger(CompanyConversationService.name);
  
  // Transient conversation memory
  private conversations: Map<string, CompanyConversation> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly voiceService: VoiceService,
    private readonly gateway: ModelGateway
  ) {}

  async createConversation(participantIds: string[], subject: string, eventContext: string, urgency: 'NORMAL' | 'URGENT' | 'CRITICAL' = 'NORMAL') {
    if (!participantIds || participantIds.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    const participants = [];
    for (const id of participantIds) {
      if (id === 'system:assistant') {
        participants.push({
          id: 'system:assistant',
          name: 'Chairman Assistant',
          roleTitle: 'Chairman Assistant',
          departmentName: 'Executive',
          hierarchyLevel: 10
        });
        continue;
      }
      
      const emp = await this.prisma.employee.findUnique({
        where: { id },
        include: { role: true, department: true }
      });
      if (!emp) throw new BadRequestException(`Employee ${id} not found`);
      participants.push({
        id: emp.id,
        name: emp.name,
        roleTitle: emp.role?.title || 'Employee',
        departmentName: emp.department?.name || 'General',
        hierarchyLevel: emp.role?.level || 1
      });
    }

    const id = randomUUID();
    const conv: CompanyConversation = {
      id,
      participants,
      turns: [],
      subject,
      eventContext,
      urgency,
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.conversations.set(id, conv);
    return conv;
  }

  getConversation(id: string) {
    const conv = this.conversations.get(id);
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  stopConversation(id: string) {
    const conv = this.getConversation(id);
    conv.status = 'STOPPED';
    conv.updatedAt = Date.now();
    return conv;
  }

  async generateNextTurn(id: string, forceSpeakerId?: string) {
    const conv = this.getConversation(id);
    if (conv.status !== 'ACTIVE') {
      throw new BadRequestException('Conversation is stopped');
    }

    // Prepare LLM context
    const participantList = conv.participants.map(p => `- ${p.name} (ID: ${p.id}, Role: ${p.roleTitle}, Dept: ${p.departmentName}, Level: ${p.hierarchyLevel})`).join('\n');
    
    let history = conv.turns.map(t => `${t.speakerName} [${t.speakerRole}] (${t.context?.emotion || 'NORMAL'}): "${t.text}"`).join('\n\n');
    if (!history) history = "No turns yet. Start the conversation.";
    else if (conv.turns.length > 10) {
       history = "...(previous turns omitted)...\n\n" + conv.turns.slice(-10).map(t => `${t.speakerName} [${t.speakerRole}] (${t.context?.emotion || 'NORMAL'}): "${t.text}"`).join('\n\n');
    }

    const prompt = `You are the AEVORA Company Simulation Engine. Generate the NEXT single turn for the conversation.
DO NOT invent arbitrary characters. You MUST select ONE speaker exactly from the provided participants list.
The speaker's ID must precisely match their ID from the list.

COMPANY EVENT CONTEXT:
${conv.eventContext}

SUBJECT: ${conv.subject}
URGENCY: ${conv.urgency}

PARTICIPANTS:
${participantList}

CONVERSATION HISTORY:
${history}

${forceSpeakerId ? `\nCRITICAL: You MUST make the next speaker be the participant with ID: ${forceSpeakerId}\n` : ''}

Respond ONLY with valid JSON exactly matching this format:
{
  "speakerEmployeeId": "ID of the chosen speaker from the participant list",
  "text": "The spoken text for this turn (keep it concise, realistic, and appropriate for their role)",
  "emotion": "One of: NORMAL, URGENT, HAPPY, CONCERNED, EXCITED, FRUSTRATED, CONFIDENT, SYMPATHETIC, FORMAL",
  "emotionIntensity": 0.8 // float between 0.0 and 1.0
}
Do NOT output markdown code blocks. Just the raw JSON.`;

    let generatedObj;
    try {
      const response = await this.gateway.callWithTier(
        ModelTier.LOCAL_BASIC,
        prompt,
        'You are an expert dialogue writer for professional corporate simulations. Output only strict JSON.',
        { json: true }
      );
      
      const cleanJson = response.replace(/^```json/g, '').replace(/```$/g, '').trim();
      generatedObj = JSON.parse(cleanJson);
    } catch (err) {
      this.logger.error('Failed to generate LLM turn', err);
      throw new BadRequestException('Failed to generate conversation turn from AI');
    }

    const speaker = conv.participants.find(p => p.id === generatedObj.speakerEmployeeId);
    if (!speaker) {
      this.logger.error(`LLM hallucinated speaker ID: ${generatedObj.speakerEmployeeId}`);
      throw new BadRequestException('AI generated an invalid participant ID');
    }

    const speechContext: SpeechContext = {
      urgency: conv.urgency,
      emotion: generatedObj.emotion || 'NORMAL',
      emotionIntensity: generatedObj.emotionIntensity ?? 1.0,
      reason: conv.eventContext,
      eventType: conv.subject
    };

    // Generate Audio
    let audioResult: VoiceGenerationResult;
    try {
      audioResult = await this.voiceService.generateSpeech(speaker.id, generatedObj.text, speechContext);
    } catch (err) {
      this.logger.warn(`Failed to generate audio for ${speaker.id}, continuing gracefully.`, err);
      // Construct a minimal fallback so the UI handles it via browser TTS
      audioResult = {
        provider: 'fallback',
        text: generatedObj.text,
        browserFallback: true
      };
    }

    const turn: ConversationTurn = {
      id: randomUUID(),
      speakerEmployeeId: speaker.id,
      speakerName: speaker.name,
      speakerRole: speaker.roleTitle,
      speakerDepartment: speaker.departmentName,
      text: generatedObj.text,
      context: speechContext,
      audioResult,
      timestamp: Date.now()
    };

    conv.turns.push(turn);
    conv.updatedAt = Date.now();

    return turn;
  }
}
