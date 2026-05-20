import { IsEnum, IsOptional, IsString, IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TaxFilerStatus, VendorKind } from '@prisma/client';

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
  @IsEnum(TaxFilerStatus)
  taxFilerStatus?: TaxFilerStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  whtTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  salesTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  incomeTax?: number;

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
