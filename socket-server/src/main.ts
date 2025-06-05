import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = process.env.PORT ?? 3001;

NestFactory.create(AppModule)
  .then((app) => app.listen(PORT))
  .then(() => console.log('Server listening on port ' + PORT))
  .catch((e) => console.error('Server Starting Error', e));
