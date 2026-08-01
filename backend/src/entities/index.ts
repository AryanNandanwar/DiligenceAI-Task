import { AuditLog } from './audit-log.entity';
import { Customer } from './customer.entity';
import { Invoice } from './invoice.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { Payment } from './payment.entity';
import { Product } from './product.entity';
import { Refund } from './refund.entity';
import { Shipment } from './shipment.entity';

export {
  AuditLog,
  Customer,
  Invoice,
  Order,
  OrderItem,
  Payment,
  Product,
  Refund,
  Shipment,
};

export const ALL_ENTITIES = [
  AuditLog,
  Customer,
  Invoice,
  Order,
  OrderItem,
  Payment,
  Product,
  Refund,
  Shipment,
];
