import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AttributionTrackingService } from './attribution-tracking.service';

@Controller('t')
export class TrackingRedirectController {
  constructor(private readonly trackingSvc: AttributionTrackingService) {}

  @Get(':slug')
  async redirect(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || undefined;

    try {
      const { redirectUrl } = await this.trackingSvc.resolveAndRecordClick(slug, {
        clientIp,
        userAgent,
        referer,
      });

      return res.redirect(302, redirectUrl);
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        return res.status(404).send('Tracking destination not found');
      }
      return res.status(400).send(err.message || 'Invalid tracking link');
    }
  }
}
