import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import {
  CreateIssueCategoryDto,
  DeleteIssueCategoriesDto,
  ExistsResponseDto,
  IssueCategoryDto,
} from './issue-category.dto';
import { IssueCategoryEntity } from './issue-category.entity';
import { IssueCategoryService } from './issue-category.service';

function toDto(entity: IssueCategoryEntity): IssueCategoryDto {
  return {
    id: entity.id,
    name: entity.name,
    displayName: entity.displayName,
  };
}

@Controller('issue-categories')
@Roles('ADMIN')
export class IssueCategoryController {
  constructor(private readonly service: IssueCategoryService) {}

  @Get()
  async findAll(): Promise<IssueCategoryDto[]> {
    const rows = await this.service.findAll();
    return rows.map(toDto);
  }

  @Get('exists')
  exists(
    @Query('name') name?: string,
    @Query('displayName') displayName?: string,
  ): Promise<ExistsResponseDto> {
    return this.service.checkExists(name, displayName);
  }

  @Post()
  async create(
    @Body() dto: CreateIssueCategoryDto,
  ): Promise<IssueCategoryDto> {
    const created = await this.service.create(dto);
    return toDto(created);
  }

  @Delete()
  @HttpCode(200)
  async remove(
    @Body() dto: DeleteIssueCategoriesDto,
  ): Promise<{ deleted: number }> {
    const deleted = await this.service.removeMany(dto.ids);
    return { deleted };
  }
}
