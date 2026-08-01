import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { ALL_ENTITIES } from './entities';
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
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'o2c',
      password: process.env.DB_PASSWORD ?? 'o2c',
      database: process.env.DB_NAME ?? 'o2c',
      entities: ALL_ENTITIES,
      synchronize: true, // demo scope; use migrations in production
      retryAttempts: 15,
      retryDelay: 2000,
    }),
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
