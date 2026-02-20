import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

@Injectable()
export class PostHogService implements OnModuleDestroy {
  private client: PostHog | null = null;
  private readonly logger = new Logger(PostHogService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('POSTHOG_API_KEY');
    const host = this.configService.get<string>('POSTHOG_HOST');

    if (apiKey) {
      this.client = new PostHog(apiKey, { host });
      this.logger.log('PostHog initialized');
    } else {
      this.logger.warn('POSTHOG_API_KEY not set, analytics disabled');
    }
  }

  capture(distinctId: string, event: string, properties?: Record<string, any>) {
    this.client?.capture({ distinctId, event, properties });
  }

  identify(distinctId: string, properties?: Record<string, any>) {
    this.client?.identify({ distinctId, properties });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.shutdown();
      this.logger.log('PostHog client shut down');
    }
  }
}
