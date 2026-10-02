import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientMeetingStatus } from '@prisma/client';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';

@Injectable()
export class ClientMeetingService {
  private readonly logger = new Logger(ClientMeetingService.name);
  private gateway = new ModelGateway();

  constructor(private readonly prisma: PrismaService) {}

  // 1. Client Requests Meeting
  async requestMeeting(companyId: string, clientId: string, timezone?: string, threadId?: string) {
    const meeting = await this.prisma.clientMeeting.create({
      data: {
        companyId,
        clientId,
        status: 'REQUESTED',
        timezone,
        threadId,
        proposedTimes: []
      }
    });
    this.logger.log(`Meeting REQUESTED by client ${clientId}. Owner must propose times.`);
    
    // Auto-transition to WAITING_FOR_OWNER_TIME
    return this.prisma.clientMeeting.update({
      where: { id: meeting.id },
      data: { status: 'WAITING_FOR_OWNER_TIME' }
    });
  }

  // 2. Owner Proposes Time
  async ownerProposesTime(meetingId: string, companyId: string, employeeId: string, times: string[]) {
    const meeting = await this.prisma.clientMeeting.findUnique({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    
    // Must be authorized (implied by employeeId route scope)
    if (meeting.status !== 'WAITING_FOR_OWNER_TIME' && meeting.status !== 'CLIENT_PROPOSED_ALTERNATIVE') {
      throw new BadRequestException('Cannot propose time from this state');
    }

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: { 
        proposedTimes: times, 
        status: 'WAITING_FOR_CLIENT_CONFIRMATION' 
      }
    });
  }

  // 3. Client Confirms Time
  async clientConfirmsTime(meetingId: string, confirmedTimeISO: string) {
    const meeting = await this.prisma.clientMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'WAITING_FOR_CLIENT_CONFIRMATION') {
      throw new BadRequestException('Cannot confirm from this state');
    }

    // Attempt to schedule with external provider
    const link = await this.scheduleExternalMeet(meeting.companyId, meetingId, confirmedTimeISO);

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: { 
        confirmedTime: new Date(confirmedTimeISO),
        status: 'CONFIRMED',
        link 
      }
    });
  }

  // 4. Client Proposes Alternative
  async clientProposesAlternative(meetingId: string, alternativeTimes: string[]) {
    const meeting = await this.prisma.clientMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'WAITING_FOR_CLIENT_CONFIRMATION') {
      throw new BadRequestException('Cannot propose alternative from this state');
    }

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: {
        proposedTimes: alternativeTimes,
        status: 'WAITING_FOR_OWNER_CONFIRMATION'
      }
    });
  }

  // 5. Owner Confirms Alternative
  async ownerConfirmsAlternative(meetingId: string, companyId: string, confirmedTimeISO: string) {
    const meeting = await this.prisma.clientMeeting.findUnique({ where: { id: meetingId, companyId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status !== 'WAITING_FOR_OWNER_CONFIRMATION') {
      throw new BadRequestException('Cannot confirm from this state');
    }

    const link = await this.scheduleExternalMeet(meeting.companyId, meetingId, confirmedTimeISO);

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: {
        confirmedTime: new Date(confirmedTimeISO),
        status: 'CONFIRMED',
        link
      }
    });
  }

  // 6. External Meet Integration
  private async scheduleExternalMeet(companyId: string, meetingId: string, time: string): Promise<string> {
    // Audit Requirement: IF credentials unavailable, DO NOT fake it.
    // Return EXTERNAL_INTEGRATION_REQUIRED / NOT_CONFIGURED
    this.logger.warn(`[Google Meet Integration] Google Calendar API not configured. Falling back to explicit failure state.`);
    return 'NOT_CONFIGURED';
  }

  // 7. Complete Meeting
  async completeMeeting(meetingId: string, companyId: string) {
    return this.prisma.clientMeeting.update({
      where: { id: meetingId, companyId },
      data: { status: 'COMPLETED' }
    });
  }

  // 8. Submit Notes/Transcript
  async submitNotesOrTranscript(meetingId: string, companyId: string, content: string, isTranscript: boolean) {
    // If it's a transcript, we extract notes via AI. If it's just raw notes, we can also extract structure.
    const meeting = await this.prisma.clientMeeting.findUniqueOrThrow({ where: { id: meetingId, companyId } });
    
    // Simulate real transcript recording/transcription capability not existing natively
    if (isTranscript) {
      this.logger.warn(`[Recording] Native recording unavailable, accepting supplied transcript for meeting ${meetingId}`);
    }

    const prompt = `Extract structured meeting notes from the following text.
Include: summary, goals, functional_requirements, non_functional_requirements, requested_features, integrations, deadline, budget, decisions, open_questions, action_items, commitments.
Return as strictly valid JSON without any markdown formatting or hyphens before keys.

Text:
${content}`;

    const rawJson = await this.gateway.callWithTier(ModelTier.GEMINI, prompt, undefined, { json: true });
    const parsed = JSON.parse(rawJson);

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: {
        transcript: isTranscript ? content : undefined,
        extractedNotes: parsed,
        status: 'NOTES_READY'
      }
    });
  }

  // 9. Owner Approves Requirements
  async approveRequirements(meetingId: string, companyId: string, editedNotes: any) {
    const meeting = await this.prisma.clientMeeting.findUniqueOrThrow({ where: { id: meetingId, companyId } });
    if (meeting.status !== 'NOTES_READY') throw new BadRequestException('Notes not ready for approval');

    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: {
        extractedNotes: editedNotes,
        notesApprovedAt: new Date()
      }
    });
  }

  // 10. Associate with Project
  async associateWithProject(meetingId: string, companyId: string, projectId: string) {
    const meeting = await this.prisma.clientMeeting.findUniqueOrThrow({ where: { id: meetingId, companyId } });
    if (!meeting.notesApprovedAt) throw new BadRequestException('Notes must be approved by owner before project association');
    
    return this.prisma.clientMeeting.update({
      where: { id: meetingId },
      data: {
        projectId,
        status: 'ADDED_TO_PROJECT'
      }
    });
  }
}
