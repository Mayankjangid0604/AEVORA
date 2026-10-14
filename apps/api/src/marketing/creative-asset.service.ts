import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import {
  AssetLicensingType,
  AssetType,
  CreativeAssetMetadata,
  ImageGenerationRequestDto,
  ModerationStatus,
  VideoGenerationRequestDto,
} from './marketing.types';

export interface ImageGeneratorProvider {
  name: string;
  isAvailable(): boolean;
  generateImage(dto: ImageGenerationRequestDto, companyId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
    isSimulated: boolean;
  }>;
}

export interface VideoGeneratorProvider {
  name: string;
  isAvailable(): boolean;
  generateVideo(dto: VideoGenerationRequestDto, companyId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    durationSeconds: number;
    width: number;
    height: number;
    isSimulated: boolean;
  }>;
}

export class MockImageProvider implements ImageGeneratorProvider {
  readonly name = 'AEVORA_LOCAL_DETERMINISTIC_SVG_MOCK';

  isAvailable(): boolean {
    return true;
  }

  async generateImage(dto: ImageGenerationRequestDto, companyId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    width: number;
    height: number;
    isSimulated: boolean;
  }> {
    let width = 1200;
    let height = 630;
    if (dto.aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (dto.aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (dto.aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    }

    const titleText = (dto.title || dto.prompt.slice(0, 45)).replace(/[<>&'"]/g, '');
    const promptSnippet = dto.prompt.slice(0, 120).replace(/[<>&'"]/g, '');
    const cleanCompany = companyId.slice(0, 16);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="100%" stop-color="#818CF8" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="16" fill="none" stroke="url(#accent)" stroke-width="2" stroke-opacity="0.3" />
  <text x="60" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#38BDF8" letter-spacing="2">AEVORA CREATIVE ENGINE [SIMULATED MOCK]</text>
  <text x="60" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#FFFFFF">${titleText}</text>
  <text x="60" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#94A3B8">${promptSnippet}...</text>
  <rect x="60" y="${height - 90}" width="260" height="36" rx="8" fill="#334155" />
  <text x="75" y="${height - 67}" font-family="monospace" font-size="13" fill="#38BDF8">COMPANY: ${cleanCompany}</text>
  <text x="${width - 240}" y="${height - 67}" font-family="system-ui, sans-serif" font-size="14" fill="#64748B">AEVORA DETERMINISTIC</text>
</svg>`;

    return {
      buffer: Buffer.from(svg, 'utf-8'),
      mimeType: 'image/svg+xml',
      width,
      height,
      isSimulated: true,
    };
  }
}

export class MockVideoProvider implements VideoGeneratorProvider {
  readonly name = 'AEVORA_LOCAL_DETERMINISTIC_VIDEO_MOCK';

  isAvailable(): boolean {
    return true;
  }

  async generateVideo(dto: VideoGenerationRequestDto, companyId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    durationSeconds: number;
    width: number;
    height: number;
    isSimulated: boolean;
  }> {
    const isPortrait = dto.orientation === 'PORTRAIT';
    const width = isPortrait ? 1080 : 1920;
    const height = isPortrait ? 1920 : 1080;
    const durationSeconds = dto.durationSeconds || 15;

    const mockVideoManifest = {
      format: 'mp4-mock-manifest',
      title: dto.title || 'Marketing Video Clip',
      script: dto.script,
      companyId,
      durationSeconds,
      resolution: { width, height },
      audioTrack: 'ambient-corporate-synth-mock',
      generatedAt: new Date().toISOString(),
      disclaimer: 'AEVORA_SIMULATED_VIDEO_MEDIA - Zero external billable inference consumed.',
    };

    return {
      buffer: Buffer.from(JSON.stringify(mockVideoManifest, null, 2), 'utf-8'),
      mimeType: 'video/mp4',
      durationSeconds,
      width,
      height,
      isSimulated: true,
    };
  }
}

const FORBIDDEN_WORDS = [
  'scam',
  'guaranteed 1000% returns',
  'pyramid scheme',
  'hate speech',
  'illegal drugs',
  'unauthorized transfer',
];

@Injectable()
export class CreativeAssetService {
  private readonly logger = new Logger(CreativeAssetService.name);
  private readonly baseStorageDir: string;
  private readonly inMemoryAssetStore = new Map<string, CreativeAssetMetadata>();
  private readonly imageProviders = new Map<string, ImageGeneratorProvider>();
  private readonly videoProviders = new Map<string, VideoGeneratorProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
  ) {
    this.baseStorageDir = path.resolve(process.cwd(), '.workspace');
    
    // Register default deterministic mock providers
    const defaultImageMock = new MockImageProvider();
    const defaultVideoMock = new MockVideoProvider();
    this.registerImageProvider(defaultImageMock);
    this.registerVideoProvider(defaultVideoMock);
  }

  registerImageProvider(provider: ImageGeneratorProvider): void {
    this.imageProviders.set(provider.name, provider);
  }

  registerVideoProvider(provider: VideoGeneratorProvider): void {
    this.videoProviders.set(provider.name, provider);
  }

  private ensureCompanyAssetDir(companyId: string): string {
    const dir = path.join(this.baseStorageDir, companyId, 'marketing', 'assets');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private moderateText(text: string): { status: ModerationStatus; reason?: string } {
    const lower = text.toLowerCase();
    for (const term of FORBIDDEN_WORDS) {
      if (lower.includes(term)) {
        return {
          status: ModerationStatus.REJECTED,
          reason: `Policy violation: flagged phrase '${term}' detected in creative prompt.`,
        };
      }
    }
    return { status: ModerationStatus.APPROVED };
  }

  async generateImage(
    companyId: string,
    actorId: string,
    dto: ImageGenerationRequestDto,
    providerName?: string,
  ): Promise<CreativeAssetMetadata> {
    if (!companyId) throw new BadRequestException('companyId is required');
    if (!dto.prompt || dto.prompt.trim().length === 0) {
      throw new BadRequestException('Image generation prompt cannot be empty');
    }

    // Moderation check
    const modResult = this.moderateText(dto.prompt);
    if (modResult.status === ModerationStatus.REJECTED) {
      throw new BadRequestException(`Image generation rejected by safety filter: ${modResult.reason}`);
    }

    const providerKey = providerName || 'AEVORA_LOCAL_DETERMINISTIC_SVG_MOCK';
    const provider = this.imageProviders.get(providerKey);
    if (!provider || !provider.isAvailable()) {
      throw new BadRequestException(`Image provider '${providerKey}' is not configured or available`);
    }

    const output = await provider.generateImage(dto, companyId);
    const assetId = `asset_img_${crypto.randomUUID()}`;
    const fileExtension = output.mimeType.includes('svg') ? 'svg' : 'png';
    const dir = this.ensureCompanyAssetDir(companyId);
    const filename = `${assetId}.${fileExtension}`;
    const absolutePath = path.join(dir, filename);

    fs.writeFileSync(absolutePath, output.buffer);

    const metadata: CreativeAssetMetadata = {
      id: assetId,
      companyId,
      campaignId: dto.campaignId,
      title: dto.title || `AI Generated Graphic: ${dto.prompt.slice(0, 30)}`,
      description: dto.prompt,
      assetType: AssetType.IMAGE,
      mimeType: output.mimeType,
      fileSizeBytes: output.buffer.length,
      storagePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
      visualAssetRef: `/marketing/assets/${companyId}/${filename}`,
      dimensions: { width: output.width, height: output.height },
      licensingType: AssetLicensingType.AI_GENERATED_MOCK,
      rightsHolder: `Company [${companyId}]`,
      moderationStatus: ModerationStatus.APPROVED,
      isSimulated: output.isSimulated,
      generatorProvider: provider.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.inMemoryAssetStore.set(assetId, metadata);

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATIVE_IMAGE_GENERATED',
      objectType: 'CreativeAsset',
      objectId: assetId,
      newValue: {
        title: metadata.title,
        isSimulated: metadata.isSimulated,
        provider: metadata.generatorProvider,
      },
      campaignId: dto.campaignId,
    });

    return metadata;
  }

  async generateVideo(
    companyId: string,
    actorId: string,
    dto: VideoGenerationRequestDto,
    providerName?: string,
  ): Promise<CreativeAssetMetadata> {
    if (!companyId) throw new BadRequestException('companyId is required');
    if (!dto.script || dto.script.trim().length === 0) {
      throw new BadRequestException('Video script cannot be empty');
    }

    const modResult = this.moderateText(dto.script);
    if (modResult.status === ModerationStatus.REJECTED) {
      throw new BadRequestException(`Video generation rejected by safety filter: ${modResult.reason}`);
    }

    const providerKey = providerName || 'AEVORA_LOCAL_DETERMINISTIC_VIDEO_MOCK';
    const provider = this.videoProviders.get(providerKey);
    if (!provider || !provider.isAvailable()) {
      throw new BadRequestException(`Video provider '${providerKey}' is not configured or available`);
    }

    const output = await provider.generateVideo(dto, companyId);
    const assetId = `asset_vid_${crypto.randomUUID()}`;
    const dir = this.ensureCompanyAssetDir(companyId);
    const filename = `${assetId}.mp4`;
    const absolutePath = path.join(dir, filename);

    fs.writeFileSync(absolutePath, output.buffer);

    const metadata: CreativeAssetMetadata = {
      id: assetId,
      companyId,
      campaignId: dto.campaignId,
      title: dto.title || `Video Creative: ${dto.script.slice(0, 30)}`,
      description: dto.script,
      assetType: AssetType.VIDEO,
      mimeType: output.mimeType,
      fileSizeBytes: output.buffer.length,
      storagePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
      visualAssetRef: `/marketing/assets/${companyId}/${filename}`,
      dimensions: { width: output.width, height: output.height },
      licensingType: AssetLicensingType.AI_GENERATED_MOCK,
      rightsHolder: `Company [${companyId}]`,
      moderationStatus: ModerationStatus.APPROVED,
      isSimulated: output.isSimulated,
      generatorProvider: provider.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.inMemoryAssetStore.set(assetId, metadata);

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATIVE_VIDEO_GENERATED',
      objectType: 'CreativeAsset',
      objectId: assetId,
      newValue: {
        title: metadata.title,
        durationSeconds: output.durationSeconds,
        isSimulated: metadata.isSimulated,
      },
      campaignId: dto.campaignId,
    });

    return metadata;
  }

  async getAsset(companyId: string, assetId: string): Promise<CreativeAssetMetadata> {
    const asset = this.inMemoryAssetStore.get(assetId);
    if (!asset) {
      throw new NotFoundException(`Creative asset '${assetId}' not found`);
    }
    if (asset.companyId !== companyId) {
      throw new ForbiddenException(`Access to asset '${assetId}' denied across tenant boundary`);
    }
    return asset;
  }

  async listAssets(
    companyId: string,
    filters?: { campaignId?: string; assetType?: AssetType; moderationStatus?: ModerationStatus },
  ): Promise<CreativeAssetMetadata[]> {
    const results: CreativeAssetMetadata[] = [];
    for (const asset of this.inMemoryAssetStore.values()) {
      if (asset.companyId !== companyId) continue;
      if (filters?.campaignId && asset.campaignId !== filters.campaignId) continue;
      if (filters?.assetType && asset.assetType !== filters.assetType) continue;
      if (filters?.moderationStatus && asset.moderationStatus !== filters.moderationStatus) continue;
      results.push(asset);
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateModerationStatus(
    companyId: string,
    actorId: string,
    assetId: string,
    status: ModerationStatus,
    reason?: string,
  ): Promise<CreativeAssetMetadata> {
    const asset = await this.getAsset(companyId, assetId);
    const oldStatus = asset.moderationStatus;
    asset.moderationStatus = status;
    asset.updatedAt = new Date();

    await this.audit.record({
      companyId,
      actorId,
      action: 'CREATIVE_MODERATION_STATUS_UPDATED',
      objectType: 'CreativeAsset',
      objectId: assetId,
      oldValue: { status: oldStatus },
      newValue: { status, reason },
    });

    return asset;
  }
}
