import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { AiService } from '../application/ai.service';
import { aiIdempotencyRequired } from '../domain/ai.errors';
import { AiConversationCursorQueryDto, RecommendationDto } from './ai.dto';

@ApiTags('ai')
@Controller('kitchens/:kitchenId/ai')
@UseGuards(KitchenAccessGuard)
export class AiController {
  constructor(@Inject(AiService) private readonly service: AiService) {}
  @Post('recommendations') recommend(
    @Param('kitchenId') kitchenId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RecommendationDto,
    @Headers('idempotency-key') requestKey?: string,
  ) {
    if (!requestKey || requestKey.length < 8 || requestKey.length > 200)
      throw aiIdempotencyRequired();
    return this.service.recommend(kitchenId, user.id, dto, requestKey);
  }
  @Get('usage') metrics(
    @Param('kitchenId') kitchenId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.metrics(kitchenId, user.id);
  }
  @Get('conversations') list(
    @Param('kitchenId') kitchenId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.listConversations(kitchenId, user.id);
  }
  @Get('conversations/:conversationId') get(
    @Param('kitchenId') kitchenId: string,
    @Param('conversationId') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.getConversation(kitchenId, user.id, id);
  }
}

@ApiTags('v2-ai-sessions')
@Controller({ path: 'kitchens/:kitchenId/ai/conversations', version: '2' })
@UseGuards(KitchenAccessGuard)
export class AiConversationsV2Controller {
  constructor(@Inject(AiService) private readonly service: AiService) {}
  @Get() list(
    @Param('kitchenId') kitchenId: string,
    @CurrentUser() user: { id: string },
    @Query() query: AiConversationCursorQueryDto,
  ) {
    return this.service.listConversationsV2(kitchenId, user.id, query.limit, query.cursor);
  }
  @Get(':conversationId') get(
    @Param('kitchenId') kitchenId: string,
    @Param('conversationId') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.getConversation(kitchenId, user.id, id);
  }
}
