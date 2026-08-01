import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums';
import { AuditService } from '../audit/audit.service';
import { Order, Product } from '../entities';

/** Orders in these states hold stock reservations. */
export const RESERVING_STATUSES = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
];

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly audit: AuditService,
  ) {}

  async list(sku?: string) {
    const products = await this.productRepo.find({
      where: sku ? { sku: ILike(`%${sku}%`) } : {},
      order: { sku: 'ASC' },
    });
    return products.map((p) => ({
      ...p,
      availableQuantity: p.stockQuantity - p.reservedQuantity,
    }));
  }

  async adjustStock(sku: string, quantityChange: number, reason: string, actor?: string) {
    const product = await this.productRepo.findOneBy({ sku });
    if (!product) throw new NotFoundException(`Product ${sku} not found`);
    const before = { stockQuantity: product.stockQuantity };
    if (product.stockQuantity + quantityChange < 0) {
      throw new BadRequestException(
        `Cannot adjust ${sku} by ${quantityChange}: stock would become negative (current: ${product.stockQuantity})`,
      );
    }
    product.stockQuantity += quantityChange;
    await this.productRepo.save(product);
    await this.audit.log({
      actor,
      action: 'inventory.adjust',
      entityType: 'Product',
      entityId: product.id,
      reason,
      before,
      after: { stockQuantity: product.stockQuantity },
    });
    return { ...product, availableQuantity: product.stockQuantity - product.reservedQuantity };
  }

  /**
   * Release stock reservations held by an order's items. Used when cancelling
   * an order, or to clean up leaked reservations on already-terminal orders.
   */
  async releaseReservationsForOrder(orderNumber: string, reason: string, actor?: string) {
    const order = await this.orderRepo.findOne({
      where: { orderNumber },
      relations: { items: { product: true } },
    });
    if (!order) throw new NotFoundException(`Order ${orderNumber} not found`);
    if (RESERVING_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order ${orderNumber} is still open (${order.status}); its reservation is legitimate. Cancel the order instead if intended.`,
      );
    }

    const released: Array<{ sku: string; released: number }> = [];
    for (const item of order.items) {
      const product = item.product;
      const toRelease = Math.min(item.quantity, product.reservedQuantity);
      if (toRelease <= 0) continue;
      const before = { reservedQuantity: product.reservedQuantity };
      product.reservedQuantity -= toRelease;
      await this.productRepo.save(product);
      released.push({ sku: product.sku, released: toRelease });
      await this.audit.log({
        actor,
        action: 'inventory.release_reservation',
        entityType: 'Product',
        entityId: product.id,
        orderId: order.id,
        reason,
        before,
        after: { reservedQuantity: product.reservedQuantity },
      });
    }
    return { orderNumber, released };
  }

  /**
   * Compare each product's reservedQuantity against what open orders actually
   * hold, and report mismatches (e.g. leaked reservations from cancelled orders).
   */
  async reconcileReservations() {
    const products = await this.productRepo.find({ order: { sku: 'ASC' } });
    const openOrders = await this.orderRepo.find({
      where: { status: In(RESERVING_STATUSES) },
      relations: { items: { product: true } },
    });

    const expected = new Map<string, number>();
    for (const order of openOrders) {
      for (const item of order.items) {
        expected.set(item.product.id, (expected.get(item.product.id) ?? 0) + item.quantity);
      }
    }

    const mismatches = products
      .filter((p) => p.reservedQuantity !== (expected.get(p.id) ?? 0))
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        recordedReserved: p.reservedQuantity,
        expectedReserved: expected.get(p.id) ?? 0,
        difference: p.reservedQuantity - (expected.get(p.id) ?? 0),
      }));

    return {
      consistent: mismatches.length === 0,
      mismatches,
      hint:
        mismatches.length > 0
          ? 'A positive difference usually means a cancelled/refunded order never released its reservation. Find the order (search cancelled orders touching this SKU) and call release-reservations for it.'
          : undefined,
    };
  }

  /** Internal: release reservations and decrement stock when an order ships. */
  async commitStockForShipment(order: Order, actor?: string, reason?: string) {
    for (const item of order.items) {
      const product = item.product;
      const before = {
        stockQuantity: product.stockQuantity,
        reservedQuantity: product.reservedQuantity,
      };
      product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
      product.reservedQuantity = Math.max(0, product.reservedQuantity - item.quantity);
      await this.productRepo.save(product);
      await this.audit.log({
        actor,
        action: 'inventory.commit_shipment',
        entityType: 'Product',
        entityId: product.id,
        orderId: order.id,
        reason: reason ?? `Order ${order.orderNumber} shipped`,
        before,
        after: {
          stockQuantity: product.stockQuantity,
          reservedQuantity: product.reservedQuantity,
        },
      });
    }
  }

  /** Internal: release reservations when an open order is cancelled. */
  async releaseStockForCancelledOrder(order: Order, actor?: string, reason?: string) {
    for (const item of order.items) {
      const product = item.product;
      const toRelease = Math.min(item.quantity, product.reservedQuantity);
      if (toRelease <= 0) continue;
      const before = { reservedQuantity: product.reservedQuantity };
      product.reservedQuantity -= toRelease;
      await this.productRepo.save(product);
      await this.audit.log({
        actor,
        action: 'inventory.release_reservation',
        entityType: 'Product',
        entityId: product.id,
        orderId: order.id,
        reason: reason ?? `Order ${order.orderNumber} cancelled`,
        before,
        after: { reservedQuantity: product.reservedQuantity },
      });
    }
  }
}
