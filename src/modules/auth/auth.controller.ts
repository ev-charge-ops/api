import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthRateLimit } from '../../common/rate-limit/auth-rate-limit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UserResponseDto } from '../users/dto/user.response.dto.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { AuthResponseDto } from './dto/auth.response.dto.js';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('register')
  @ApiOperation({ operationId: 'register', summary: 'Register a driver' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'login',
    summary: 'Log in with email and password',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'refresh',
    summary: 'Rotate the refresh token and issue a new access token',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired or revoked token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logout', summary: 'Revoke a refresh token' })
  @ApiNoContentResponse({ description: 'Refresh token revoked' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getMe', summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.auth.getProfile(user.id);
  }

  @Public()
  @AuthRateLimit()
  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'confirmEmailVerification',
    summary: 'Confirm the email address with the token sent by email',
  })
  @ApiNoContentResponse({ description: 'Email verified' })
  @ApiBadRequestResponse({ description: 'Invalid, expired or used token' })
  confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<void> {
    return this.emailVerification.confirm(dto.token);
  }

  @AuthRateLimit()
  @Post('email-verification/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'resendEmailVerification',
    summary: 'Send a new verification email to the authenticated user',
  })
  @ApiAcceptedResponse({
    description: 'Verification email sent unless the email is already verified',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  resendEmailVerification(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.emailVerification.resend(user.id);
  }

  @Public()
  @AuthRateLimit()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: 'forgotPassword',
    summary: 'Send a password reset link if the email is registered',
  })
  @ApiAcceptedResponse({
    description: 'Always accepted, whether or not the email is registered',
  })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.passwordReset.requestReset(dto.email);
  }

  @Public()
  @AuthRateLimit()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'resetPassword',
    summary: 'Set a new password with the token sent by email',
  })
  @ApiNoContentResponse({
    description: 'Password updated and every session revoked',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or invalid, expired or used token',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwordReset.resetPassword(dto.token, dto.password);
  }
}
