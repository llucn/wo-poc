import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { verifierProviders } from './verifiers.provider';

@Module({
  providers: [...verifierProviders, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, ...verifierProviders],
})
export class AuthModule {}
