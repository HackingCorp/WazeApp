import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment, BusinessHours, DayOff } from '@/common/entities';
import { AppointmentController } from './controllers/appointment.controller';
import { AvailabilityController } from './controllers/availability.controller';
import { AppointmentService } from './services/appointment.service';
import { AvailabilityService } from './services/availability.service';
import { AppointmentTagParserService } from './services/appointment-tag-parser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, BusinessHours, DayOff])],
  controllers: [AppointmentController, AvailabilityController],
  providers: [AppointmentService, AvailabilityService, AppointmentTagParserService],
  exports: [AppointmentService, AvailabilityService, AppointmentTagParserService],
})
export class AppointmentsModule {}
