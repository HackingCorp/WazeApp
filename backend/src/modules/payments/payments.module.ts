import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { S3PService } from './s3p.service';
import { EnkapService } from './enkap.service';
import { MobileMoneyController } from './mobile-money.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [MobileMoneyController],
  providers: [S3PService, EnkapService],
  exports: [S3PService, EnkapService],
})
export class PaymentsModule {}