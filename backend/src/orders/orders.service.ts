import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ORDER_STATUS_FLOW, OrderStatus } from '../common/enums';
import { Invoice, Order } from '../entities';
import { InventoryService, RESERVING_STATUSES } from '../inventory/inventory.service';

const TERMINAL_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /** Look up an order by order number (ORD-xxxx) or UUID, with all relations. */
  async findByKey(key: string): Promise<Order> {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('order.payments', 'payments')
      .leftJoinAndSelect('payments.refunds', 'refunds')
      .leftJoinAndSelect('order.shipments', 'shipments');
    if (UUID_RE.test(key)) {
      qb.where('order.id = :key', { key });
    } else {
      qb.where('order.orderNumber ILIKE :key', { key });
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Order ${key} not found`);
    return order;
  }

  /** Full order detail including invoice and audit trail. */
  async getDetail(key: string) {
    const order = await this.findByKey(key);
    const invoice = await this.invoiceRepo.findOne({
      where: { orderId: order.id },
      order: { issuedAt: 'DESC' },
    });
    const auditTrail = await this.audit.query({ orderId: order.id, limit: 50 });
    return { ...order, invoice: invoice ?? null, auditTrail };
  }

  async search(filters: {
    status?: OrderStatus;
    email?: string;
    stuckHours?: number;
    q?: string;
    limit?: number;
  }) {
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.payments', 'payments')
      .orderBy('order.createdAt', 'DESC')
      .take(Math.min(filters.limit ?? 50, 200));

    if (filters.status) {
      qb.andWhere('order.status = :status', { status: filters.status });
    }
    if (filters.email) {
      qb.andWhere('customer.email ILIKE :email', { email: `%${filters.email}%` });
    }
    if (filters.q) {
      qb.andWhere('(order.orderNumber ILIKE :q OR customer.name ILIKE :q)', {
        q: `%${filters.q}%`,
      });
    }
    if (filters.stuckHours != null) {
      const cutoff = new Date(Date.now() - filters.stuckHours * 60 * 60 * 1000);
      qb.andWhere('order.status NOT IN (:...terminal)', { terminal: TERMINAL_STATUSES });
      qb.andWhere('order.updatedAt < :cutoff', { cutoff });
    }
    return qb.getMany();
  }

  async cancel(key: string, reason: string, actor?: string) {
    const order = await this.findByKey(key);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Order ${order.orderNumber} is already ${order.status}`);
    }
    if ([OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is ${order.status}; it cannot be cancelled. Issue a refund instead.`,
      );
    }
    const before = { status: order.status };
    const wasHoldingStock = RESERVING_STATUSES.includes(order.status);
    order.status = OrderStatus.CANCELLED;
    await this.orderRepo.save(order);
    if (wasHoldingStock) {
      await this.inventory.releaseStockForCancelledOrder(order, actor, reason);
    }
    await this.audit.log({
      actor,
      action: 'order.cancel',
      entityType: 'Order',
      entityId: order.id,
      orderId: order.id,
      reason,
      before,
      after: { status: order.status },
    });
    return this.getDetail(order.orderNumber);
  }

  /**
   * Force an order to the next valid status. Guarded by the O2C state machine —
   * only forward transitions defined in ORDER_STATUS_FLOW are allowed.
   */
  async forceStatus(key: string, target: OrderStatus, reason: string, actor?: string) {
    const order = await this.findByKey(key);
    const allowed = ORDER_STATUS_FLOW[order.status] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Invalid transition ${order.status} -> ${target} for ${order.orderNumber}. Allowed from ${order.status}: ${allowed.join(', ') || 'none (terminal state)'}`,
      );
    }
    const before = { status: order.status };
    order.status = target;
    await this.orderRepo.save(order);

    // Keep inventory consistent with the forced transition.
    if (target === OrderStatus.SHIPPED) {
      await this.inventory.commitStockForShipment(order, actor, reason);
    } else if (
      [OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(target) &&
      RESERVING_STATUSES.includes(before.status)
    ) {
      await this.inventory.releaseStockForCancelledOrder(order, actor, reason);
    }

    await this.audit.log({
      actor,
      action: 'order.force_status',
      entityType: 'Order',
      entityId: order.id,
      orderId: order.id,
      reason,
      before,
      after: { status: order.status },
    });
    return this.getDetail(order.orderNumber);
  }

  /** Internal helper for other services to advance status with audit. */
  async advanceStatus(
    order: Order,
    target: OrderStatus,
    action: string,
    reason: string,
    actor?: string,
  ) {
    const before = { status: order.status };
    order.status = target;
    await this.orderRepo.save(order);
    await this.audit.log({
      actor,
      action,
      entityType: 'Order',
      entityId: order.id,
      orderId: order.id,
      reason,
      before,
      after: { status: target },
    });
  }
}
