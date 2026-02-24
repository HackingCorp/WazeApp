import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHours, DayOff, Appointment } from '@/common/entities';
import { DayOfWeek, AppointmentStatus } from '@/common/enums';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  private readonly dayMap: Record<number, DayOfWeek> = {
    0: DayOfWeek.SUNDAY,
    1: DayOfWeek.MONDAY,
    2: DayOfWeek.TUESDAY,
    3: DayOfWeek.WEDNESDAY,
    4: DayOfWeek.THURSDAY,
    5: DayOfWeek.FRIDAY,
    6: DayOfWeek.SATURDAY,
  };

  constructor(
    @InjectRepository(BusinessHours)
    private readonly businessHoursRepository: Repository<BusinessHours>,
    @InjectRepository(DayOff)
    private readonly dayOffRepository: Repository<DayOff>,
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
  ) {}

  async getBusinessHours(organizationId: string, agentId?: string) {
    const where: any = { organizationId };
    if (agentId) where.agentId = agentId;
    else where.agentId = null; // Use IS NULL for org-level hours

    return this.businessHoursRepository.find({ where, order: { dayOfWeek: 'ASC' } });
  }

  async setBusinessHours(organizationId: string, hours: Array<{
    dayOfWeek: DayOfWeek;
    isOpen: boolean;
    openTime?: string;
    closeTime?: string;
    breakStartTime?: string;
    breakEndTime?: string;
    slotDurationMinutes?: number;
  }>, agentId?: string) {
    // Upsert each day
    for (const h of hours) {
      const existing = await this.businessHoursRepository.findOne({
        where: { organizationId, agentId: agentId || null as any, dayOfWeek: h.dayOfWeek },
      });

      if (existing) {
        Object.assign(existing, h);
        await this.businessHoursRepository.save(existing);
      } else {
        const entry = this.businessHoursRepository.create({
          ...h,
          organizationId,
          agentId,
        });
        await this.businessHoursRepository.save(entry);
      }
    }

    return this.getBusinessHours(organizationId, agentId);
  }

  async getDaysOff(organizationId: string, agentId?: string) {
    const where: any = { organizationId };
    if (agentId) where.agentId = agentId;
    return this.dayOffRepository.find({ where, order: { date: 'ASC' } });
  }

  async addDayOff(organizationId: string, data: {
    date: string;
    reason?: string;
    allDay?: boolean;
    startTime?: string;
    endTime?: string;
    agentId?: string;
  }) {
    const dayOff = this.dayOffRepository.create({
      ...data,
      allDay: data.allDay !== false,
      organizationId,
    });
    return this.dayOffRepository.save(dayOff);
  }

  async removeDayOff(id: string, organizationId: string) {
    const dayOff = await this.dayOffRepository.findOne({ where: { id, organizationId } });
    if (dayOff) await this.dayOffRepository.remove(dayOff);
    return { deleted: true };
  }

  async getAvailableSlots(organizationId: string, date: string, agentId?: string): Promise<Array<{ startTime: string; endTime: string; available: boolean }>> {
    const dateObj = new Date(date);
    const dayOfWeek = this.dayMap[dateObj.getDay()];

    // Get business hours for this day
    const hours = await this.businessHoursRepository.findOne({
      where: { organizationId, agentId: agentId || null as any, dayOfWeek },
    });

    if (!hours || !hours.isOpen || !hours.openTime || !hours.closeTime) {
      return [];
    }

    // Check day off
    const dayOff = await this.dayOffRepository.findOne({
      where: { organizationId, date, ...(agentId ? { agentId } : {}) },
    });

    if (dayOff?.allDay) return [];

    // Generate time slots
    const slots: Array<{ startTime: string; endTime: string; available: boolean }> = [];
    const slotDuration = hours.slotDurationMinutes || 30;
    const [openH, openM] = hours.openTime.split(':').map(Number);
    const [closeH, closeM] = hours.closeTime.split(':').map(Number);
    const breakStart = hours.breakStartTime ? hours.breakStartTime.split(':').map(Number) : null;
    const breakEnd = hours.breakEndTime ? hours.breakEndTime.split(':').map(Number) : null;

    let currentMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    while (currentMinutes + slotDuration <= closeMinutes) {
      const startH = Math.floor(currentMinutes / 60);
      const startM = currentMinutes % 60;
      const endMinutes = currentMinutes + slotDuration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;

      const startTime = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      // Skip if in break time
      let inBreak = false;
      if (breakStart && breakEnd) {
        const breakStartMin = breakStart[0] * 60 + breakStart[1];
        const breakEndMin = breakEnd[0] * 60 + breakEnd[1];
        if (currentMinutes >= breakStartMin && currentMinutes < breakEndMin) {
          inBreak = true;
        }
      }

      // Skip if in partial day off
      let inDayOff = false;
      if (dayOff && !dayOff.allDay && dayOff.startTime && dayOff.endTime) {
        const [doStartH, doStartM] = dayOff.startTime.split(':').map(Number);
        const [doEndH, doEndM] = dayOff.endTime.split(':').map(Number);
        const doStartMin = doStartH * 60 + doStartM;
        const doEndMin = doEndH * 60 + doEndM;
        if (currentMinutes >= doStartMin && currentMinutes < doEndMin) {
          inDayOff = true;
        }
      }

      if (!inBreak && !inDayOff) {
        slots.push({ startTime, endTime, available: true });
      }

      currentMinutes = endMinutes;
    }

    // Check existing appointments and mark slots as unavailable
    const existingAppointments = await this.appointmentRepository.find({
      where: {
        organizationId,
        scheduledDate: date,
        ...(agentId ? { agentId } : {}),
      },
    });

    const bookedStatuses = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
    for (const slot of slots) {
      const isBooked = existingAppointments.some(
        (apt) => bookedStatuses.includes(apt.status) && apt.startTime === slot.startTime,
      );
      if (isBooked) slot.available = false;
    }

    return slots;
  }

  async getFormattedSlotsForNextDays(organizationId: string, agentId: string | undefined, days: number = 7): Promise<string> {
    const lines: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

      const slots = await this.getAvailableSlots(organizationId, dateStr, agentId);
      const availableSlots = slots.filter((s) => s.available);

      if (availableSlots.length > 0) {
        const slotTimes = availableSlots.map((s) => `${s.startTime}-${s.endTime}`).join(', ');
        lines.push(`${dayName} ${dateStr}: ${slotTimes}`);
      } else {
        lines.push(`${dayName} ${dateStr}: No available slots`);
      }
    }

    return lines.join('\n');
  }
}
