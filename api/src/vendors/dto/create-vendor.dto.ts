import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { VendorKind } from '../../common/domain';

export class CreateVendorDto {
  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsEnum(VendorKind)
  kind: VendorKind;

  @IsOptional()
  @Type(() => Boolean)
  active?: boolean;
}
