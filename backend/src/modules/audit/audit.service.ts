import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Every admin change and every account deletion. */
export const AUDIT_ACTIONS = [
  'user.ban',
  'user.unban',
  'user.role',
  'user.tier',
  'user.passwordReset',
  /** Two-step sign-in turned off for a lost phone. */
  'user.twoFactorReset',
  'user.notice',
  'user.delete',
  'user.viewAs',
  'video.update',
  'video.delete',
  'video.reprocess',
  'video.purge',
  'video.restore',
  /** An admin edited someone else's video in the editor. */
  'video.edit',
  'report.resolve',
  'report.dismiss',
  'settings.update',
  /** Support: an answer to the author, a note between admins, a status or priority set. */
  'support.reply',
  'support.note',
  'support.status',
  'support.priority',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGETS = [
  'user',
  'video',
  'report',
  'settings',
  'ticket',
] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTarget;
  targetId?: string | null;
  /** Human-readable context saved at the time (names, titles, before/after values). */
  meta?: Record<string, unknown>;
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes inside the caller's transaction when given one, so the entry commits with the change. */
  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        meta: (entry.meta ?? {}) as Prisma.InputJsonObject,
      },
    });
  }
}
