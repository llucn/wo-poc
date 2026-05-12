import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { verifierProviders } from './verifiers.provider';

@Module({
  providers: [...verifierProviders, JwtAuthGuard],
  exports: [JwtAuthGuard, ...verifierProviders],
})
export class AuthModule {}
