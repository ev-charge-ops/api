import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { toSaoPauloTime } from '../../../../common/time/sao-paulo-time.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { ExportMyDataService } from './export-my-data.service.js';
import { MyDataExportResponseDto } from './my-data-export.response.dto.js';

function fileDate(date: Date): string {
  const local = toSaoPauloTime(date);
  return [local.year, local.month, local.day]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/data-export')
export class ExportMyDataController {
  constructor(private readonly service: ExportMyDataService) {}

  @Get()
  @ApiOperation({
    operationId: 'exportMyData',
    summary:
      'LGPD data portability: JSON with the profile, memberships, sessions, consent history and deletion requests of the user',
  })
  @ApiOkResponse({ type: MyDataExportResponseDto })
  async exportMyData(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MyDataExportResponseDto> {
    const data = await this.service.execute(user.id);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="evchargeops-meus-dados-${fileDate(data.exportedAt)}.json"`,
    );
    return data;
  }
}
