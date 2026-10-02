import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { RelationshipService } from './relationship.service';


@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationshipService: RelationshipService,
    @Inject(forwardRef(() => SimulationEngineService)) private readonly simulationEngine: SimulationEngineService,
  ) {}

  async scheduleMeeting(
    companyId: string,
    organizerId: string,
    title: string,
    scheduledAt: Date,
    durationMinutes: number,
    participantIds: string[],
    projectId?: string,
    departmentId?: string,
    description?: string,
  ) {
    const allIds = Array.from(new Set([organizerId, ...participantIds]));
    
    // Validate employees belong to the company
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: allIds }, companyId }
    });
    if (emps.length !== allIds.length) {
      throw new ForbiddenException('One or more employees do not belong to the company');
    }

    const meeting = await this.prisma.meeting.create({
      data: {
        companyId,
        organizerEmployeeId: organizerId,
        title,
        description,
        scheduledAt,
        durationMinutes,
        projectId,
        departmentId,
        participants: {
          create: allIds.map(id => ({
            employeeId: id,
            attendanceStatus: id === organizerId ? 'ACCEPTED' : 'INVITED'
          }))
        }
      },
      include: { participants: true }
    });

    // Fire calendar events for participants in simulation
    for (const pid of allIds) {
      if (pid !== organizerId) {
        this.simulationEngine.dispatchCustomEvent(companyId, pid, {
          type: 'MEETING_INVITE_RECEIVED',
          meetingId: meeting.id,
          title,
          scheduledAt,
        });
      }
    }

    return meeting;
  }

  async getMeeting(companyId: string, meetingId: string, viewerId?: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { participants: true, agendaItems: true, notes: true, actionItems: true }
    });

    if (!meeting || meeting.companyId !== companyId) {
      throw new NotFoundException('Meeting not found');
    }

    if (viewerId) {
      const isParticipant = meeting.participants.some(p => p.employeeId === viewerId);
      if (!isParticipant) {
        throw new ForbiddenException('Not a participant of this meeting');
      }
    }

    return meeting;
  }

  async startMeeting(companyId: string, meetingId: string, initiatorId: string) {
    const meeting = await this.getMeeting(companyId, meetingId, initiatorId);
    if (meeting.status !== 'SCHEDULED') throw new BadRequestException('Meeting cannot be started');
    
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      }
    });

    // Update participants' activity to IN_MEETING
    const participantIds = meeting.participants.map(p => p.employeeId);
    if (participantIds.length > 0) {
      await this.prisma.employee.updateMany({
        where: { id: { in: participantIds } },
        data: { activity: 'IN_MEETING' }
      });
    }

    return updated;
  }

  async completeMeeting(companyId: string, meetingId: string, initiatorId: string) {
    const meeting = await this.getMeeting(companyId, meetingId, initiatorId);
    if (meeting.status !== 'IN_PROGRESS') throw new BadRequestException('Only in-progress meetings can be completed');

    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      }
    });

    // Reset participants' activity to IDLE (or could be fetched prior, but IDLE is safe fallback)
    const participantIds = meeting.participants.map(p => p.employeeId);
    if (participantIds.length > 0) {
      await this.prisma.employee.updateMany({
        where: { id: { in: participantIds } },
        data: { activity: 'IDLE' }
      });

      // Track relationship metrics
      this.relationshipService.trackMeeting(companyId, participantIds).catch((e) => this.logger.error(e?.message ?? e));
    }

    return updated;
  }

  async addAgendaItem(meetingId: string, title: string, description?: string) {
    return this.prisma.meetingAgendaItem.create({
      data: { meetingId, title, description }
    });
  }

  async addNote(companyId: string, meetingId: string, authorId: string, content: string) {
    await this.getMeeting(companyId, meetingId, authorId);
    return this.prisma.meetingNote.create({
      data: {
        meetingId,
        authorEmployeeId: authorId,
        content
      }
    });
  }

  async addActionItem(companyId: string, meetingId: string, authorId: string, title: string, description?: string, assignedToId?: string) {
    await this.getMeeting(companyId, meetingId, authorId);
    return this.prisma.meetingActionItem.create({
      data: {
        meetingId,
        title,
        description,
        assignedEmployeeId: assignedToId
      }
    });
  }
}
