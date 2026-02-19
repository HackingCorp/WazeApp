import { Global, Module } from '@nestjs/common';
import { PostHogService } from './posthog.service';
import { PostHogEventListenerService } from './posthog-event-listener.service';

@Global()
@Module({
  providers: [PostHogService, PostHogEventListenerService],
  exports: [PostHogService],
})
export class PostHogModule {}
