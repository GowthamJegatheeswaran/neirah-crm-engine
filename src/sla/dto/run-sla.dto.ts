import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ToBoolean } from '../../common/decorators/transform.decorators';

export class RunSlaQueryDto {
  @ApiPropertyOptional({
    description: 'true = only report what WOULD happen; nothing is written',
    default: false,
  })
  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
