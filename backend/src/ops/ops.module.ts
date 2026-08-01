import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice, Order, Refund } from '../entities';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Invoice, Refund]), OrdersModule, InventoryModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
