import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  InvoiceStatus,
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  ShipmentStatus,
} from '../common/enums';
import {
  Customer,
  Invoice,
  Order,
  OrderItem,
  Payment,
  Product,
  Refund,
  Shipment,
} from '../entities';

interface OrderSpec {
  orderNumber: string;
  customerIdx: number;
  items: { sku: string; qty: number }[];
  status: OrderStatus;
  ageDays: number;
  payment?: {
    status: PaymentStatus;
    attempts?: number;
    failureReason?: string | null;
    gatewayReference?: string | null;
  };
  shipment?: { carrier: string; trackingNumber: string | null; status: ShipmentStatus } | null;
  invoice?: { amountDelta?: number } | null;
  refund?: { status: RefundStatus; reason: string; amount?: number } | null;
  /** Scenario B5: cancelled order whose stock reservation was never released. */
  leakReservation?: boolean;
}

const PRODUCTS: Array<Partial<Product>> = [
  { sku: 'SKU-TSHIRT', name: 'Classic T-Shirt', price: 19.99, stockQuantity: 120 },
  { sku: 'SKU-HOODIE', name: 'Zip Hoodie', price: 49.99, stockQuantity: 80 },
  { sku: 'SKU-SNEAKER', name: 'Runner Sneakers', price: 89.99, stockQuantity: 45 },
  { sku: 'SKU-CAP', name: 'Baseball Cap', price: 14.99, stockQuantity: 200 },
  { sku: 'SKU-SOCKS', name: 'Socks 3-Pack', price: 9.99, stockQuantity: 300 },
  { sku: 'SKU-JACKET', name: 'Rain Jacket', price: 79.99, stockQuantity: 30 },
  { sku: 'SKU-BAG', name: 'Urban Backpack', price: 59.99, stockQuantity: 25 },
  { sku: 'SKU-WATCH', name: 'Smart Watch', price: 199.99, stockQuantity: 15 },
  { sku: 'SKU-BOTTLE', name: 'Steel Bottle', price: 24.99, stockQuantity: 150 },
  { sku: 'SKU-YOGA', name: 'Yoga Mat', price: 34.99, stockQuantity: 60 },
];

const CUSTOMERS: Array<Partial<Customer>> = [
  { name: 'Alice Johnson', email: 'alice@example.com' },
  { name: 'Bob Smith', email: 'bob@example.com' },
  { name: 'Carol White', email: 'carol@example.com' },
  { name: 'David Lee', email: 'david@example.com' },
  { name: 'Emma Brown', email: 'emma@example.com' },
  { name: 'Frank Green', email: 'frank@example.com' },
  { name: 'Grace Kim', email: 'grace@example.com' },
  { name: 'Henry Patel', email: 'henry@example.com' },
];

/** Orders in these states hold stock reservations. */
const RESERVING_STATUSES = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
];

const ORDER_SPECS: OrderSpec[] = [
  // ----- Healthy orders -----
  {
    orderNumber: 'ORD-1001', customerIdx: 0, ageDays: 30, status: OrderStatus.COMPLETED,
    items: [{ sku: 'SKU-TSHIRT', qty: 2 }, { sku: 'SKU-CAP', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'FedEx', trackingNumber: 'FDX-88231', status: ShipmentStatus.DELIVERED },
    invoice: {},
  },
  {
    orderNumber: 'ORD-1002', customerIdx: 1, ageDays: 25, status: OrderStatus.COMPLETED,
    items: [{ sku: 'SKU-WATCH', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'UPS', trackingNumber: 'UPS-11923', status: ShipmentStatus.DELIVERED },
    invoice: {},
  },
  {
    orderNumber: 'ORD-1003', customerIdx: 2, ageDays: 20, status: OrderStatus.COMPLETED,
    items: [{ sku: 'SKU-SNEAKER', qty: 1 }, { sku: 'SKU-SOCKS', qty: 3 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'DHL', trackingNumber: 'DHL-55012', status: ShipmentStatus.DELIVERED },
    invoice: {},
  },
  {
    orderNumber: 'ORD-1004', customerIdx: 3, ageDays: 10, status: OrderStatus.DELIVERED,
    items: [{ sku: 'SKU-HOODIE', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'FedEx', trackingNumber: 'FDX-90112', status: ShipmentStatus.DELIVERED },
    invoice: {},
  },
  {
    orderNumber: 'ORD-1005', customerIdx: 4, ageDays: 8, status: OrderStatus.DELIVERED,
    items: [{ sku: 'SKU-BAG', qty: 1 }, { sku: 'SKU-BOTTLE', qty: 2 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'UPS', trackingNumber: 'UPS-30871', status: ShipmentStatus.DELIVERED },
    invoice: {},
  },
  {
    orderNumber: 'ORD-1006', customerIdx: 5, ageDays: 4, status: OrderStatus.SHIPPED,
    items: [{ sku: 'SKU-JACKET', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'DHL', trackingNumber: 'DHL-71209', status: ShipmentStatus.IN_TRANSIT },
  },
  {
    orderNumber: 'ORD-1007', customerIdx: 6, ageDays: 3, status: OrderStatus.SHIPPED,
    items: [{ sku: 'SKU-YOGA', qty: 2 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'FedEx', trackingNumber: 'FDX-99341', status: ShipmentStatus.IN_TRANSIT },
  },
  {
    orderNumber: 'ORD-1008', customerIdx: 7, ageDays: 1, status: OrderStatus.FULFILLING,
    items: [{ sku: 'SKU-TSHIRT', qty: 3 }],
    payment: { status: PaymentStatus.CAPTURED },
  },
  {
    orderNumber: 'ORD-1009', customerIdx: 0, ageDays: 1, status: OrderStatus.FULFILLING,
    items: [{ sku: 'SKU-SOCKS', qty: 5 }, { sku: 'SKU-CAP', qty: 2 }],
    payment: { status: PaymentStatus.CAPTURED },
  },
  {
    orderNumber: 'ORD-1010', customerIdx: 1, ageDays: 0, status: OrderStatus.PAYMENT_PENDING,
    items: [{ sku: 'SKU-HOODIE', qty: 1 }],
    payment: { status: PaymentStatus.PENDING },
  },
  {
    orderNumber: 'ORD-1011', customerIdx: 2, ageDays: 0, status: OrderStatus.PAYMENT_PENDING,
    items: [{ sku: 'SKU-BOTTLE', qty: 4 }],
    payment: { status: PaymentStatus.PENDING },
  },
  {
    orderNumber: 'ORD-1012', customerIdx: 3, ageDays: 0, status: OrderStatus.CREATED,
    items: [{ sku: 'SKU-WATCH', qty: 1 }],
  },
  {
    orderNumber: 'ORD-1013', customerIdx: 4, ageDays: 6, status: OrderStatus.CANCELLED,
    items: [{ sku: 'SKU-SNEAKER', qty: 1 }],
    payment: { status: PaymentStatus.FAILED, attempts: 1, failureReason: 'insufficient_funds' },
  },

  // ----- Broken orders (demo scenarios) -----
  // B1: stuck in PAYMENT_PENDING for 2 days, card declined 3 times.
  {
    orderNumber: 'ORD-1101', customerIdx: 5, ageDays: 2, status: OrderStatus.PAYMENT_PENDING,
    items: [{ sku: 'SKU-SNEAKER', qty: 1 }, { sku: 'SKU-SOCKS', qty: 2 }],
    payment: { status: PaymentStatus.FAILED, attempts: 3, failureReason: 'card_declined' },
  },
  // B2: PAID 3 days ago but never got a shipment.
  {
    orderNumber: 'ORD-1102', customerIdx: 6, ageDays: 3, status: OrderStatus.PAID,
    items: [{ sku: 'SKU-HOODIE', qty: 2 }],
    payment: { status: PaymentStatus.CAPTURED },
  },
  // B3: DELIVERED but no invoice was ever generated.
  {
    orderNumber: 'ORD-1103', customerIdx: 7, ageDays: 5, status: OrderStatus.DELIVERED,
    items: [{ sku: 'SKU-JACKET', qty: 1 }, { sku: 'SKU-CAP', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'UPS', trackingNumber: 'UPS-40023', status: ShipmentStatus.DELIVERED },
  },
  // B4: invoice amount doesn't match the order total (short by 10.00).
  {
    orderNumber: 'ORD-1104', customerIdx: 0, ageDays: 7, status: OrderStatus.DELIVERED,
    items: [{ sku: 'SKU-BAG', qty: 2 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'DHL', trackingNumber: 'DHL-60455', status: ShipmentStatus.DELIVERED },
    invoice: { amountDelta: -10 },
  },
  // B5: cancelled, but the stock reservation was never released.
  {
    orderNumber: 'ORD-1105', customerIdx: 1, ageDays: 4, status: OrderStatus.CANCELLED,
    items: [{ sku: 'SKU-WATCH', qty: 2 }],
    payment: { status: PaymentStatus.FAILED, attempts: 2, failureReason: 'card_expired' },
    leakReservation: true,
  },
  // B6: delivered order with a pending customer refund awaiting processing.
  {
    orderNumber: 'ORD-1106', customerIdx: 2, ageDays: 9, status: OrderStatus.DELIVERED,
    items: [{ sku: 'SKU-YOGA', qty: 1 }, { sku: 'SKU-BOTTLE', qty: 1 }],
    payment: { status: PaymentStatus.CAPTURED },
    shipment: { carrier: 'FedEx', trackingNumber: 'FDX-77120', status: ShipmentStatus.DELIVERED },
    invoice: {},
    refund: { status: RefundStatus.PENDING, reason: 'Customer reported damaged item' },
  },
  // B7: payment shows FAILED (gateway timeout) but the gateway actually captured it.
  {
    orderNumber: 'ORD-1107', customerIdx: 3, ageDays: 1, status: OrderStatus.PAYMENT_PENDING,
    items: [{ sku: 'SKU-TSHIRT', qty: 1 }, { sku: 'SKU-HOODIE', qty: 1 }],
    payment: {
      status: PaymentStatus.FAILED,
      attempts: 1,
      failureReason: 'gateway_timeout',
      gatewayReference: 'gw_ok_8842671',
    },
  },
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async seed(): Promise<void> {
    const customerRepo = this.dataSource.getRepository(Customer);
    if ((await customerRepo.count()) > 0) {
      this.logger.log('Database already seeded, skipping');
      return;
    }

    const productRepo = this.dataSource.getRepository(Product);
    const orderRepo = this.dataSource.getRepository(Order);
    const itemRepo = this.dataSource.getRepository(OrderItem);
    const paymentRepo = this.dataSource.getRepository(Payment);
    const shipmentRepo = this.dataSource.getRepository(Shipment);
    const invoiceRepo = this.dataSource.getRepository(Invoice);
    const refundRepo = this.dataSource.getRepository(Refund);

    const products = await productRepo.save(
      PRODUCTS.map((p) => productRepo.create({ ...p, reservedQuantity: 0 })),
    );
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const customers = await customerRepo.save(CUSTOMERS.map((c) => customerRepo.create(c)));

    let invoiceSeq = 5001;
    for (const spec of ORDER_SPECS) {
      const createdAt = new Date(Date.now() - spec.ageDays * 24 * 60 * 60 * 1000);
      const total = spec.items.reduce(
        (sum, i) => sum + bySku.get(i.sku)!.price * i.qty,
        0,
      );
      const order = await orderRepo.save(
        orderRepo.create({
          orderNumber: spec.orderNumber,
          customer: customers[spec.customerIdx],
          status: spec.status,
          totalAmount: Math.round(total * 100) / 100,
          createdAt,
          updatedAt: createdAt,
        }),
      );

      await itemRepo.save(
        spec.items.map((i) =>
          itemRepo.create({
            order,
            product: bySku.get(i.sku)!,
            quantity: i.qty,
            unitPrice: bySku.get(i.sku)!.price,
          }),
        ),
      );

      let payment: Payment | undefined;
      if (spec.payment) {
        payment = await paymentRepo.save(
          paymentRepo.create({
            order,
            amount: order.totalAmount,
            status: spec.payment.status,
            attempts: spec.payment.attempts ?? 1,
            failureReason: spec.payment.failureReason ?? null,
            gatewayReference:
              spec.payment.gatewayReference ??
              (spec.payment.status === PaymentStatus.CAPTURED
                ? `gw_ok_${Math.floor(1000000 + Math.random() * 9000000)}`
                : null),
            createdAt,
          }),
        );
      }

      if (spec.shipment) {
        await shipmentRepo.save(
          shipmentRepo.create({ order, ...spec.shipment, createdAt }),
        );
      }

      if (spec.invoice) {
        await invoiceRepo.save(
          invoiceRepo.create({
            order,
            invoiceNumber: `INV-${invoiceSeq++}`,
            amount: Math.round((order.totalAmount + (spec.invoice.amountDelta ?? 0)) * 100) / 100,
            status: InvoiceStatus.ISSUED,
          }),
        );
      }

      if (spec.refund && payment) {
        await refundRepo.save(
          refundRepo.create({
            payment,
            amount: spec.refund.amount ?? order.totalAmount,
            status: spec.refund.status,
            reason: spec.refund.reason,
          }),
        );
      }

      // Accumulate stock reservations for open orders (plus the B5 leak).
      if (RESERVING_STATUSES.includes(spec.status) || spec.leakReservation) {
        for (const i of spec.items) {
          const product = bySku.get(i.sku)!;
          product.reservedQuantity += i.qty;
        }
      }
    }

    await productRepo.save([...bySku.values()]);
    this.logger.log(`Seeded ${products.length} products, ${customers.length} customers, ${ORDER_SPECS.length} orders`);
  }
}
