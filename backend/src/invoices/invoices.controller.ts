import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { InvoicesService } from './invoices.service';

class ReasonDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  actor?: string;
}

@Controller('orders/:key/invoice')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  generate(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.invoicesService.generate(key, dto.reason, dto.actor);
  }

  @Post('regenerate')
  regenerate(@Param('key') key: string, @Body() dto: ReasonDto) {
    return this.invoicesService.regenerate(key, dto.reason, dto.actor);
  }
}
