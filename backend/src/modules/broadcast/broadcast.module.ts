import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import {
  BroadcastContact,
  MessageTemplate,
  BroadcastCampaign,
  BroadcastMessage,
  ApiKey,
  WebhookConfig,
  Subscription,
  WhatsAppSession,
} from '../../common/entities';
import { ContactService } from './contact.service';
import { TemplateService } from './template.service';
import { CampaignService } from './campaign.service';
import { WebhookService } from './webhook.service';
import { ApiKeyService } from './api-key.service';
import { BroadcastProcessor } from './broadcast.processor';
import { BroadcastController } from './broadcast.controller';
import { ExternalApiController } from './external-api.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BroadcastContact,
      MessageTemplate,
      BroadcastCampaign,
      BroadcastMessage,
      ApiKey,
      WebhookConfig,
      Subscription,
      WhatsAppSession,
    ]),
    BullModule.registerQueue({
      name: 'broadcast',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
      },
    }),
    WhatsAppModule,
    SubscriptionModule,
  ],
  controllers: [BroadcastController, ExternalApiController],
  providers: [
    ContactService,
    TemplateService,
    CampaignService,
    WebhookService,
    ApiKeyService,
    BroadcastProcessor,
  ],
  exports: [
    ContactService,
    TemplateService,
    CampaignService,
    WebhookService,
    ApiKeyService,
  ],
})
export class BroadcastModule {}
