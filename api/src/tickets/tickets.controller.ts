import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTicketDto, TicketCommentDto, UpdateTicketDto } from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

type RequestUser = { id: string; role: Role; departmentId: string | null };
type FinanceDashboardQuery = {
  month?: string;
  compareMonth?: string;
  quarter?: string;
  compareQuarter?: string;
};

function ticketAttachmentDir() {
  const dir = `${process.env.UPLOAD_DIR || './uploads'}/ticket-attachments`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

@Controller('tickets')
@UseGuards(RolesGuard)
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @Get('meta')
  meta(@Req() req: { user: RequestUser }) {
    return this.tickets.meta(req.user);
  }

  @Get('board')
  board(@Req() req: { user: RequestUser }) {
    return this.tickets.board(req.user);
  }

  @Get('finance-dashboard')
  @Roles(Role.AP_CLERK, Role.CFO)
  financeDashboard(
    @Req() req: { user: RequestUser },
    @Query() query: FinanceDashboardQuery,
  ) {
    return this.tickets.financeDashboard(req.user, query);
  }

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.tickets.listForUser(req.user);
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @Req() req: { user: RequestUser }) {
    return this.tickets.create(dto, req.user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.tickets.getOne(id, req.user);
  }

  @Get(':id/attachments')
  attachments(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.tickets.listAttachments(id, req.user);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ticketAttachmentDir()),
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: RequestUser },
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.tickets.uploadAttachment(id, file, req.user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: TicketCommentDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.tickets.addComment(id, dto.message, req.user);
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: { user: RequestUser },
    @Res() res: Response,
  ) {
    const { doc, absolutePath } = await this.tickets.attachmentDownload(
      id,
      attachmentId,
      req.user,
    );
    return res.download(absolutePath, doc.fileName);
  }

  @Get(':id/attachments/:attachmentId/preview')
  async previewAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: { user: RequestUser },
    @Res() res: Response,
  ) {
    const { doc, absolutePath } = await this.tickets.attachmentDownload(
      id,
      attachmentId,
      req.user,
    );
    const safeName = doc.fileName.replaceAll('"', '');
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    return res.sendFile(absolutePath);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.tickets.update(id, dto, req.user);
  }

  @Post(':id/submit-finance')
  submitToFinance(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.tickets.submitToFinance(id, req.user);
  }

  @Post(':id/agent-verify')
  runWorkflowAgent(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.tickets.runWorkflowAgent(id, req.user);
  }

  @Post(':id/test-bank-auto-close')
  runTestBankAutomation(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.tickets.runTestBankAutomation(id, req.user);
  }
}
