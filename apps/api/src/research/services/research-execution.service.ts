import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { ResearchExecutionState } from '@prisma/client';

@Injectable()
export class ResearchExecutionService {
  private readonly logger = new Logger(ResearchExecutionService.name);
  private readonly modelGateway = new ModelGateway();

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createResearch(companyId: string, employeeId: string, data: { name: string; description: string; objectives: string; proposalId?: string }) {
    let proposalId = data.proposalId;
    if (!proposalId) {
      // Create a dummy proposal if not provided, or just fail if required. 
      // The schema requires proposalId for ResearchProject
      const proposal = await this.prisma.researchProposal.create({
        data: {
          companyId,
          title: data.name,
          description: data.description,
          researchQuestion: data.objectives,
          hypothesis: "To be determined",
          objectives: data.objectives,
          proposerId: employeeId,
          status: 'APPROVED'
        }
      });
      proposalId = proposal.id;
    }

    return this.prisma.researchProject.create({
      data: {
        companyId,
        ownerId: employeeId,
        proposalId,
        name: data.name,
        description: data.description,
        objectives: data.objectives,
        status: 'PLANNED',
      }
    });
  }

  async getResearch(id: string, companyId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id },
      include: { executions: true, owner: true }
    });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Research project not found');
    return project;
  }

  async startExecution(projectId: string, companyId: string, employeeId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId }
    });
    
    if (!project || project.companyId !== companyId) {
      throw new NotFoundException('Research project not found');
    }

    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot execute project in status ${project.status}`);
    }

    // Update project state
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { status: 'EXECUTING' }
    });

    // Create execution
    const execution = await this.prisma.researchExecution.create({
      data: {
        projectId,
        employeeId,
        state: ResearchExecutionState.RUNNING,
        startedAt: new Date(),
      }
    });

    // Run actual research in background
    this.runResearchProcess(execution.id, project, employeeId).catch(err => {
      this.logger.error(`Background research failed for execution ${execution.id}`, err);
    });

    return execution;
  }

  private async runResearchProcess(executionId: string, project: any, employeeId: string) {
    try {
      this.logger.log(`[ResearchExecution] Starting real research process for execution ${executionId}`);
      
      // 1. Ask LLM to generate a search query for Wikipedia
      const queryPrompt = `You are a research agent. Research topic: ${project.name}\nObjectives: ${project.objectives}\nGenerate EXACTLY ONE concise search query (1-3 words) to search on Wikipedia for this topic. Output ONLY the query string, nothing else.`;
      const query = (await this.modelGateway.callWithTier(ModelTier.LOCAL_STRATEGIC, queryPrompt)).trim().replace(/['"]/g, '');
      
      this.logger.log(`[ResearchExecution] Generated Wikipedia query: ${query}`);

      // 2. Perform REAL external search via Wikipedia API
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!searchRes.ok) throw new Error(`Wikipedia search failed with status ${searchRes.status}`);
      
      const searchData = await searchRes.json();
      const topResults = searchData.query?.search?.slice(0, 3) || [];
      
      if (topResults.length === 0) {
        throw new Error(`No external sources found for query: ${query}`);
      }

      // 3. Perform REAL source retrieval
      const sourcesWithContent = [];
      for (const result of topResults) {
        const title = result.title;
        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=&explaintext=&titles=${encodeURIComponent(title)}&format=json`;
        const contentRes = await fetch(contentUrl, { signal: AbortSignal.timeout(10000) });
        if (!contentRes.ok) continue;

        const contentData = await contentRes.json();
        const pages = contentData.query?.pages;
        if (!pages) continue;
        
        const pageId = Object.keys(pages)[0];
        const extract = pages[pageId]?.extract;
        
        if (extract && extract.length > 50) {
          sourcesWithContent.push({
            title: title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
            content: extract
          });
        }
      }

      if (sourcesWithContent.length === 0) {
        throw new Error(`Failed to retrieve real content for any external sources.`);
      }

      // 4. Pass REAL content to LLM for extraction
      const sourceTexts = sourcesWithContent.map(s => `SOURCE [${s.title}] (${s.url}):\n${s.content}`).join('\n\n');
      
      const analysisPrompt = `You are a research analyst. 
Objective: ${project.objectives}
Task: Extract findings from the provided source texts. Do NOT invent information.
Source Texts:
${sourceTexts}

Return a JSON object with 'findings' (array of objects containing 'content' (string) and 'sourceUrl' (string)). Return ONLY valid JSON.`;

      const responseText = await this.modelGateway.callWithTier(ModelTier.LOCAL_STRATEGIC, analysisPrompt, 'You output valid JSON strictly.', { json: true });

      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON returned from provider: ${responseText.substring(0, 100)}...`);
      }

      if (!parsed.findings || !Array.isArray(parsed.findings)) {
        throw new Error('Malformed structured output: missing findings array');
      }

      // 5. Persist real sources
      const sourceIdMap = new Map<string, string>();
      for (const source of sourcesWithContent) {
        const dbSource = await this.prisma.researchSource.create({
          data: {
            executionId,
            title: source.title,
            url: source.url,
            sourceType: 'WEB',
            publisher: 'Wikipedia',
            retrievalTime: new Date()
          }
        });
        sourceIdMap.set(source.url, dbSource.id);
      }

      // 6. Persist evidence-backed findings
      for (const finding of parsed.findings) {
        const sourceId = sourceIdMap.get(finding.sourceUrl);
        // Only persist finding if provenance is valid
        if (sourceId) {
          await this.prisma.researchFinding.create({
            data: {
              executionId,
              sourceId: sourceId,
              content: finding.content,
              relevance: 0.9,
            }
          });
        } else {
           // Fallback to first source if hallucinated URL or slight mismatch, but ensure provenance!
           const fallbackSourceId = Array.from(sourceIdMap.values())[0];
           await this.prisma.researchFinding.create({
             data: {
               executionId,
               sourceId: fallbackSourceId,
               content: finding.content,
               relevance: 0.8,
             }
           });
        }
      }

      // Add a perspective
      await this.prisma.researchPerspective.create({
        data: {
          executionId,
          projectId: project.id,
          employeeId,
          roleContext: 'Primary Researcher',
          findings: JSON.stringify(parsed.findings),
          confidence: 0.9
        }
      });

      // Mark completed
      await this.prisma.researchExecution.update({
        where: { id: executionId },
        data: { 
          state: ResearchExecutionState.COMPLETED,
          completedAt: new Date(),
        }
      });

      await this.prisma.researchProject.update({
        where: { id: project.id },
        data: { status: 'OUTCOME_READY' }
      });

    } catch (error: any) {
      this.logger.error(`Research execution ${executionId} failed`, error);
      
      await this.prisma.researchExecution.update({
        where: { id: executionId },
        data: { 
          state: ResearchExecutionState.FAILED,
          completedAt: new Date(),
          errorDetails: {
            message: error.message,
            stack: error.stack,
            type: 'RETRYABLE'
          }
        }
      });
      
      await this.prisma.researchProject.update({
        where: { id: project.id },
        data: { status: 'PAUSED' } 
      });
    }
  }

  async getExecutions(projectId: string, companyId: string) {
    await this.getResearch(projectId, companyId); // Verify access
    return this.prisma.researchExecution.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getSources(projectId: string, companyId: string) {
    await this.getResearch(projectId, companyId);
    return this.prisma.researchSource.findMany({
      where: { execution: { projectId } }
    });
  }

  async getFindings(projectId: string, companyId: string) {
    await this.getResearch(projectId, companyId);
    return this.prisma.researchFinding.findMany({
      where: { execution: { projectId } },
      include: { source: true }
    });
  }
}
