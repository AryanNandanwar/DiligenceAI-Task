import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ShipmentsService } from './shipments.service';

class CreateShipmentDto {
  @IsString()
  @IsNotEmpty()
  carrier: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

class UpdateTrackingDto {
  @IsString()
  @IsNotEmpty()
  trackingNumber: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

@Controller('orders/:key/shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  create(@Param('key') key: string, @Body() dto: CreateShipmentDto) {
    return this.shipmentsService.create(key, dto.carrier, dto.reason, dto.trackingNumber, dto.actor);
  }

  @Post('tracking')
  updateTracking(@Param('key') key: string, @Body() dto: UpdateTrackingDto) {
    return this.shipmentsService.updateTracking(key, dto.trackingNumber, dto.reason, dto.actor);
  }

  @Post('delivered')
  markDelivered(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.shipmentsService.markDelivered(key, dto.reason, dto.actor);
  }
}
