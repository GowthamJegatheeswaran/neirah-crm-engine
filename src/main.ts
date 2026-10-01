import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

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

  // API documentation (Swagger UI) at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Neirah CRM - Smart Lead Assignment & Follow-Up Engine')
    .setDescription(
      'REST API for leads, employees, assignment rules, follow-ups and SLA escalation',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(
    `API running on http://localhost:${port}  |  Docs: http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}

void bootstrap();
