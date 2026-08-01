import { Controller, Get, Param } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('summary')
  summary() {
    return this.opsService.summary();
  }

  @Get('diagnose/:key')
  diagnose(@Param('key') key: string) {
    return this.opsService.diagnose(key);
  }
}
