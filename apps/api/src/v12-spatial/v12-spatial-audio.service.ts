import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAudibleSources, SpatialAudioSource, SpatialAudioListener, AudibleSource } from '@aevora/shared';

/**
 * Real runtime consumer of the spatial-audio abstraction (packages/shared/src/v12/spatial-audio.ts).
 *
 * Audio sources are never fabricated or ambient: the ONLY sources this service produces are real
 * employees currently IN_MEETING in the listener's own company, positioned at their real
 * V12NavigationNode location. There is no idle chatter, no crowd simulation, no background traffic.
 * A source's priority is derived from the same authoritative Role.accessLevel V12VehicleService
 * already uses for vehicle classification (CHAIRMAN/MANAGEMENT get priority), never invented.
 *
 * Actual browser audio playback (Web Audio API `AudioListener`/`PositionalAudio`) is an explicit,
 * named boundary this service does not cross — it resolves WHICH sources would be audible and at
 * what gain; wiring that to speakers requires a running browser session.
 */
@Injectable()
export class V12SpatialAudioService {
  private readonly logger = new Logger(V12SpatialAudioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves which real, authoritative conversation sources are audible to a listener positioned
   * at a given node, in the listener's own company only.
   */
  async resolveAudibleSourcesForListener(companyId: string, listenerNodeId: string): Promise<AudibleSource[]> {
    const listenerNode = await this.prisma.v12NavigationNode.findUnique({ where: { id: listenerNodeId } });
    if (!listenerNode) return [];

    const listener: SpatialAudioListener = { companyId, position: { x: listenerNode.posX, y: listenerNode.posY, z: listenerNode.posZ } };

    // Real authoritative sources only: employees of this company currently IN_MEETING.
    const speakingEmployees = await this.prisma.employee.findMany({
      where: { companyId, activity: 'IN_MEETING' },
      include: { role: true },
    });

    const sources: SpatialAudioSource[] = [];
    for (const emp of speakingEmployees) {
      const movement = await this.prisma.v12SpatialMovementState.findUnique({ where: { entityId: emp.id } });
      const nodeId = movement?.currentNodeId;
      if (!nodeId) continue; // no known position — never guesses one
      const node = await this.prisma.v12NavigationNode.findUnique({ where: { id: nodeId } });
      if (!node) continue;

      const priority = emp.role?.accessLevel === 'CHAIRMAN' ? 10 : emp.role?.accessLevel === 'MANAGEMENT' ? 5 : 1;
      sources.push({
        id: emp.id,
        companyId: emp.companyId,
        position: { x: node.posX, y: node.posY, z: node.posZ },
        priority,
        muted: false,
      });
    }

    return resolveAudibleSources(sources, listener);
  }
}
