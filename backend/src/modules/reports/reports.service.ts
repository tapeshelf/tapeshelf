import { HttpStatus, Injectable } from '@nestjs/common';

import type { RequestUser } from '../../common/auth/request-user.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CreateReportDto, ReportCreatedDto } from './reports.dto.js';

/**
 * "Report": a report on a video names its author as the
 * reported account; reporting the same thing again while the first report is open returns that one.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    reporter: RequestUser,
    dto: CreateReportDto,
  ): Promise<ReportCreatedDto> {
    const target = await this.resolveTarget(reporter.id, dto);
    const existing = await this.findOpen(reporter.id, target);
    if (existing) return { id: existing, created: false };
    try {
      const report = await this.prisma.report.create({
        data: {
          reporterId: reporter.id,
          targetType: dto.targetType,
          targetUserId: target.userId,
          videoId: target.videoId,
          reason: dto.reason,
          comment: dto.comment || null,
        },
        select: { id: true },
      });
      return { id: report.id, created: true };
    } catch (err) {
      // Two clicks racing: the partial unique index let only one through.
      const raced = await this.findOpen(reporter.id, target);
      if (raced) return { id: raced, created: false };
      throw err;
    }
  }

  private async resolveTarget(
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<{ userId: string; videoId: string | null }> {
    if (dto.targetType === 'VIDEO') {
      const video = await this.prisma.video.findFirst({
        where: { id: dto.targetId, deletedAt: null },
        select: { id: true, authorId: true },
      });
      if (!video)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'videoNotFound',
          'errors.videos.notFound',
        );
      if (video.authorId === reporterId) throw selfReport();
      return { userId: video.authorId, videoId: video.id };
    }
    const user = await this.prisma.user.findFirst({
      where: { id: dto.targetId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'userNotFound',
        'errors.users.notFound',
      );
    if (user.id === reporterId) throw selfReport();
    return { userId: user.id, videoId: null };
  }

  private async findOpen(
    reporterId: string,
    target: { userId: string; videoId: string | null },
  ): Promise<string | null> {
    const row = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetUserId: target.userId,
        videoId: target.videoId,
        status: 'OPEN',
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

const selfReport = () =>
  new AppException(HttpStatus.BAD_REQUEST, 'selfReport', 'errors.reports.self');
