import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { InvoiceStatus, OrderStatus } from '../common/enums';
import { Invoice } from '../entities';
import { OrdersService } from '../orders/orders.service';

const INVOICEABLE_STATUSES = [
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  /** Generate an invoice for an order that is missing one. */
  async generate(orderKey: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    if (!INVOICEABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is ${order.status}; invoices are generated once an order has shipped.`,
      );
    }
    const existing = await this.activeInvoice(order.id);
    if (existing) {
      throw new BadRequestException(
        `Order ${order.orderNumber} already has invoice ${existing.invoiceNumber} (${existing.amount}). Use regenerate if it is incorrect.`,
      );
    }

    const invoice = await this.invoiceRepo.save(
      this.invoiceRepo.create({
        order,
        invoiceNumber: await this.nextInvoiceNumber(),
        amount: order.totalAmount,
        status: InvoiceStatus.ISSUED,
      }),
    );
    await this.audit.log({
      actor,
      action: 'invoice.generate',
      entityType: 'Invoice',
      entityId: invoice.id,
      orderId: order.id,
      reason,
      after: { invoiceNumber: invoice.invoiceNumber, amount: invoice.amount },
    });
    return this.orders.getDetail(order.orderNumber);
  }

  /** Void the current invoice and issue a corrected one at the order total. */
  async regenerate(orderKey: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const existing = await this.activeInvoice(order.id);
    if (!existing) {
      throw new BadRequestException(
        `Order ${order.orderNumber} has no active invoice. Use generate instead.`,
      );
    }

    existing.status = InvoiceStatus.VOID;
    await this.invoiceRepo.save(existing);
    const invoice = await this.invoiceRepo.save(
      this.invoiceRepo.create({
        order,
        invoiceNumber: await this.nextInvoiceNumber(),
        amount: order.totalAmount,
        status: InvoiceStatus.ISSUED,
      }),
    );
    await this.audit.log({
      actor,
      action: 'invoice.regenerate',
      entityType: 'Invoice',
      entityId: invoice.id,
      orderId: order.id,
      reason,
      before: {
        voidedInvoice: existing.invoiceNumber,
        previousAmount: existing.amount,
      },
      after: { invoiceNumber: invoice.invoiceNumber, amount: invoice.amount },
    });
    return this.orders.getDetail(order.orderNumber);
  }

  private async activeInvoice(orderId: string): Promise<Invoice | null> {
    return this.invoiceRepo.findOne({
      where: { orderId, status: InvoiceStatus.ISSUED },
    });
  }

  private async nextInvoiceNumber(): Promise<string> {
    const count = await this.invoiceRepo.count();
    return `INV-${5001 + count}`;
  }
}
