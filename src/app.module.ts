import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // isGlobal: any module can read config without importing ConfigModule again
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
