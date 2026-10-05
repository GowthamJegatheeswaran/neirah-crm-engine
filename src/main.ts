import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers (hides X-Powered-By, sets safe defaults)
  app.use(helmet());

  // Validates every request body against its DTO class.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // silently drops properties that are not in the DTO
      forbidNonWhitelisted: true, // ...and rejects the request instead (400)
      transform: true, // converts payloads into DTO class instances / numbers
    }),
  );

  // Consistent error format + logging for every kind of error
  app.useGlobalFilters(new AllExceptionsFilter());

  // One log line per successful request: method, path, status, time, who
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  // API documentation (Swagger UI) at /api/docs, raw OpenAPI JSON at /api/docs-json
  setupSwagger(app);

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(
    `API running on http://localhost:${port}  |  Docs: http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

void bootstrap();
