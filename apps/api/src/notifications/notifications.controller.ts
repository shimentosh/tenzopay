import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, JwtAuthGuard, type RequestUser } from '../auth/guards';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: RequestUser) {
    const unread = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    return { unread };
  }

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);

    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: RequestUser) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    // Scoped by userId so one user cannot mark another's notification read.
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
