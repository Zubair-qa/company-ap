import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceFilesController } from './invoice-files.controller';

@Module({
  imports: [TicketsModule],
  controllers: [InvoicesController, InvoiceFilesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
