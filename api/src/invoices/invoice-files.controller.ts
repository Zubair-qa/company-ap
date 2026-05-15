import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InvoicesService } from './invoices.service';

function uploadDir() {
  const dir = process.env.UPLOAD_DIR || './uploads';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

@Controller('invoice-files')
@UseGuards(RolesGuard)
export class InvoiceFilesController {
  constructor(private invoices: InvoicesService) {}

  @Post('upload')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir()),
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: { id: string }; body: { departmentId?: string } },
  ) {
    if (!file) throw new BadRequestException('file is required');
    const departmentId = req.body?.departmentId;
    if (!departmentId) throw new BadRequestException('departmentId is required');
    return this.invoices.createFromUpload(file, departmentId, req.user.id);
  }
}
