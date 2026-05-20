import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApprovalDecisionDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
