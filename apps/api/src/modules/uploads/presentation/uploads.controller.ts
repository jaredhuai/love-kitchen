import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { HARD_MAX_BYTES, type IncomingFile, UploadsService } from '../application/uploads.service';
import { invalidUpload } from '../domain/upload.errors';

@ApiTags('uploads')
@Controller('kitchens/:kitchenId/uploads')
@UseGuards(KitchenAccessGuard)
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly service: UploadsService) {}
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: HARD_MAX_BYTES, files: 1, fields: 0 } }),
  )
  upload(
    @Param('kitchenId') kitchenId: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: IncomingFile,
  ) {
    if (!file) throw invalidUpload('请上传图片');
    return this.service.save(kitchenId, user.id, file);
  }
  @Get(':fileId') async get(
    @Param('kitchenId') kitchenId: string,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ) {
    const result = await this.service.read(kitchenId, fileId);
    response.setHeader('Content-Type', result.file.mimeType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.buffer);
  }
  @Get(':fileId/thumbnail') async thumbnail(
    @Param('kitchenId') kitchenId: string,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ) {
    const result = await this.service.read(kitchenId, fileId, true);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.buffer);
  }
  @Delete(':fileId') remove(
    @Param('kitchenId') kitchenId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.service.remove(kitchenId, fileId);
  }
}
