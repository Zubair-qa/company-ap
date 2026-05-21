import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  const allowedOrigins = Array.from(
    new Set([frontend, 'http://localhost:5173', 'http://127.0.0.1:5173']),
  );
  app.enableCors({ origin: allowedOrigins, credentials: true });
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
}
void bootstrap();
