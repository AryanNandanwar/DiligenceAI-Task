import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { OrderStatus, ShipmentStatus } from '../common/enums';
import { Shipment } from '../entities';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly shipmentRepo: Repository<Shipment>,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /** Create a shipment for a paid order that fulfillment missed. */
  async create(
    orderKey: string,
    carrier: string,
    reason: string,
    trackingNumber?: string,
    actor?: string,
  ) {
    const order = await this.orders.findByKey(orderKey);
    if (![OrderStatus.PAID, OrderStatus.FULFILLING].includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is ${order.status}; shipments can only be created for PAID or FULFILLING orders.`,
      );
    }
    const existing = order.shipments?.find((s) => s.status !== ShipmentStatus.DELIVERED);
    if (existing) {
      throw new BadRequestException(
        `Order ${order.orderNumber} already has an open shipment (${existing.id}, ${existing.carrier}). Update it instead.`,
      );
    }

    const shipment = await this.shipmentRepo.save(
      this.shipmentRepo.create({
        order,
        carrier,
        trackingNumber: trackingNumber ?? null,
        status: trackingNumber ? ShipmentStatus.IN_TRANSIT : ShipmentStatus.CREATED,
      }),
    );
    await this.audit.log({
      actor,
      action: 'shipment.create',
      entityType: 'Shipment',
      entityId: shipment.id,
      orderId: order.id,
      reason,
      after: { carrier, trackingNumber: trackingNumber ?? null, status: shipment.status },
    });

    if (trackingNumber) {
      // Handed to carrier already: commit stock and mark shipped.
      await this.inventory.commitStockForShipment(order, actor, reason);
      await this.orders.advanceStatus(order, OrderStatus.SHIPPED, 'order.shipped', reason, actor);
    } else if (order.status === OrderStatus.PAID) {
      await this.orders.advanceStatus(
        order,
        OrderStatus.FULFILLING,
        'order.fulfilling',
        reason,
        actor,
      );
    }
    return this.orders.getDetail(order.orderNumber);
  }

  /** Attach/update a tracking number; marks the order SHIPPED. */
  async updateTracking(orderKey: string, trackingNumber: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const shipment = this.openShipment(order.shipments);
    if (!shipment) {
      throw new NotFoundException(
        `Order ${order.orderNumber} has no open shipment. Create one first.`,
      );
    }
    const before = { trackingNumber: shipment.trackingNumber, status: shipment.status };
    shipment.trackingNumber = trackingNumber;
    shipment.status = ShipmentStatus.IN_TRANSIT;
    await this.shipmentRepo.save(shipment);
    await this.audit.log({
      actor,
      action: 'shipment.update_tracking',
      entityType: 'Shipment',
      entityId: shipment.id,
      orderId: order.id,
      reason,
      before,
      after: { trackingNumber, status: ShipmentStatus.IN_TRANSIT },
    });

    if ([OrderStatus.PAID, OrderStatus.FULFILLING].includes(order.status)) {
      await this.inventory.commitStockForShipment(order, actor, reason);
      await this.orders.advanceStatus(order, OrderStatus.SHIPPED, 'order.shipped', reason, actor);
    }
    return this.orders.getDetail(order.orderNumber);
  }

  /** Mark the shipment delivered; moves the order to DELIVERED. */
  async markDelivered(orderKey: string, reason: string, actor?: string) {
    const order = await this.orders.findByKey(orderKey);
    const shipment = this.openShipment(order.shipments);
    if (!shipment) {
      throw new NotFoundException(`Order ${order.orderNumber} has no open shipment.`);
    }
    const before = { status: shipment.status };
    shipment.status = ShipmentStatus.DELIVERED;
    await this.shipmentRepo.save(shipment);
    await this.audit.log({
      actor,
      action: 'shipment.mark_delivered',
      entityType: 'Shipment',
      entityId: shipment.id,
      orderId: order.id,
      reason,
      before,
      after: { status: ShipmentStatus.DELIVERED },
    });

    if (order.status === OrderStatus.SHIPPED) {
      await this.orders.advanceStatus(
        order,
        OrderStatus.DELIVERED,
        'order.delivered',
        reason,
        actor,
      );
    }
    return this.orders.getDetail(order.orderNumber);
  }

  private openShipment(shipments: Shipment[]): Shipment | undefined {
    return (shipments ?? [])
      .filter((s) => s.status !== ShipmentStatus.DELIVERED)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }
}
