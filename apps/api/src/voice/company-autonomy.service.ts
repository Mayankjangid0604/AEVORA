import { Injectable, Logger, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { CompanyConversationService } from './company-conversation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyMovementService } from './company-movement.service';
import { randomUUID } from 'crypto';

export type AutonomyState = 'ACTIVE' | 'PAUSED' | 'DISABLED';
export type EmployeeStatus = 'AVAILABLE' | 'IN_CONVERSATION' | 'BUSY';

export interface AutonomousEvent {
  id: string;
  sourceEventId?: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  topic: string;
  description: string;
  timestamp: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'EXPIRED';
}

export interface StreamPayload {
  type: 'AUTONOMOUS_STATE_CHANGED' | 'CONVERSATION_STARTED' | 'TURN_GENERATED' | 'CONVERSATION_COMPLETED' | 'AUTONOMOUS_EVENT';
  conversationId?: string;
  timestamp: number;
  speakerEmployeeId?: string;
  payload: any;
}

@Injectable()
export class CompanyAutonomyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyAutonomyService.name);
  
  private state: AutonomyState = 'DISABLED';
  private eventQueue: AutonomousEvent[] = [];
  
  // Real-time Event Stream (SSE)
  private readonly stream$ = new Subject<{ data: StreamPayload }>();
  
  // Track active autonomous conversations to prevent loops and limits
  private activeConversations = new Map<string, {
    turnsLeft: number;
    participants: string[];
    lastTurnTimestamp: number;
    status: 'GATHERING' | 'ACTIVE' | 'PAUSED';
    topic: string;
    description: string;
    priority: string;
  }>();

  // Track employee availability to prevent overlapping conversations
  private employeeStatus = new Map<string, EmployeeStatus>();

  private tickInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly conversationService: CompanyConversationService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CompanyMovementService))
    private readonly movementService: CompanyMovementService,
  ) {}

  onModuleInit() {
    // Check every 3 seconds for new events to process
    this.tickInterval = setInterval(() => this.processAutonomyLoop(), 3000).unref();
  }

  onModuleDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.stream$.complete();
  }

  getState(): AutonomyState {
    return this.state;
  }

  setState(newState: AutonomyState) {
    this.state = newState;
    this.broadcast({
      type: 'AUTONOMOUS_STATE_CHANGED',
      timestamp: Date.now(),
      payload: { state: newState }
    });
  }

  getStream(): Observable<{ data: StreamPayload }> {
    return this.stream$.asObservable();
  }

  public broadcast(payload: StreamPayload) {
    this.stream$.next({ data: payload });
  }

  queueEvent(priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL', topic: string, description: string) {
    const event: AutonomousEvent = {
      id: randomUUID(),
      priority,
      topic,
      description,
      timestamp: Date.now(),
      status: 'PENDING'
    };
    
    // Bounded queue (keep max 100)
    if (this.eventQueue.length >= 100) {
      this.eventQueue.shift(); 
    }
    this.eventQueue.push(event);

    this.broadcast({
      type: 'AUTONOMOUS_EVENT',
      timestamp: Date.now(),
      payload: event
    });
  }

  private async processAutonomyLoop() {
    if (this.isProcessing || this.state === 'DISABLED') return;
    this.isProcessing = true;

    try {
      // 1. Advance active conversations
      for (const [convId, state] of this.activeConversations.entries()) {
        if (state.status === 'GATHERING') {
          // Check if everyone has arrived (for simplicity, we assume they arrive after 10-20 seconds or we track it explicitly)
          // For now, let's just check if they are in the meeting room (which the MovementService handles)
          // In a real system we'd listen for ARRIVED events, but here we can just wait 10s then start.
          if (Date.now() - state.lastTurnTimestamp > 10000) {
            state.status = 'ACTIVE';
            this.broadcast({
              type: 'CONVERSATION_STARTED',
              conversationId: convId,
              timestamp: Date.now(),
              payload: {
                subject: state.topic,
                participants: state.participants
              }
            });
          }
          continue;
        }

        if (state.status !== 'ACTIVE' || this.state === 'PAUSED') continue;
        
        const timeSinceLastTurn = Date.now() - state.lastTurnTimestamp;
        // Basic pacing: wait ~10 seconds between autonomous turns (in reality this would track audio length)
        if (timeSinceLastTurn < 10000) continue;

        if (state.turnsLeft <= 0) {
          this.endConversation(convId);
          continue;
        }

        try {
          const turn = await this.conversationService.generateNextTurn(convId);
          state.turnsLeft--;
          state.lastTurnTimestamp = Date.now();
          
          this.broadcast({
            type: 'TURN_GENERATED',
            conversationId: convId,
            timestamp: Date.now(),
            speakerEmployeeId: turn.speakerEmployeeId,
            payload: turn
          });
        } catch (err) {
          this.logger.error(`Failed to generate turn for autonomous conv ${convId}`, err);
          this.endConversation(convId);
        }
      }

      // 2. Start new conversations from events if we are ACTIVE and below capacity limit
      if (this.state === 'ACTIVE' && this.activeConversations.size < 2) {
        // Find highest priority pending event
        const pendingEvents = this.eventQueue.filter(e => e.status === 'PENDING').sort((a, b) => {
          const pOrder = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
          return pOrder[b.priority] - pOrder[a.priority] || a.timestamp - b.timestamp;
        });

        if (pendingEvents.length > 0) {
          const event = pendingEvents[0];
          await this.startConversationFromEvent(event);
        }
      }

    } catch (err) {
      this.logger.error('Error in autonomy loop', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async startConversationFromEvent(event: AutonomousEvent) {
    event.status = 'PROCESSING';
    
    // Naive participant selection based on event topic (In a full prod system, use an LLM or rigid rules to map topics to Departments)
    const employees = await this.prisma.employee.findMany({ include: { role: true, department: true } });
    if (employees.length === 0) {
      event.status = 'EXPIRED';
      return;
    }

    const participants = [];
    
    // CRITICAL events involve CEO and Chairman Assistant
    if (event.priority === 'CRITICAL' || event.priority === 'HIGH') {
       participants.push('system:assistant');
       const ceo = employees.find(e => e.role?.title?.toLowerCase().includes('ceo'));
       if (ceo) participants.push(ceo.id);
    }

    // Pick 1-2 other relevant employees depending on keywords
    const deptName = event.topic.toLowerCase().includes('finance') ? 'finance' : 
                     event.topic.toLowerCase().includes('sales') ? 'sales' : 'it';
    
    const relevant = employees.filter(e => e.department?.name?.toLowerCase().includes(deptName) && !participants.includes(e.id));
    if (relevant.length > 0) participants.push(relevant[0].id);

    // If nobody found, just pick a random manager
    if (participants.length === 0) {
      participants.push(employees[0].id);
    }

    // Filter out busy participants
    const availableParticipants = participants.filter(p => (this.employeeStatus.get(p) || 'AVAILABLE') === 'AVAILABLE');
    if (availableParticipants.length < participants.length) { // Wait for everyone needed
      // Defer event
      event.status = 'PENDING';
      event.timestamp = Date.now(); // bump to back of queue
      return;
    }

    // Mark as busy
    availableParticipants.forEach(p => this.employeeStatus.set(p, 'IN_CONVERSATION'));

    try {
      const conv = await this.conversationService.createConversation(
        availableParticipants,
        event.topic,
        event.description,
        event.priority === 'CRITICAL' ? 'CRITICAL' : (event.priority === 'HIGH' ? 'URGENT' : 'NORMAL')
      );

      this.activeConversations.set(conv.id, {
        turnsLeft: event.priority === 'CRITICAL' ? 6 : 4,
        participants: availableParticipants,
        lastTurnTimestamp: Date.now(), // gathering start time
        status: 'GATHERING',
        topic: event.topic,
        description: event.description,
        priority: event.priority
      });

      // Command everyone to move to the meeting room
      const meetingRoom = await this.prisma.officeLocation.findFirst({ where: { type: 'MEETING_ROOM' } });
      if (meetingRoom) {
        for (const p of availableParticipants) {
          if (!p.startsWith('system:')) {
            await this.movementService.moveEmployeeToLocation(p, meetingRoom.id);
          }
        }
      } else {
        // Fallback if no meeting room
        this.activeConversations.get(conv.id)!.status = 'ACTIVE';
        this.broadcast({
          type: 'CONVERSATION_STARTED',
          conversationId: conv.id,
          timestamp: Date.now(),
          payload: {
            subject: conv.subject,
            participants: conv.participants
          }
        });
      }
      
      event.status = 'COMPLETED';
    } catch (err) {
      this.logger.error('Failed to create autonomous conversation', err);
      event.status = 'COMPLETED'; // consume to avoid infinite loop
      availableParticipants.forEach(p => this.employeeStatus.set(p, 'AVAILABLE'));
    }
  }

  private endConversation(convId: string) {
    const state = this.activeConversations.get(convId);
    if (!state) return;
    
    this.conversationService.stopConversation(convId);
    state.participants.forEach(async p => {
      this.employeeStatus.set(p, 'AVAILABLE');
      if (!p.startsWith('system:')) {
        const emp = await this.prisma.employee.findUnique({ where: { id: p }, include: { department: true } });
        if (emp && emp.departmentId) {
          const deptLoc = await this.prisma.officeLocation.findFirst({ where: { departmentId: emp.departmentId } });
          if (deptLoc) {
            await this.movementService.moveEmployeeToLocation(p, deptLoc.id);
          }
        }
      }
    });
    this.activeConversations.delete(convId);

    this.broadcast({
      type: 'CONVERSATION_COMPLETED',
      conversationId: convId,
      timestamp: Date.now(),
      payload: {}
    });
  }

  stopAllConversations() {
    for (const convId of this.activeConversations.keys()) {
      this.endConversation(convId);
    }
  }
}
