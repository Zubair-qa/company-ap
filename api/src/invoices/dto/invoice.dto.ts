import { IsEnum, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VendorKind } from '@prisma/client';

export class CreateVendorBodyDto {
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

export class PatchInvoiceDto {
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountPkr?: number;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class GoogleCsvDto {
  @IsString()
  url: string;
}
