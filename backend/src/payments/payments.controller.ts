import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentsService } from './payments.service';

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

class RefundDto extends ReasonDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}

@Controller('orders/:key')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/retry')
  retry(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.paymentsService.retry(key, dto.reason, dto.actor);
  }

  @Post('payments/reconcile')
  reconcile(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.paymentsService.reconcile(key, dto.reason, dto.actor);
  }

  @Post('refunds')
  refund(@Param('key') key: string, @Body() dto: RefundDto) {
    return this.paymentsService.refund(key, dto.reason, dto.amount, dto.actor);
  }
}
