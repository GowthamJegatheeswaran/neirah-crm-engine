import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';

/**
 * Logs one line per successful request: `GET /leads 200 12ms user=2 (manager)`.
 * Failed requests are logged by AllExceptionsFilter (with their status and message).
 * Never logs bodies, headers or tokens, so passwords and JWTs cannot leak into the logs.
 * Registered in main.ts, so tests (which build their own app) stay quiet.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const started = Date.now();
    return next.handle().pipe(
      tap(() => {
        const who = request.user ? ` user=${request.user.id} (${request.user.role})` : '';
        this.logger.log(
          `${request.method} ${request.originalUrl.split('?')[0]} ${response.statusCode} ${Date.now() - started}ms${who}`,
        );
      }),
    );
  }
}
