import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedRequest } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { InvoiceService } from './invoice.service';
import { Invoice } from '../../common/entities';

class PayInvoiceDto {
  paymentMethod: string;
  paymentReference: string;
}

@ApiTags('Billing')
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('invoices')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all invoices for the organization' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoices retrieved successfully',
  })
  async getInvoices(@CurrentUser() user: AuthenticatedRequest): Promise<Invoice[]> {
    if (!user.organizationId) {
      throw new BadRequestException('Organization required for billing');
    }
    return this.invoiceService.getOrganizationInvoices(user.organizationId);
  }

  @Get('invoices/pending')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending and overdue invoices' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending invoices retrieved successfully',
  })
  async getPendingInvoices(@CurrentUser() user: AuthenticatedRequest): Promise<Invoice[]> {
    if (!user.organizationId) {
      throw new BadRequestException('Organization required for billing');
    }
    return this.invoiceService.getPendingInvoices(user.organizationId);
  }

  @Get('invoices/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get invoice details' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice details retrieved successfully',
  })
  async getInvoice(
    @CurrentUser() user: AuthenticatedRequest,
    @Param('id') invoiceId: string,
  ): Promise<Invoice> {
    if (!user.organizationId) {
      throw new BadRequestException('Organization required for billing');
    }
    return this.invoiceService.getInvoice(invoiceId, user.organizationId);
  }

  @Post('invoices/:id/pay')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark invoice as paid' })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiBody({ type: PayInvoiceDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice marked as paid successfully',
  })
  async payInvoice(
    @CurrentUser() user: AuthenticatedRequest,
    @Param('id') invoiceId: string,
    @Body() body: PayInvoiceDto,
  ): Promise<Invoice> {
    if (!user.organizationId) {
      throw new BadRequestException('Organization required for billing');
    }

    // Verify the invoice belongs to the user's organization
    await this.invoiceService.getInvoice(invoiceId, user.organizationId);

    return this.invoiceService.markAsPaid(
      invoiceId,
      body.paymentMethod,
      body.paymentReference,
    );
  }

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get billing summary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Billing summary retrieved successfully',
  })
  async getBillingSummary(@CurrentUser() user: AuthenticatedRequest): Promise<{
    currentPlan: string;
    nextBillingDate: Date | null;
    nextAmount: number;
    currency: string;
    pendingInvoices: number;
    totalDue: number;
    billingPeriod: { start: Date; end: Date } | null;
  }> {
    if (!user.organizationId) {
      throw new BadRequestException('Organization required for billing');
    }
    return this.invoiceService.getBillingSummary(user.organizationId);
  }
}
