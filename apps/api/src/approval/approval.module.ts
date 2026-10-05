import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

import { ApprovalValidationService } from './approval-validation.service';

@Module({
  providers: [ApprovalService, ApprovalValidationService],
  controllers: [ApprovalController],
  exports: [ApprovalService, ApprovalValidationService],
})
export class ApprovalModule {}
