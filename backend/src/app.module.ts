import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { buildTypeOrmOptions } from './db-config';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OpsModule } from './ops/ops.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { SeedService } from './seed/seed.service';
import { ShipmentsModule } from './shipments/shipments.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    AuditModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ShipmentsModule,
    InvoicesModule,
    OpsModule,
  ],
  controllers: [HealthController],
  providers: [SeedService],
})
export class AppModule {}
