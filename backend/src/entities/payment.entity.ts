import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../common/enums';
import { numericTransformer } from '../common/numeric.transformer';
import { Order } from './order.entity';
import { Refund } from './refund.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  order: Order;

  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column('int', { default: 0 })
  attempts: number;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  gatewayReference: string | null;

  @OneToMany(() => Refund, (refund) => refund.payment)
  refunds: Refund[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
