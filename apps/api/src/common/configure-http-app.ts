import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { ResponseInterceptor } from './response.interceptor';
import { validationException } from './validation.exception';

export function configureHttpApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationException }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  return app;
}
