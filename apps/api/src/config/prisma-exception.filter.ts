import { ArgumentsHost, Catch, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/** Same JSON shape as Nest's default ({ statusCode, message, error }); Prisma "not found"/"duplicate" become 404/409 instead of 500. */
@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return super.catch(exception, host);
    return super.catch(toHttp(exception), host);
  }
}

/** Unknown errors pass through: BaseExceptionFilter logs them and returns a generic 500. */
export function toHttp(exception: unknown): unknown {
  if (exception instanceof HttpException) return exception;
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2025') return new NotFoundException('Record not found');
    if (exception.code === 'P2002') return new ConflictException('Duplicate record');
  }
  return exception;
}
