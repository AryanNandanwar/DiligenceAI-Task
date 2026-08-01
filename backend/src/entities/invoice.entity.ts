import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InvoiceStatus } from '../common/enums';
import { numericTransformer } from '../common/numeric.transformer';
import { Order } from './order.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoiceNumber: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.ISSUED })
  status: InvoiceStatus;

  @CreateDateColumn()
  issuedAt: Date;
}
