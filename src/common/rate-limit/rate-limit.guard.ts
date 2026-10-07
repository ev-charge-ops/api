import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema.js';
import { AUTH_RATE_LIMIT_KEY } from './auth-rate-limit.decorator.js';
import { FixedWindowLimiter } from './fixed-window-limiter.js';

const SECOND_IN_MS = 1000;

interface RateLimitRule {
  name: string;
  limit: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new FixedWindowLimiter();
  private readonly ttlMs: number;
  private readonly defaultRule: RateLimitRule;
  private readonly authRule: RateLimitRule;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs =
      config.get('THROTTLE_TTL_SECONDS', { infer: true }) * SECOND_IN_MS;
    this.defaultRule = {
      name: 'default',
      limit: config.get('THROTTLE_LIMIT', { infer: true }),
    };
    this.authRule = {
      name: 'auth',
      limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const tracker = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    for (const rule of this.rulesFor(context)) {
      const result = this.limiter.hit(
        `${rule.name}:${route}:${tracker}`,
        rule.limit,
        this.ttlMs,
      );
      if (!result.allowed) {
        response.setHeader('Retry-After', result.retryAfterSeconds);
        throw new HttpException(
          'Too many requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  private rulesFor(context: ExecutionContext): RateLimitRule[] {
    const isAuthRoute = this.reflector.getAllAndOverride<boolean | undefined>(
      AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    return isAuthRoute ? [this.defaultRule, this.authRule] : [this.defaultRule];
  }
}
