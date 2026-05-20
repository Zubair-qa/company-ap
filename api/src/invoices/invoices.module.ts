import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceFilesController } from './invoice-files.controller';

@Module({
  controllers: [InvoicesController, InvoiceFilesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
