import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  query(
    @Query('orderId') orderId?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.query({
      orderId,
      actor,
      action,
      since,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
