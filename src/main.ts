import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { createOriginMatcher } from './common/cors/cors-origin.js';
import { setupSwagger } from './common/swagger/setup-swagger.js';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const isAllowedOrigin = createOriginMatcher(
    config.get('CORS_ORIGINS', { infer: true }),
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || isAllowedOrigin(origin)),
  });

  setupSwagger(app);

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
