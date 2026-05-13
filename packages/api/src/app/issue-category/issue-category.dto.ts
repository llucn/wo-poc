import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateIssueCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;
}

export class DeleteIssueCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids!: number[];
}

export type IssueCategoryDto = {
  id: number;
  name: string;
  displayName: string;
};

export type ExistsResponseDto = {
  name: boolean;
  displayName: boolean;
};
