import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Wires SIGTERM/SIGINT into Nest's shutdown lifecycle so onModuleDestroy hooks
  // (GameService clearing its disconnect/cleanup timers) actually run before exit.
  app.enableShutdownHooks();
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`server listening on port ${port}`);
}

void bootstrap();
