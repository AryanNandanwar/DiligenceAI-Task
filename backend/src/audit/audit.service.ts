import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditLog } from '../entities';

export interface AuditEntry {
  actor?: string;
  action: string;
  entityType: string;
  entityId: string;
  orderId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditEntry): Promise<AuditLog> {
    return this.repo.save(
      this.repo.create({
        actor: entry.actor ?? 'ops-agent',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        orderId: entry.orderId ?? null,
        reason: entry.reason ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      }),
    );
  }

  async query(filters: {
    orderId?: string;
    actor?: string;
    action?: string;
    since?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.actor) where.actor = filters.actor;
    if (filters.action) where.action = filters.action;
    if (filters.since) where.createdAt = MoreThanOrEqual(new Date(filters.since));
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(filters.limit ?? 50, 200),
    });
  }
}
