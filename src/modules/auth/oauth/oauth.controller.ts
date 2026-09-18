import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AuthRateLimit } from '../../../common/rate-limit/auth-rate-limit.decorator.js';
import { AppleLoginDto } from '../dto/apple-login.dto.js';
import { AuthResponseDto } from '../dto/auth.response.dto.js';
import { GoogleLoginDto } from '../dto/google-login.dto.js';
import { OAuthService } from './oauth.service.js';

@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Public()
  @AuthRateLimit()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'loginWithGoogle',
    summary: 'Log in or sign up with a Google ID token',
    description:
      'Links the Google account to an existing user with the same email or creates a driver account.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({
    description: 'Invalid token or email not verified by Google',
  })
  loginWithGoogle(@Body() dto: GoogleLoginDto): Promise<AuthResponseDto> {
    return this.oauth.login('GOOGLE', dto.idToken);
  }

  @Public()
  @AuthRateLimit()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'loginWithApple',
    summary: 'Log in or sign up with a Sign in with Apple identity token',
    description:
      'Links the Apple ID to an existing user with the same email or creates a driver account. Private relay emails are accepted.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({
    description: 'Invalid token or email not verified by Apple',
  })
  loginWithApple(@Body() dto: AppleLoginDto): Promise<AuthResponseDto> {
    return this.oauth.login('APPLE', dto.identityToken, dto.fullName);
  }
}
