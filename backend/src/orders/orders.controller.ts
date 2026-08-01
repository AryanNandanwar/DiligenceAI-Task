import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../common/enums';
import { OrdersService } from './orders.service';

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

class ForceStatusDto extends ReasonDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  search(
    @Query('status') status?: OrderStatus,
    @Query('email') email?: string,
    @Query('stuckHours') stuckHours?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.search({
      status,
      email,
      q,
      stuckHours: stuckHours ? parseFloat(stuckHours) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':key')
  getDetail(@Param('key') key: string) {
    return this.ordersService.getDetail(key);
  }

  @Post(':key/cancel')
  cancel(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.ordersService.cancel(key, dto.reason, dto.actor);
  }

  @Post(':key/force-status')
  forceStatus(@Param('key') key: string, @Body() dto: ForceStatusDto) {
    return this.ordersService.forceStatus(key, dto.status, dto.reason, dto.actor);
  }
}
