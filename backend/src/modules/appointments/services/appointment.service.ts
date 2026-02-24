import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment } from '@/common/entities';
import { AppointmentStatus } from '@/common/enums';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(organizationId: string, query: {
    status?: AppointmentStatus;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    agentId?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, search, dateFrom, dateTo, agentId, page = 1, limit = 20 } = query;
    const qb = this.appointmentRepository.createQueryBuilder('appointment')
      .where('appointment.organizationId = :organizationId', { organizationId });

    if (status) {
      qb.andWhere('appointment.status = :status', { status });
    }
    if (search) {
      qb.andWhere('(appointment.clientName ILIKE :search OR appointment.clientPhoneNumber ILIKE :search OR appointment.title ILIKE :search)', { search: `%${search}%` });
    }
    if (dateFrom) {
      qb.andWhere('appointment.scheduledDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('appointment.scheduledDate <= :dateTo', { dateTo });
    }
    if (agentId) {
      qb.andWhere('appointment.agentId = :agentId', { agentId });
    }

    qb.orderBy('appointment.scheduledDate', 'DESC')
      .addOrderBy('appointment.startTime', 'ASC');

    const total = await qb.getCount();
    const appointments = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { appointments, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, organizationId: string) {
    const appointment = await this.appointmentRepository.findOne({
      where: { id, organizationId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async getStats(organizationId: string) {
    const today = new Date().toISOString().slice(0, 10);

    const [total, pending, confirmed, completed, cancelled, noShow] = await Promise.all([
      this.appointmentRepository.count({ where: { organizationId } }),
      this.appointmentRepository.count({ where: { organizationId, status: AppointmentStatus.PENDING } }),
      this.appointmentRepository.count({ where: { organizationId, status: AppointmentStatus.CONFIRMED } }),
      this.appointmentRepository.count({ where: { organizationId, status: AppointmentStatus.COMPLETED } }),
      this.appointmentRepository.count({ where: { organizationId, status: AppointmentStatus.CANCELLED } }),
      this.appointmentRepository.count({ where: { organizationId, status: AppointmentStatus.NO_SHOW } }),
    ]);

    const upcoming = await this.appointmentRepository.createQueryBuilder('a')
      .where('a.organizationId = :organizationId', { organizationId })
      .andWhere('a.scheduledDate >= :today', { today })
      .andWhere('a.status IN (:...statuses)', { statuses: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] })
      .getCount();

    const completedToday = await this.appointmentRepository.createQueryBuilder('a')
      .where('a.organizationId = :organizationId', { organizationId })
      .andWhere('a.scheduledDate = :today', { today })
      .andWhere('a.status = :status', { status: AppointmentStatus.COMPLETED })
      .getCount();

    return { total, pending, confirmed, completed, cancelled, noShow, upcoming, completedToday };
  }

  async updateStatus(id: string, organizationId: string, status: AppointmentStatus, cancellationReason?: string) {
    const appointment = await this.findOne(id, organizationId);
    appointment.status = status;
    if (cancellationReason) appointment.cancellationReason = cancellationReason;
    const saved = await this.appointmentRepository.save(appointment);

    this.eventEmitter.emit('appointment.updated', {
      appointment: saved,
      organizationId,
    });

    return saved;
  }

  async createFromAI(data: {
    organizationId: string;
    agentId?: string;
    conversationId?: string;
    clientPhoneNumber: string;
    clientName?: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    durationMinutes?: number;
    title?: string;
    description?: string;
  }) {
    const appointment = this.appointmentRepository.create({
      ...data,
      status: AppointmentStatus.PENDING,
    });

    const saved = await this.appointmentRepository.save(appointment);
    this.logger.log(`Appointment created from AI: ${saved.id} for ${saved.clientPhoneNumber}`);

    this.eventEmitter.emit('appointment.created', {
      appointment: saved,
      organizationId: data.organizationId,
      conversationId: data.conversationId,
    });

    return saved;
  }
}
