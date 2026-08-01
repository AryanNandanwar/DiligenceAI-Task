import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '../common/enums';
import { numericTransformer } from '../common/numeric.transformer';
import { Customer } from './customer.entity';
import { Invoice } from './invoice.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';
import { Shipment } from './shipment.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderNumber: string;

  @ManyToOne(() => Customer, (customer) => customer.orders, { eager: true })
  customer: Customer;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CREATED })
  status: OrderStatus;

  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  totalAmount: number;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @OneToMany(() => Shipment, (shipment) => shipment.order)
  shipments: Shipment[];

  @OneToOne(() => Invoice, (invoice) => invoice.order)
  invoice: Invoice | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
