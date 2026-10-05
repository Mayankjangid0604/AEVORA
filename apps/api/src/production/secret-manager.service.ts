import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class SecretManagerService {
  private readonly logger = new Logger(SecretManagerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves a secret by keyName for a specific company.
   * Throws an error if the secret does not exist.
   */
  async getSecret(companyId: string, keyName: string, environment: ExecutionEnvironment = ExecutionEnvironment.SIMULATION): Promise<string> {
    if (environment === ExecutionEnvironment.PRODUCTION) {
      throw new NotImplementedException('Production secret manager is not implemented');
    }

    const secret = await this.prisma.secretVault.findUnique({
      where: { companyId_keyName: { companyId, keyName } }
    });

    if (!secret) {
      this.logger.error(`Secret not found: ${keyName} for company: ${companyId}`);
      throw new Error(`Secret ${keyName} not found`);
    }

    // Update lastUsedAt
    await this.prisma.secretVault.update({
      where: { id: secret.id },
      data: { lastUsedAt: new Date() }
    });

    // In a real system, we'd decrypt cipherText using KMS or retrieve from HashiCorp Vault.
    // NOT_IMPLEMENTED: Actual external secret-manager integration (AWS Secrets Manager, Vault, etc.)
    return secret.cipherText; // For simulation, cipherText holds the plain/mocked secret.
  }

  async storeSecret(companyId: string, keyName: string, value: string, description?: string): Promise<void> {
    // NOT_IMPLEMENTED: Real KMS encryption before storing.
    await this.prisma.secretVault.upsert({
      where: { companyId_keyName: { companyId, keyName } },
      update: { cipherText: value, description },
      create: { companyId, keyName, cipherText: value, description }
    });
    this.logger.log(`Stored secret ${keyName} for company ${companyId}`);
  }
}
