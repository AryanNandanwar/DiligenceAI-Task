import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, PaymentStatus, RefundStatus } from '../common/enums';
import { Payment, Refund } from '../entities';
import { InventoryService, RESERVING_STATUSES } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund) private readonly refundRepo: Repository<Refund>,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Retry a pending/failed payment through the (simulated) gateway.
   * The simulated gateway succeeds on retry, capturing the payment.
   */
  async retry(orderKey: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const payment = this.latestPayment(order.payments);
    if (!payment) throw new NotFoundException(`Order ${order.orderNumber} has no payment record`);
    if (payment.status === PaymentStatus.CAPTURED) {
      throw new BadRequestException(
        `Payment for ${order.orderNumber} is already CAPTURED. If the order status is stale, use force-status.`,
      );
    }

    const before = { status: payment.status, attempts: payment.attempts };
    payment.attempts += 1;
    payment.status = PaymentStatus.CAPTURED;
    payment.failureReason = null;
    payment.gatewayReference =
      payment.gatewayReference ?? `gw_ok_${Math.floor(1000000 + Math.random() * 9000000)}`;
    await this.paymentRepo.save(payment);
    await this.audit.log({
      actor,
      action: 'payment.retry',
      entityType: 'Payment',
      entityId: payment.id,
      orderId: order.id,
      reason,
      before,
      after: { status: payment.status, attempts: payment.attempts },
    });

    if ([OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING].includes(order.status)) {
      await this.orders.advanceStatus(
        order,
        OrderStatus.PAID,
        'order.payment_captured',
        `Payment captured after retry: ${reason}`,
        actor,
      );
    }
    return this.orders.getDetail(order.orderNumber);
  }

  /**
   * Reconcile a payment against the (simulated) gateway's records. Fixes the
   * case where the gateway captured the charge but our system recorded a failure
   * (e.g. a timeout on the callback).
   */
  async reconcile(orderKey: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const payment = this.latestPayment(order.payments);
    if (!payment) throw new NotFoundException(`Order ${order.orderNumber} has no payment record`);
    if (payment.status === PaymentStatus.CAPTURED) {
      return {
        reconciled: false,
        message: `Payment for ${order.orderNumber} is already CAPTURED; nothing to reconcile.`,
      };
    }

    // Simulated gateway lookup: references prefixed gw_ok_ were actually captured.
    const gatewaySaysCaptured = payment.gatewayReference?.startsWith('gw_ok_') ?? false;
    if (!gatewaySaysCaptured) {
      return {
        reconciled: false,
        message: `Gateway confirms payment for ${order.orderNumber} was NOT captured (status: ${payment.status}, reason: ${payment.failureReason ?? 'n/a'}). Consider retrying the payment or cancelling the order.`,
      };
    }

    const before = { status: payment.status, failureReason: payment.failureReason };
    payment.status = PaymentStatus.CAPTURED;
    payment.failureReason = null;
    await this.paymentRepo.save(payment);
    await this.audit.log({
      actor,
      action: 'payment.reconcile',
      entityType: 'Payment',
      entityId: payment.id,
      orderId: order.id,
      reason,
      before,
      after: { status: PaymentStatus.CAPTURED },
    });

    if ([OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING].includes(order.status)) {
      await this.orders.advanceStatus(
        order,
        OrderStatus.PAID,
        'order.payment_captured',
        `Payment reconciled with gateway: ${reason}`,
        actor,
      );
    }
    return {
      reconciled: true,
      message: `Gateway had captured ${payment.gatewayReference}; payment marked CAPTURED and order advanced.`,
      order: await this.orders.getDetail(order.orderNumber),
    };
  }

  /**
   * Issue a refund. If a PENDING refund already exists and no amount is given,
   * that refund is processed. Otherwise a new refund is created and processed.
   * A full refund moves the order to REFUNDED.
   */
  async refund(orderKey: string, reason: string, amount?: number, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const payment = order.payments.find((p) => p.status === PaymentStatus.CAPTURED);
    if (!payment) {
      throw new BadRequestException(
        `Order ${order.orderNumber} has no captured payment to refund.`,
      );
    }

    const alreadyRefunded = (payment.refunds ?? [])
      .filter((r) => r.status === RefundStatus.COMPLETED)
      .reduce((sum, r) => sum + r.amount, 0);

    let refund = (payment.refunds ?? []).find((r) => r.status === RefundStatus.PENDING);
    if (refund && amount == null) {
      refund.status = RefundStatus.COMPLETED;
      await this.refundRepo.save(refund);
    } else {
      const refundAmount = amount ?? payment.amount - alreadyRefunded;
      if (refundAmount <= 0) {
        throw new BadRequestException(`Nothing left to refund on ${order.orderNumber}.`);
      }
      if (alreadyRefunded + refundAmount > payment.amount) {
        throw new BadRequestException(
          `Refund of ${refundAmount} exceeds refundable balance (${payment.amount - alreadyRefunded}) for ${order.orderNumber}.`,
        );
      }
      refund = await this.refundRepo.save(
        this.refundRepo.create({
          payment,
          amount: Math.round(refundAmount * 100) / 100,
          status: RefundStatus.COMPLETED,
          reason,
        }),
      );
    }

    await this.audit.log({
      actor,
      action: 'payment.refund',
      entityType: 'Refund',
      entityId: refund.id,
      orderId: order.id,
      reason,
      after: { amount: refund.amount, status: refund.status },
    });

    const totalRefunded = alreadyRefunded + refund.amount;
    const isFullRefund = totalRefunded >= payment.amount;
    if (isFullRefund && order.status !== OrderStatus.REFUNDED) {
      const heldStock = RESERVING_STATUSES.includes(order.status);
      await this.orders.advanceStatus(
        order,
        OrderStatus.REFUNDED,
        'order.refunded',
        `Full refund issued: ${reason}`,
        actor,
      );
      if (heldStock) {
        await this.inventory.releaseStockForCancelledOrder(order, actor, reason);
      }
    }

    return {
      refund,
      totalRefunded: Math.round(totalRefunded * 100) / 100,
      fullRefund: isFullRefund,
      order: await this.orders.getDetail(order.orderNumber),
    };
  }

  private latestPayment(payments: Payment[]): Payment | undefined {
    return [...(payments ?? [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }
}
