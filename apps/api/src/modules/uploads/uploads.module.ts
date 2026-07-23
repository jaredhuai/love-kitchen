import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CosUploadStorage } from '../../infra/storage/cos-upload.storage';
import { LocalUploadStorage } from '../../infra/storage/local-upload.storage';
import { UPLOAD_STORAGE } from '../../infra/storage/upload-storage.adapter';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { UploadsService } from './application/uploads.service';
import { UploadsController } from './presentation/uploads.controller';

@Module({ controllers: [UploadsController], providers: [KitchenAccessGuard, UploadsService, LocalUploadStorage, { provide: UPLOAD_STORAGE, inject: [ConfigService, LocalUploadStorage], useFactory: (config: ConfigService, local: LocalUploadStorage) => config.get('UPLOAD_DRIVER') === 'cos' ? new CosUploadStorage(config) : local }], exports: [UploadsService] })
export class UploadsModule {}
