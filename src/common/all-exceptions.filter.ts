import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

// PostgreSQL error codes we translate into friendly HTTP errors
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_NUMERIC_OUT_OF_RANGE = '22003';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';
const PG_NOT_NULL_VIOLATION = '23502';

/**
 * One place that turns ANY error into a consistent JSON response and logs it.
 * Clients never see stack traces or SQL details for unexpected errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string } | undefined)?.code;
      if (code === PG_UNIQUE_VIOLATION) {
        status = HttpStatus.CONFLICT;
        message = 'A record with the same unique value already exists';
      } else if (code === PG_FOREIGN_KEY_VIOLATION) {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced record does not exist or is still in use';
      } else if (code === PG_CHECK_VIOLATION) {
        status = HttpStatus.BAD_REQUEST;
        message = 'A value violates a database rule';
      } else if (
        code === PG_NUMERIC_OUT_OF_RANGE ||
        code === PG_INVALID_TEXT_REPRESENTATION ||
        code === PG_NOT_NULL_VIOLATION
      ) {
        status = HttpStatus.BAD_REQUEST;
        message = 'A value is missing, malformed or out of range';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      error: this.statusName(status),
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /** HttpStatus.BAD_REQUEST -> 'Bad Request' */
  private statusName(status: number): string {
    const key = HttpStatus[status];
    if (!key) return 'Error';
    return key
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }
}
