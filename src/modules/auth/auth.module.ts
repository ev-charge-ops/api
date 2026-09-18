import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { Env } from '../../config/env.schema.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailLoginService } from './email-login.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { createOAuthTokenVerifier } from './oauth/jose-oauth-token-verifier.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { OAuthTokenVerifier } from './oauth/oauth-token-verifier.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { PasswordService } from './password.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_TTL', {
            infer: true,
          }) as JwtSignOptions['expiresIn'],
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenService,
    OneTimeTokenService,
    EmailVerificationService,
    PasswordResetService,
    EmailLoginService,
    OAuthService,
    {
      provide: OAuthTokenVerifier,
      inject: [ConfigService],
      useFactory: createOAuthTokenVerifier,
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
