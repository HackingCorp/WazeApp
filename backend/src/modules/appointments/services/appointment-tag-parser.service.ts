import { Injectable, Logger } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { AvailabilityService } from './availability.service';

@Injectable()
export class AppointmentTagParserService {
  private readonly logger = new Logger(AppointmentTagParserService.name);
  private readonly tagRegex = /\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/;

  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  hasTag(response: string): boolean {
    return this.tagRegex.test(response);
  }

  async parseAndProcess(
    response: string,
    context: {
      organizationId: string;
      agentId?: string;
      conversationId?: string;
      clientPhoneNumber: string;
    },
  ): Promise<{ cleanResponse: string; appointment?: any }> {
    const match = response.match(this.tagRegex);
    if (!match) return { cleanResponse: response };

    try {
      const jsonStr = match[1].trim();
      const data = JSON.parse(jsonStr);
      this.logger.log(`Parsed APPOINTMENT tag: ${JSON.stringify(data)}`);

      // Validate required fields
      if (!data.date || !data.startTime) {
        this.logger.warn('APPOINTMENT tag missing required fields (date, startTime)');
        return { cleanResponse: response.replace(this.tagRegex, '').trim() };
      }

      // Calculate end time from duration
      const durationMinutes = data.durationMinutes || 30;
      let endTime = data.endTime;
      if (!endTime) {
        const [h, m] = data.startTime.split(':').map(Number);
        const totalMin = h * 60 + m + durationMinutes;
        endTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      }

      // Verify slot is still available
      const slots = await this.availabilityService.getAvailableSlots(
        context.organizationId,
        data.date,
        context.agentId,
      );
      const slotAvailable = slots.some(
        (s) => s.startTime === data.startTime && s.available,
      );

      if (!slotAvailable) {
        this.logger.warn(`Slot ${data.startTime} on ${data.date} is not available`);
        return {
          cleanResponse: response.replace(this.tagRegex, '').trim(),
        };
      }

      const appointment = await this.appointmentService.createFromAI({
        organizationId: context.organizationId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        clientPhoneNumber: context.clientPhoneNumber,
        clientName: data.clientName,
        scheduledDate: data.date,
        startTime: data.startTime,
        endTime,
        durationMinutes,
        title: data.title,
        description: data.description,
      });

      const cleanResponse = response.replace(this.tagRegex, '').trim();
      return { cleanResponse, appointment };
    } catch (error) {
      this.logger.error(`Failed to parse APPOINTMENT tag: ${error.message}`);
      return { cleanResponse: response.replace(this.tagRegex, '').trim() };
    }
  }
}
