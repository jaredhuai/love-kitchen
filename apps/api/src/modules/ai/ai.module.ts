import { Module } from '@nestjs/common';
import { AI_PROVIDER } from '../../infra/ai/ai-provider';
import { QwenProvider } from '../../infra/ai/qwen.provider';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { AiService } from './application/ai.service';
import { AiOrchestratorService } from './application/ai-orchestrator.service';
import { AiRepository } from './infrastructure/ai.repository';
import { AiController, AiConversationsV2Controller } from './presentation/ai.controller';

@Module({
  controllers: [AiController, AiConversationsV2Controller],
  providers: [
    KitchenAccessGuard,
    QwenProvider,
    { provide: AI_PROVIDER, useExisting: QwenProvider },
    AiRepository,
    AiOrchestratorService,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
