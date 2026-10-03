import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MAX_INT } from '../constants';

/** Accepts only a positive integer that can exist as a PostgreSQL integer id. */
@Injectable()
export class IdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_INT) {
      throw new BadRequestException('id must be a positive integer');
    }
    return id;
  }
}
