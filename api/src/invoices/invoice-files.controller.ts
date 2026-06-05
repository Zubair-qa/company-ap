import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
  @Roles(Role.DEPT_USER)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'invoiceFile', maxCount: 1 },
      { name: 'poFile', maxCount: 1 },
      { name: 'grnFile', maxCount: 1 },
    ], {
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
    @UploadedFiles()
    files: {
      file?: Express.Multer.File[];
      invoiceFile?: Express.Multer.File[];
      poFile?: Express.Multer.File[];
      grnFile?: Express.Multer.File[];
    },
    @Req()
    req: {
      user: { id: string; role: Role; departmentId: string | null };
      body: { departmentId?: string; procurementMode?: string; purchaseOrderRequired?: string };
    },
  ) {
    const departmentId = req.body?.departmentId;
    if (!departmentId) throw new BadRequestException('departmentId is required');
    const purchaseOrderRequired =
      req.body?.procurementMode === 'NON_PURCHASE_ORDER' ||
      req.body?.purchaseOrderRequired === 'false'
        ? false
        : true;
    const invoiceFile = files.invoiceFile?.[0] ?? files.file?.[0];
    if (!invoiceFile) throw new BadRequestException('invoice file is required');

    return this.invoices.createFromUploadPack(
      {
        invoice: invoiceFile,
        purchaseOrder: files.poFile?.[0],
        grn: files.grnFile?.[0],
      },
      departmentId,
      req.user,
      purchaseOrderRequired ? 'PURCHASE_ORDER' : 'NON_PURCHASE_ORDER',
    );
  }
}
