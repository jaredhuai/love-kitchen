import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureHttpApp } from './common/configure-http-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  configureHttpApp(app);
  const v1 = new DocumentBuilder().setTitle('两个人的厨房 API v1（Deprecated）').setVersion('1.0').addBearerAuth().build();
  const v2 = new DocumentBuilder().setTitle('两个人的厨房 API v2').setVersion('2.0').addBearerAuth().build();
  const v1Document = SwaggerModule.createDocument(app, v1);
  const v2Document = SwaggerModule.createDocument(app, v2);
  v1Document.paths = Object.fromEntries(Object.entries(v1Document.paths).filter(([path]) => path.startsWith('/api/v1/')));
  v2Document.paths = Object.fromEntries(Object.entries(v2Document.paths).filter(([path]) => path.startsWith('/api/v2/')));
  SwaggerModule.setup('api/docs/v1', app, v1Document);
  SwaggerModule.setup('api/docs/v2', app, v2Document);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
