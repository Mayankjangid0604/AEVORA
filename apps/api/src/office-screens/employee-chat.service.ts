import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { companyProfile } from '../config/company';

/** Token budget: one reply per employee every 15 s, and at most 40 replies per company per hour (in-memory). */
export const PER_EMPLOYEE_MS = 15_000;
export const PER_HOUR = 40;

export class ChatLimiter {
  private lastByEmployee = new Map<string, number>();
  private byCompany = new Map<string, number[]>();
  /** null = allowed (and recorded); otherwise the reason it's refused. */
  take(companyId: string, employeeId: string, now = Date.now()): string | null {
    const last = this.lastByEmployee.get(employeeId);
    if (last !== undefined && now - last < PER_EMPLOYEE_MS) return 'busy';
    const hour = (this.byCompany.get(companyId) ?? []).filter((t) => now - t < 3_600_000);
    if (hour.length >= PER_HOUR) return 'hourly';
    hour.push(now); this.byCompany.set(companyId, hour); this.lastByEmployee.set(employeeId, now);
    return null;
  }
}

/** The Chairman talks to an employee in the office: a short in-character reply from the local model. */
@Injectable()
export class EmployeeChatService {
  private readonly logger = new Logger(EmployeeChatService.name);
  private readonly gateway = new ModelGateway();
  readonly limiter = new ChatLimiter();

  constructor(private readonly prisma: PrismaService) {}

  async reply(companyId: string, employeeId: string, text: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, status: { not: 'TERMINATED' } },
      select: { id: true, name: true, activity: true, role: { select: { title: true } }, department: { select: { name: true } }, voiceProfile: { select: { pitch: true, speakingRate: true } },
        assignedTasks: { where: { status: { in: ['IN_PROGRESS', 'READY'] } }, take: 1, orderBy: { updatedAt: 'desc' }, select: { title: true } } },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    const said = String(text ?? '').trim().slice(0, 500) || 'Hello!';
    const why = this.limiter.take(companyId, employeeId);
    if (why) throw new HttpException(why === 'busy' ? `${emp.name} is still answering, give them a moment.` : 'Office chat limit reached for this hour.', HttpStatus.TOO_MANY_REQUESTS);

    const task = emp.assignedTasks[0]?.title;
    const system = `You are ${emp.name}, ${emp.role?.title ?? 'an employee'}${emp.department?.name ? ` in ${emp.department.name}` : ''} at ${companyProfile().name}. `
      + `The Chairman (your boss) just spoke to you in the office. Reply in character, friendly and respectful, in at most 2 short sentences. `
      + `${task ? `You are currently working on: ${task}. ` : ''}Do not invent numbers. You cannot approve money, hiring, pricing or outreach.`;
    try {
      const out = (await this.gateway.callWithTier(ModelTier.LOCAL_BASIC, `Chairman: ${said}\n${emp.name}:`, system)).trim().replace(/^["']|["']$/g, '');
      return { employeeId: emp.id, name: emp.name, reply: out.slice(0, 400) || 'Yes, Chairman?', voice: emp.voiceProfile };
    } catch (e: any) {
      this.logger.warn(`Employee chat failed: ${e.message}`);
      return { employeeId: emp.id, name: emp.name, reply: 'Sorry Chairman, I can’t think straight right now (the model is offline).', voice: emp.voiceProfile };
    }
  }
}
