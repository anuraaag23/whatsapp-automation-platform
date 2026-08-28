import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);

  // Raise Node's default 5s keepAliveTimeout. This app sits behind a
  // reverse proxy (Caddy / Cloudflare Tunnel in this project's deployment)
  // that reuses persistent connections to this backend; if Node decides an
  // idle kept-alive connection has expired at roughly the same moment the
  // proxy reuses it to forward a new request, the proxy sees a connection
  // reset. The standard fix — used the same way in front of any
  // load balancer — is for the backend's keepAliveTimeout to comfortably
  // exceed the proxy's own idle/keep-alive timeout so the backend is never
  // the one racing to close first. headersTimeout must stay above
  // keepAliveTimeout or Node ignores the keepAliveTimeout value entirely.
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}/api/v1`);
}

bootstrap();
