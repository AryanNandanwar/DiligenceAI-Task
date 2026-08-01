import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { InventoryService } from './inventory.service';

class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsInt()
  quantityChange: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

class ReleaseReservationsDto {
  @IsString()
  @IsNotEmpty()
  orderNumber: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@Query('sku') sku?: string) {
    return this.inventoryService.list(sku);
  }

  @Get('reconcile')
  reconcile() {
    return this.inventoryService.reconcileReservations();
  }

  @Post('adjust')
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto.sku, dto.quantityChange, dto.reason, dto.actor);
  }

  @Post('release-reservations')
  release(@Body() dto: ReleaseReservationsDto) {
    return this.inventoryService.releaseReservationsForOrder(dto.orderNumber, dto.reason, dto.actor);
  }
}
