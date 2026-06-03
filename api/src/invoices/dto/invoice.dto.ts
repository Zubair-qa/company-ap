import { IsArray, IsEnum, IsOptional, IsString, IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentPlanType, VendorKind } from '@prisma/client';

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
  invoiceNumber?: string;

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

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  withholdingTax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsEnum(PaymentPlanType)
  paymentPlanType?: PaymentPlanType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(99)
  advancePercent?: number;

  @IsOptional()
  @IsString()
  releaseCondition?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFinalDocuments?: string[];
}

export class GoogleCsvDto {
  @IsString()
  url: string;

  @IsString()
  departmentId: string;
}
