import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  InvoiceStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ShipmentStatus,
} from '../common/enums';
import { Invoice, Order, Refund } from '../entities';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';

export interface DiagnosedIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestedTools: string[];
}

const STUCK_THRESHOLD_HOURS = 24;

@Injectable()
export class OpsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Refund) private readonly refundRepo: Repository<Refund>,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
  ) {}

  /** Rule-based diagnosis of a single order: what is wrong and how to fix it. */
  async diagnose(orderKey: string) {
    const order = await this.orders.findByKey(orderKey);
    const invoice = await this.invoiceRepo.findOne({
      where: { orderId: order.id, status: InvoiceStatus.ISSUED },
    });
    const issues: DiagnosedIssue[] = [];
    const ageHours = (Date.now() - new Date(order.updatedAt).getTime()) / 3_600_000;
    const latestPayment = [...(order.payments ?? [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];

    // --- Payment issues ---
    if ([OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING].includes(order.status)) {
      if (latestPayment?.status === PaymentStatus.FAILED) {
        if (latestPayment.gatewayReference?.startsWith('gw_ok_')) {
          issues.push({
            code: 'PAYMENT_GATEWAY_MISMATCH',
            severity: 'high',
            description: `Payment is marked FAILED (${latestPayment.failureReason}) but has gateway reference ${latestPayment.gatewayReference} — the gateway may have actually captured it. Reconcile before retrying to avoid double-charging.`,
            suggestedTools: ['reconcile_payment'],
          });
        } else {
          issues.push({
            code: 'PAYMENT_FAILED',
            severity: 'high',
            description: `Payment failed ${latestPayment.attempts} time(s) (${latestPayment.failureReason}). Order stuck in ${order.status} for ${ageHours.toFixed(0)}h. Retry the payment, or cancel the order to release reserved stock.`,
            suggestedTools: ['retry_payment', 'cancel_order'],
          });
        }
      } else if (ageHours > STUCK_THRESHOLD_HOURS) {
        issues.push({
          code: 'PAYMENT_STUCK',
          severity: 'medium',
          description: `Order has been in ${order.status} for ${ageHours.toFixed(0)}h with no captured payment. Retry the payment or cancel the order.`,
          suggestedTools: ['retry_payment', 'cancel_order'],
        });
      }
    }

    // --- Fulfillment issues ---
    const openShipment = (order.shipments ?? []).find(
      (s) => s.status !== ShipmentStatus.DELIVERED,
    );
    if (order.status === OrderStatus.PAID && !openShipment && ageHours > STUCK_THRESHOLD_HOURS) {
      issues.push({
        code: 'SHIPMENT_MISSING',
        severity: 'high',
        description: `Order was paid ${ageHours.toFixed(0)}h ago but no shipment was ever created. Create a shipment to get fulfillment moving.`,
        suggestedTools: ['create_shipment'],
      });
    }
    if (
      order.status === OrderStatus.FULFILLING &&
      openShipment &&
      !openShipment.trackingNumber &&
      ageHours > STUCK_THRESHOLD_HOURS
    ) {
      issues.push({
        code: 'TRACKING_MISSING',
        severity: 'medium',
        description: `Shipment ${openShipment.id} (${openShipment.carrier}) has no tracking number after ${ageHours.toFixed(0)}h. Attach tracking to mark the order shipped.`,
        suggestedTools: ['update_shipment_tracking'],
      });
    }

    // --- Invoice issues ---
    if (
      [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status) &&
      !invoice
    ) {
      issues.push({
        code: 'INVOICE_MISSING',
        severity: 'high',
        description: `Order is ${order.status} but no invoice was generated. Generate the invoice so the customer can be billed.`,
        suggestedTools: ['generate_invoice'],
      });
    }
    if (invoice && Math.abs(invoice.amount - order.totalAmount) > 0.009) {
      issues.push({
        code: 'INVOICE_AMOUNT_MISMATCH',
        severity: 'high',
        description: `Invoice ${invoice.invoiceNumber} is for ${invoice.amount} but the order total is ${order.totalAmount}. Void and regenerate the invoice.`,
        suggestedTools: ['regenerate_invoice'],
      });
    }

    // --- Refund issues ---
    const pendingRefund = (order.payments ?? [])
      .flatMap((p) => p.refunds ?? [])
      .find((r) => r.status === RefundStatus.PENDING);
    if (pendingRefund) {
      issues.push({
        code: 'REFUND_PENDING',
        severity: 'high',
        description: `A refund of ${pendingRefund.amount} is pending ("${pendingRefund.reason}"). Process it with issue_refund.`,
        suggestedTools: ['issue_refund'],
      });
    }

    // --- Inventory issues (leaked reservations on terminal orders) ---
    if ([OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status)) {
      const recon = await this.inventory.reconcileReservations();
      const orderSkus = new Set((order.items ?? []).map((i) => i.product.sku));
      const leaked = recon.mismatches.filter(
        (m) => m.difference > 0 && orderSkus.has(m.sku),
      );
      if (leaked.length > 0) {
        issues.push({
          code: 'RESERVATION_LEAK',
          severity: 'medium',
          description: `Order is ${order.status} but stock reservations appear to be leaked on: ${leaked
            .map((l) => `${l.sku} (+${l.difference} over-reserved)`)
            .join(', ')}. Release this order's reservations.`,
          suggestedTools: ['release_reservations'],
        });
      }
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      customer: { name: order.customer.name, email: order.customer.email },
      hoursSinceLastUpdate: Math.round(ageHours),
      healthy: issues.length === 0,
      issues,
    };
  }

  /** Fleet-wide health summary: what needs ops attention right now. */
  async summary() {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3_600_000);

    const statusCounts = Object.fromEntries(
      await Promise.all(
        Object.values(OrderStatus).map(async (s) => [
          s,
          await this.orderRepo.countBy({ status: s }),
        ]),
      ),
    );

    const stuckPaymentOrders = await this.orderRepo.find({
      where: [
        { status: OrderStatus.PAYMENT_PENDING, updatedAt: LessThan(cutoff) },
        { status: OrderStatus.CREATED, updatedAt: LessThan(cutoff) },
      ],
    });

    const paidOrders = await this.orderRepo.find({
      where: { status: OrderStatus.PAID, updatedAt: LessThan(cutoff) },
      relations: { shipments: true },
    });
    const paidWithoutShipment = paidOrders.filter((o) => (o.shipments ?? []).length === 0);

    const deliveredOrders = await this.orderRepo.find({
      where: { status: In([OrderStatus.DELIVERED, OrderStatus.COMPLETED]) },
    });
    const activeInvoices = await this.invoiceRepo.find({
      where: { status: InvoiceStatus.ISSUED },
      relations: ['order'],
    });
    const invoicedOrderIds = new Set(activeInvoices.map((i) => i.order.id));
    const missingInvoices = deliveredOrders.filter((o) => !invoicedOrderIds.has(o.id));
    const invoiceMismatches = activeInvoices.filter(
      (i) => Math.abs(i.amount - i.order.totalAmount) > 0.009,
    );

    const pendingRefunds = await this.refundRepo.find({
      where: { status: RefundStatus.PENDING },
      relations: ['payment', 'payment.order'],
    });

    const inventoryRecon = await this.inventory.reconcileReservations();

    return {
      ordersByStatus: statusCounts,
      attentionNeeded: {
        stuckPaymentOrders: stuckPaymentOrders.map((o) => o.orderNumber),
        paidWithoutShipment: paidWithoutShipment.map((o) => o.orderNumber),
        missingInvoices: missingInvoices.map((o) => o.orderNumber),
        invoiceMismatches: invoiceMismatches.map((i) => ({
          orderNumber: i.order.orderNumber,
          invoiceNumber: i.invoiceNumber,
          invoiceAmount: i.amount,
          orderTotal: i.order.totalAmount,
        })),
        pendingRefunds: pendingRefunds.map((r) => ({
          orderNumber: r.payment.order.orderNumber,
          amount: r.amount,
          reason: r.reason,
        })),
        inventoryMismatches: inventoryRecon.mismatches,
      },
      totalIssues:
        stuckPaymentOrders.length +
        paidWithoutShipment.length +
        missingInvoices.length +
        invoiceMismatches.length +
        pendingRefunds.length +
        inventoryRecon.mismatches.length,
      hint: 'Use diagnose_order on any order number listed above to get root cause and suggested fix tools.',
    };
  }
}
