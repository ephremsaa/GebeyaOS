import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportService } from './excel-import.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ImportCommitRequest } from '@gebeyaos/shared-types';

@Controller('inventory/import')
export class ExcelImportController {
  constructor(private readonly importService: ExcelImportService) {}

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="GebeyaOS_Products_Import_Template.xlsx"',
    );
    res.send(buffer);
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory:import:execute')
  @UseInterceptors(FileInterceptor('file'))
  async validateFile(
    @UploadedFile() file: any,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Please provide an Excel (.xlsx) or CSV file to validate.');
    }
    const branchId = branchHeader || '018e0000-0000-7000-8000-000000000020';
    return this.importService.validateImportBuffer(file.buffer, branchId);
  }

  @Post('commit')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory:import:execute')
  @HttpCode(HttpStatus.CREATED)
  async commitImport(
    @CurrentUser('id') userId: string,
    @Body() request: ImportCommitRequest,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const branchId = branchHeader || '018e0000-0000-7000-8000-000000000020';
    return this.importService.commitImport(branchId, userId, request);
  }

  @Post(':id/undo')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory:import:execute')
  @HttpCode(HttpStatus.OK)
  async undoImport(
    @Param('id') batchId: string,
    @CurrentUser('id') managerId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const branchId = branchHeader || '018e0000-0000-7000-8000-000000000020';
    return this.importService.undoImport(batchId, managerId, branchId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('inventory:stock:view')
  async listImportHistory(@Headers('x-branch-id') branchHeader?: string) {
    const branchId = branchHeader || '018e0000-0000-7000-8000-000000000020';
    return this.importService.listImportHistory(branchId);
  }
}
