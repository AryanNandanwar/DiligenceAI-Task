import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RefundStatus } from '../common/enums';
import { numericTransformer } from '../common/numeric.transformer';
import { Payment } from './payment.entity';

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Payment, (payment) => payment.refunds, { onDelete: 'CASCADE' })
  payment: Payment;

  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.PENDING })
  status: RefundStatus;

  @Column()
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
