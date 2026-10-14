import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkspaceDescriptor,
  WorkspaceLifecycleStatus,
} from './project-delivery.types';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

@Injectable()
export class FactoryWorkspaceService {
  private readonly logger = new Logger(FactoryWorkspaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns canonical, isolated workspace path for a company and project.
   */
  getCanonicalWorkspacePath(companyId: string, projectId: string): string {
    return path.join(process.cwd(), '.workspace', companyId, projectId);
  }

  /**
   * Resolves and strictly validates the canonical workspace path on the server.
   * If a candidate path is supplied from a legacy caller, it must resolve identically
   * to the canonical path and not escape via traversal, symlinks, or reparse points.
   */
  resolveAndVerifyCanonicalWorkspace(
    companyId: string,
    projectId: string,
    candidatePath?: string,
  ): string {
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(companyId) || !idRegex.test(projectId)) {
      throw new BadRequestException('Invalid company or project identifier for workspace');
    }

    const rootWorkspace = path.resolve(process.cwd(), '.workspace');
    const canonicalDir = path.resolve(rootWorkspace, companyId, projectId);

    const relToRoot = path.relative(rootWorkspace, canonicalDir);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      throw new BadRequestException('Security violation: Workspace path escapes sandbox boundary');
    }

    if (candidatePath && typeof candidatePath === 'string' && candidatePath.trim().length > 0) {
      const resolvedCandidate = path.resolve(candidatePath);
      const isWindows = process.platform === 'win32';
      const normCanonical = isWindows ? canonicalDir.toLowerCase() : canonicalDir;
      const normCandidate = isWindows ? resolvedCandidate.toLowerCase() : resolvedCandidate;

      if (normCanonical !== normCandidate) {
        throw new BadRequestException('Security violation: Supplied workspaceDir does not match canonical project workspace');
      }

      if (fs.existsSync(resolvedCandidate)) {
        try {
          const realCandidate = fs.realpathSync.native ? fs.realpathSync.native(resolvedCandidate) : fs.realpathSync(resolvedCandidate);
          const realRoot = fs.existsSync(rootWorkspace)
            ? (fs.realpathSync.native ? fs.realpathSync.native(rootWorkspace) : fs.realpathSync(rootWorkspace))
            : rootWorkspace;
          const relReal = path.relative(realRoot, realCandidate);
          if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
            throw new BadRequestException('Security violation: Workspace path escapes sandbox boundary via symlink');
          }
        } catch (err: any) {
          if (err instanceof BadRequestException) throw err;
          throw new BadRequestException(`Security violation: Unable to verify workspace path integrity: ${err.message}`);
        }
      }
    }

    return canonicalDir;
  }

  /**
   * Allocates an isolated, safe local workspace for project execution.
   */
  async allocateWorkspace(companyId: string, projectId: string): Promise<WorkspaceDescriptor> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new BadRequestException(`Project ${projectId} not found`);
    if (project.companyId !== companyId) {
      throw new BadRequestException('Company and project mismatch');
    }

    const resolvedPath = this.resolveAndVerifyCanonicalWorkspace(companyId, projectId);

    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    // Optional local Git configuration (Purely local, zero remote requirement)
    const hasLocalGit = this.initializeOptionalLocalGit(resolvedPath);

    const descriptor: WorkspaceDescriptor = {
      projectId,
      companyId,
      localPath: resolvedPath,
      status: WorkspaceLifecycleStatus.ALLOCATED,
      hasLocalGit,
      gitBranch: hasLocalGit ? 'main' : undefined,
      allocatedAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.logger.log(`Allocated workspace for project ${projectId} at ${resolvedPath} (git: ${hasLocalGit})`);
    return descriptor;
  }

  /**
   * Optionally initializes local Git if binary is available, without requiring a remote.
   * Completely non-blocking if Git is absent or fails.
   */
  initializeOptionalLocalGit(dir: string): boolean {
    try {
      execSync('git --version', { stdio: 'pipe' });
      // If git CLI is available, initialize locally
      if (!fs.existsSync(path.join(dir, '.git'))) {
        execSync('git init -b main', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.name "Aevora Delivery Factory"', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.email "factory@aevora.local"', { cwd: dir, stdio: 'pipe' });
      }
      return true;
    } catch (e: any) {
      this.logger.debug(`Local Git optional initialization skipped or unavailable: ${e.message}`);
      return false;
    }
  }

  /**
   * Safely copies and archives build artifacts into persistent retention storage.
   * Strictly enforces that the source artifact path resides within the authorized
   * canonical project workspace (preventing traversal, cross-project access, symlink escapes,
   * prefix confusion, and silent overwrites).
   */
  async preserveArtifacts(
    companyId: string,
    projectId: string,
    sourceArtifactPath: string,
  ): Promise<string> {
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(companyId) || !idRegex.test(projectId)) {
      throw new BadRequestException('Invalid company or project identifier for workspace');
    }

    if (!sourceArtifactPath || typeof sourceArtifactPath !== 'string' || sourceArtifactPath.trim().length === 0) {
      throw new BadRequestException('Source artifact path is required');
    }

    // 1. Verify project ownership if database context is available
    if (this.prisma?.project?.findUnique) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        throw new BadRequestException(`Project ${projectId} not found`);
      }
      if (project.companyId !== companyId) {
        throw new BadRequestException('Company and project mismatch');
      }
    }

    // 2. Canonical workspace path for the authorized project
    const rootWorkspace = path.resolve(process.cwd(), '.workspace');
    const canonicalWorkspace = this.resolveAndVerifyCanonicalWorkspace(companyId, projectId);
    const isWindows = process.platform === 'win32';

    // 3. Resolve the source artifact path (relative resolves against canonicalWorkspace)
    const resolvedSource = path.isAbsolute(sourceArtifactPath)
      ? path.resolve(sourceArtifactPath)
      : path.resolve(canonicalWorkspace, sourceArtifactPath);

    // 4. Boundary check: source must be strictly within canonicalWorkspace and .workspace root
    const normCanonical = isWindows ? canonicalWorkspace.toLowerCase() : canonicalWorkspace;
    const normSource = isWindows ? resolvedSource.toLowerCase() : resolvedSource;
    const normRootWorkspace = isWindows ? rootWorkspace.toLowerCase() : rootWorkspace;

    const relToCanonical = path.relative(normCanonical, normSource);
    if (relToCanonical.startsWith('..') || path.isAbsolute(relToCanonical)) {
      throw new BadRequestException('Security violation: Source artifact path is outside authorized project workspace');
    }

    const relToRootWorkspace = path.relative(normRootWorkspace, normSource);
    if (relToRootWorkspace.startsWith('..') || path.isAbsolute(relToRootWorkspace)) {
      throw new BadRequestException('Security violation: Source artifact path is outside .workspace root');
    }

    // 5. Source existence check (performed after boundary verification)
    if (!fs.existsSync(resolvedSource)) {
      throw new BadRequestException(`Source artifact path does not exist: ${sourceArtifactPath}`);
    }

    // 6. Symlink / Junction / Reparse-point check for source
    try {
      const realSource = fs.realpathSync.native ? fs.realpathSync.native(resolvedSource) : fs.realpathSync(resolvedSource);
      const realCanonical = fs.existsSync(canonicalWorkspace)
        ? (fs.realpathSync.native ? fs.realpathSync.native(canonicalWorkspace) : fs.realpathSync(canonicalWorkspace))
        : canonicalWorkspace;
      const normRealCanonical = isWindows ? realCanonical.toLowerCase() : realCanonical;
      const normRealSource = isWindows ? realSource.toLowerCase() : realSource;

      const relReal = path.relative(normRealCanonical, normRealSource);
      if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
        throw new BadRequestException('Security violation: Source artifact path escapes sandbox boundary via symlink or reparse point');
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Security violation: Unable to verify artifact source path integrity: ${err.message}`);
    }

    // 7. Verify destination sandbox boundary
    const rootArtifacts = path.resolve(process.cwd(), '.artifacts');
    const targetDir = path.resolve(rootArtifacts, companyId, projectId);
    const normRootArtifacts = isWindows ? rootArtifacts.toLowerCase() : rootArtifacts;
    const normTargetDir = isWindows ? targetDir.toLowerCase() : targetDir;

    const relTarget = path.relative(normRootArtifacts, normTargetDir);
    if (relTarget.startsWith('..') || path.isAbsolute(relTarget) || normTargetDir === normRootArtifacts) {
      throw new BadRequestException('Security violation: Artifact path escapes sandbox boundary');
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 8. Safely preserve artifacts without silently deleting or overwriting
    const stat = fs.statSync(resolvedSource);
    let targetPath = '';

    const realCanonicalForFiles = fs.existsSync(canonicalWorkspace)
      ? (fs.realpathSync.native ? fs.realpathSync.native(canonicalWorkspace) : fs.realpathSync(canonicalWorkspace))
      : canonicalWorkspace;
    const normRealCanonicalForFiles = isWindows ? realCanonicalForFiles.toLowerCase() : realCanonicalForFiles;

    if (stat.isDirectory()) {
      targetPath = path.join(targetDir, 'bundle');
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const files = fs.readdirSync(resolvedSource);
      for (const file of files) {
        if (file === '.git' || file === 'node_modules') continue;
        const srcFile = path.join(resolvedSource, file);

        if (fs.existsSync(srcFile)) {
          try {
            const realFile = fs.realpathSync.native ? fs.realpathSync.native(srcFile) : fs.realpathSync(srcFile);
            const normRealFile = isWindows ? realFile.toLowerCase() : realFile;
            const relRealFile = path.relative(normRealCanonicalForFiles, normRealFile);
            if (relRealFile.startsWith('..') || path.isAbsolute(relRealFile)) {
              throw new BadRequestException(`Security violation: Artifact file ${file} escapes sandbox boundary via symlink`);
            }
          } catch (err: any) {
            if (err instanceof BadRequestException) throw err;
            throw new BadRequestException(`Security violation: Unable to verify artifact file integrity: ${err.message}`);
          }
        }

        if (fs.statSync(srcFile).isFile()) {
          const destFile = path.join(targetPath, file);
          if (fs.existsSync(destFile)) {
            throw new BadRequestException(`Artifact file already exists at destination: ${destFile}`);
          }
          fs.copyFileSync(srcFile, destFile, fs.constants.COPYFILE_EXCL);
        }
      }
    } else {
      const fileName = path.basename(resolvedSource);
      targetPath = path.join(targetDir, fileName);
      if (fs.existsSync(targetPath)) {
        throw new BadRequestException(`Artifact file already exists at destination: ${targetPath}`);
      }
      fs.copyFileSync(resolvedSource, targetPath, fs.constants.COPYFILE_EXCL);
    }

    this.logger.log(`Preserved artifact for project ${projectId} at ${targetPath}`);
    return targetPath;
  }
}
