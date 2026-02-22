import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MOBILE_MONEY_COUNTRIES } from '@/common/constants/mobile-money-countries';

interface GeoResult {
  countryCode: string;
  country?: string;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, { result: GeoResult; expiresAt: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly httpService: HttpService) {}

  async detectCountry(ip: string): Promise<GeoResult | null> {
    // Skip loopback/private IPs (dev environment)
    if (this.isPrivateIp(ip)) {
      return null;
    }

    // Check cache
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`http://ip-api.com/json/${ip}?fields=status,countryCode,country`, {
          timeout: 3000,
        }),
      );

      if (response.data?.status === 'success') {
        const result: GeoResult = {
          countryCode: response.data.countryCode,
          country: response.data.country,
        };

        // Cache the result
        this.cache.set(ip, {
          result,
          expiresAt: Date.now() + this.CACHE_TTL,
        });

        return result;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Geo detection failed for IP ${ip}: ${error.message}`);
      return null;
    }
  }

  isMobileMoneyAvailable(countryCode: string): boolean {
    return MOBILE_MONEY_COUNTRIES.includes(countryCode);
  }

  private isPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('10.') ||
      ip.startsWith('172.') ||
      ip.startsWith('192.168.') ||
      ip === '::ffff:127.0.0.1'
    );
  }
}
