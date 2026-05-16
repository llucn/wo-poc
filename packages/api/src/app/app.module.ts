import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { loadAppConfig } from './config/app-config';
import { DatabaseModule } from './database/database.module';
import { FieldModule } from './field/field.module';
import { IssueCategoryModule } from './issue-category/issue-category.module';
import { MeModule } from './me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadAppConfig],
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    MeModule,
    IssueCategoryModule,
    FieldModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
