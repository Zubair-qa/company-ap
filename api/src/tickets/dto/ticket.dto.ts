import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  AccountVerificationStatus,
  BankPaymentStatus,
  BillType,
  DocumentStatus,
  ExpenseNature,
  FilerStatus,
  PaymentMethod,
  TicketPriority,
  TicketStatus,
  XeroSyncStatus,
} from '@prisma/client';

export class CreateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  departmentId: string;

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsEmail()
  requesterEmail?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(ExpenseNature)
  expenseNature?: ExpenseNature;

  @IsOptional()
  @IsEnum(BillType)
  billType?: BillType;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  vendorNameSnapshot?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPkr?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderNumber?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  purchaseOrderRequired?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  purchaseOrderVerified?: boolean;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  internalReference?: string;

  @IsOptional()
  @IsString()
  vendorAccountNumber?: string;

  @IsOptional()
  @IsString()
  invoiceAccountNumber?: string;

  @IsOptional()
  @IsEnum(AccountVerificationStatus)
  accountVerificationStatus?: AccountVerificationStatus;

  @IsOptional()
  @IsString()
  accountVerificationSource?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  documentStatus?: DocumentStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  missingDocuments?: string[];

  @IsOptional()
  @IsEnum(FilerStatus)
  whtFilerStatus?: FilerStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  whtRate?: number;

  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @IsOptional()
  @IsEnum(XeroSyncStatus)
  xeroSyncStatus?: XeroSyncStatus;

  @IsOptional()
  @IsString()
  xeroContactId?: string;

  @IsOptional()
  @IsString()
  xeroBillId?: string;

  @IsOptional()
  @IsString()
  xeroBillNumber?: string;

  @IsOptional()
  @IsString()
  xeroPaymentId?: string;

  @IsOptional()
  @IsEnum(BankPaymentStatus)
  bankPaymentStatus?: BankPaymentStatus;

  @IsOptional()
  @IsString()
  bankPortalReference?: string;

  @IsOptional()
  @IsString()
  trelloCardId?: string;

  @IsOptional()
  @IsString()
  trelloUrl?: string;

  @IsOptional()
  @IsString()
  legacySheetRowId?: string;

  @IsOptional()
  @IsString()
  legacySheetName?: string;

  @IsOptional()
  @IsString()
  oldReference?: string;

  @IsOptional()
  @IsString()
  parentTicketId?: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  submittedToFinanceAt?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  requesterName?: string | null;

  @IsOptional()
  @IsEmail()
  requesterEmail?: string | null;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(ExpenseNature)
  expenseNature?: ExpenseNature;

  @IsOptional()
  @IsEnum(BillType)
  billType?: BillType;

  @IsOptional()
  @IsString()
  vendorId?: string | null;

  @IsOptional()
  @IsString()
  vendorNameSnapshot?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPkr?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  assignedToId?: string | null;

  @IsOptional()
  @IsString()
  purchaseOrderNumber?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  purchaseOrderRequired?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  purchaseOrderVerified?: boolean;

  @IsOptional()
  @IsString()
  invoiceNumber?: string | null;

  @IsOptional()
  @IsString()
  internalReference?: string | null;

  @IsOptional()
  @IsString()
  vendorAccountNumber?: string | null;

  @IsOptional()
  @IsString()
  invoiceAccountNumber?: string | null;

  @IsOptional()
  @IsEnum(AccountVerificationStatus)
  accountVerificationStatus?: AccountVerificationStatus;

  @IsOptional()
  @IsString()
  accountVerificationSource?: string | null;

  @IsOptional()
  @IsEnum(DocumentStatus)
  documentStatus?: DocumentStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  missingDocuments?: string[];

  @IsOptional()
  @IsEnum(FilerStatus)
  whtFilerStatus?: FilerStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  whtRate?: number | null;

  @IsOptional()
  @IsString()
  voucherNumber?: string | null;

  @IsOptional()
  @IsEnum(XeroSyncStatus)
  xeroSyncStatus?: XeroSyncStatus;

  @IsOptional()
  @IsString()
  xeroContactId?: string | null;

  @IsOptional()
  @IsString()
  xeroBillId?: string | null;

  @IsOptional()
  @IsString()
  xeroBillNumber?: string | null;

  @IsOptional()
  @IsString()
  xeroPaymentId?: string | null;

  @IsOptional()
  @IsEnum(BankPaymentStatus)
  bankPaymentStatus?: BankPaymentStatus;

  @IsOptional()
  @IsString()
  bankPortalReference?: string | null;

  @IsOptional()
  @IsString()
  trelloCardId?: string | null;

  @IsOptional()
  @IsString()
  trelloUrl?: string | null;

  @IsOptional()
  @IsString()
  legacySheetRowId?: string | null;

  @IsOptional()
  @IsString()
  legacySheetName?: string | null;

  @IsOptional()
  @IsString()
  oldReference?: string | null;

  @IsOptional()
  @IsString()
  parentTicketId?: string | null;

  @IsOptional()
  @IsString()
  invoiceId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  submittedToFinanceAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class TicketCommentDto {
  @IsString()
  message: string;
}
