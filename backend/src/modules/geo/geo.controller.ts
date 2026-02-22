import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { GeoService } from './geo.service';

@ApiTags('Geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Public()
  @Get('detect')
  @ApiOperation({ summary: 'Detect country from IP address' })
  async detectCountry(@Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.ip;

    const geo = await this.geoService.detectCountry(ip);

    if (!geo) {
      return {
        countryCode: null,
        mobileMoneyAvailable: true, // Fallback: show all options
      };
    }

    return {
      countryCode: geo.countryCode,
      mobileMoneyAvailable: this.geoService.isMobileMoneyAvailable(geo.countryCode),
    };
  }
}
