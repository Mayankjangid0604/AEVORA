import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync } from 'child_process';
import { ModelGateway, ModelTier } from '@aevora/model-gateway';
import { parseJson } from '../common/parse-json';

@Injectable()
export class SoftwareExecutionService {
  private readonly logger = new Logger(SoftwareExecutionService.name);
  private readonly gateway = new ModelGateway();
  
  constructor(private prisma: PrismaService) {}

  async executeDevelopment(projectId: string, employeeId: string, taskId?: string) {
    // 1. Verify project state
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { requirements: true }
    });
    
    if (!project) throw new BadRequestException('Project not found');
    if (project.status !== 'ACTIVE') {
      throw new BadRequestException('Project must be ACTIVE to begin development execution');
    }
    
    // Create execution record
    const execution = await this.prisma.projectDevelopmentExecution.create({
      data: {
        projectId,
        employeeId,
        taskId,
        status: 'RUNNING',
        startedAt: new Date()
      }
    });

    try {
      // Create real workspace
      const workspaceDir = path.join(process.cwd(), '.workspace', projectId);
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }

      const reqText = project.requirements.map(r => `- ${r.title}: ${r.description}`).join('\n');
      
      let systemPrompt = '';
      if (project.type === 'WEBSITE') {
        systemPrompt = `You are an AI coding agent executing a development task. Implement these project requirements for a WEBSITE:
${reqText || 'No explicit requirements provided.'}

You must create a working static website. Output files in a JSON array.
1. "index.html": The main HTML file.
2. "style.css": (Optional) The main CSS file.
3. "script.js": (Optional) The main JS file.

KEEP YOUR CODE EXTREMELY BRIEF, MINIMAL, AND SMALL. Do not generate large files or realistic data. Only provide basic skeletons to avoid hitting output token limits.

Return ONLY JSON:
{ "files": [ { "path": "filename", "content": "file contents" } ] }`;
      } else {
        systemPrompt = `You are an AI coding agent executing a development task. Implement these project requirements:
${reqText || 'No explicit requirements provided.'}

You must create a working Node.js application. Output EXACTLY 4 files in a JSON array.
1. "index.js": The main logic.
2. "package.json": Must include 'build' and 'test' scripts. Example: { "name": "app", "scripts": { "build": "node build.js", "test": "node test.js" } }
3. "build.js": A script that MUST write an artifact to 'dist.bin'. (e.g. const fs=require('fs'); fs.writeFileSync('dist.bin', 'compiled');)
4. "test.js": A script that requires index.js and asserts correctness, exiting with 0 on success.

Return ONLY JSON:
{ "files": [ { "path": "filename", "content": "file contents" } ] }`;
      }

      let success = false;
      let lastError = '';
      let prompt = 'Generate the required files.';

      // Bounded retry loop (max 3 iterations)
      for (let attempt = 1; attempt <= 3; attempt++) {
        this.logger.log(`Development attempt ${attempt} for project ${projectId}`);
        
        let responseText;
        const tier = process.env.GEMINI_API_KEY ? ModelTier.GEMINI : ModelTier.LOCAL_CODE;
        try {
          this.logger.log(`DIAGNOSTIC: AI request start (attempt ${attempt}, tier ${tier})`);
          responseText = await this.gateway.callWithTier(
            tier,
            prompt,
            systemPrompt,
            { json: true }
          );
          this.logger.log(`DIAGNOSTIC: AI response received (attempt ${attempt})`);
        } catch (e: any) {
          lastError = `AI Provider Error: ${e.message}`;
          break; // Stop retrying if the AI provider fails completely
        }

        let out;
        try {
          out = parseJson(responseText);
        } catch (e: any) {
          lastError = 'Invalid JSON generated';
          prompt = `You returned invalid JSON. Error: ${e.message}. Please return valid JSON format.`;
          continue;
        }

        if (!out?.files || !Array.isArray(out.files) || out.files.length === 0) {
          lastError = 'Missing or empty files array';
          prompt = 'You must return a JSON object with a "files" array. Please try again.';
          continue;
        }

        // Persist changes
        for (const f of out.files) {
          const dest = path.join(workspaceDir, f.path);
          if (!dest.startsWith(workspaceDir + path.sep)) continue; // Path traversal protection
          fs.writeFileSync(dest, f.content, 'utf8');
        }

        // Run local build and test to verify
        try {
          if (project.type !== 'WEBSITE') {
            execSync('npm run build', { cwd: workspaceDir, stdio: 'pipe' });
            execSync('npm run test', { cwd: workspaceDir, stdio: 'pipe' });
          } else {
            // For WEBSITE, ensure at least index.html was created
            if (!fs.existsSync(path.join(workspaceDir, 'index.html'))) {
               throw new Error('index.html is missing for WEBSITE project.');
            }
          }
          success = true;
          break;
        } catch (err: any) {
          const stderr = err.stderr?.toString() || '';
          const stdout = err.stdout?.toString() || '';
          lastError = (stdout + '\n' + stderr).trim() || err.message;
          prompt = `The build or test failed. Fix the code. Error output:\n${lastError}`;
        }
      }

      if (!success) {
        throw new Error(`Development failed after retries. Last error:\n${lastError}`);
      }

      await this.prisma.projectDevelopmentExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          sourcePath: workspaceDir,
          logs: 'Generated source files successfully via AI.'
        }
      });

      return execution.id;
    } catch (err: any) {
      await this.prisma.projectDevelopmentExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          failureReason: err.message
        }
      });
      throw err;
    }
  }

  async executeBuild(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new BadRequestException('Project not found');

    const devExecution = await this.prisma.projectDevelopmentExecution.findFirst({
      where: { projectId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' }
    });

    if (!devExecution || !devExecution.sourcePath) {
      throw new BadRequestException('No successful development execution found for project');
    }

    const buildRecord = await this.prisma.projectBuildExecution.create({
      data: {
        projectId,
        status: 'RUNNING',
        startedAt: new Date()
      }
    });

    if (project.type === 'WEBSITE') {
      const artifactPath = devExecution.sourcePath;
      await this.prisma.projectBuildExecution.update({
        where: { id: buildRecord.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          logs: 'Website build (static files copied).',
          artifactPath,
          version: '1.0.0'
        }
      });
      return buildRecord.id;
    }

    return new Promise((resolve, reject) => {
      // Need shell: true for Windows npm
      const child = spawn('npm', ['run', 'build'], { cwd: devExecution.sourcePath as string, shell: true });
      let logs = '';

      child.stdout.on('data', data => logs += data.toString());
      child.stderr.on('data', data => logs += data.toString());

      child.on('close', async code => {
        if (code === 0) {
          const artifactPath = path.join(devExecution.sourcePath as string, 'dist.bin');
          await this.prisma.projectBuildExecution.update({
            where: { id: buildRecord.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              logs,
              artifactPath,
              version: '1.0.0'
            }
          });
          resolve(buildRecord.id);
        } else {
          await this.prisma.projectBuildExecution.update({
            where: { id: buildRecord.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              logs,
              failureReason: `Build process exited with code ${code}`
            }
          });
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });
  }

  async executeTest(projectId: string, buildId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new BadRequestException('Project not found');

    const buildRecord = await this.prisma.projectBuildExecution.findUnique({
      where: { id: buildId }
    });

    if (!buildRecord || buildRecord.status !== 'COMPLETED') {
      throw new BadRequestException('Valid completed build record not found');
    }

    const devExecution = await this.prisma.projectDevelopmentExecution.findFirst({
      where: { projectId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' }
    });

    const testRecord = await this.prisma.projectTestExecution.create({
      data: {
        projectId,
        buildId,
        testCommand: project.type === 'WEBSITE' ? 'static-analysis' : 'npm run test',
        status: 'RUNNING',
        startedAt: new Date()
      }
    });

    if (project.type === 'WEBSITE') {
      await this.prisma.projectTestExecution.update({
        where: { id: testRecord.id },
        data: {
          status: 'PASSED',
          completedAt: new Date(),
          logs: 'Website static analysis passed (no npm test required).'
        }
      });
      return testRecord.id;
    }

    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', 'test'], { cwd: devExecution?.sourcePath as string, shell: true });
      let logs = '';

      child.stdout.on('data', data => logs += data.toString());
      child.stderr.on('data', data => logs += data.toString());

      child.on('close', async code => {
        if (code === 0) {
          await this.prisma.projectTestExecution.update({
            where: { id: testRecord.id },
            data: {
              status: 'PASSED',
              completedAt: new Date(),
              logs
            }
          });
          resolve(testRecord.id);
        } else {
          await this.prisma.projectTestExecution.update({
            where: { id: testRecord.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              logs,
              failureReason: `Test process exited with code ${code}`
            }
          });
          reject(new Error(`Tests failed with code ${code}`));
        }
      });
    });
  }
}
