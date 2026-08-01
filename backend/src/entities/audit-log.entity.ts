import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Who performed the action (e.g. "ops-agent", an ops user name). */
  @Column({ default: 'ops-agent' })
  actor: string;

  /** Machine-readable action name, e.g. "payment.retry", "order.cancel". */
  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
