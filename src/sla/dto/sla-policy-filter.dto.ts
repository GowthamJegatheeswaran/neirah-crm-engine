import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ToBoolean } from '../../common/decorators/transform.decorators';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class SlaPolicyFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = only active rules, false = only inactive' })
  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
