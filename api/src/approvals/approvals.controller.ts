import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '../common/domain';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApprovalsService } from './approvals.service';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';

@Controller('approvals')
@UseGuards(RolesGuard)
export class ApprovalsController {
  constructor(private approvals: ApprovalsService) {}

  @Post(':invoiceId')
  @Roles(Role.DEPT_ADMIN, Role.COMPANY_ADMIN)
  decide(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: ApprovalDecisionDto,
    @Req() req: {
      user: { id: string; role: Role; departmentId: string | null };
    },
  ) {
    return this.approvals.decide(invoiceId, dto, req.user);
  }
}
