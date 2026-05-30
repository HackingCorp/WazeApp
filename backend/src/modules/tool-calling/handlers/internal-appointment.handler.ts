import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition, ToolResult, ToolExecutionContext, ToolHandler } from '../interfaces/tool.interface';
import { AppointmentService } from '../../appointments/services/appointment.service';

@Injectable()
export class InternalAppointmentHandler implements ToolHandler {
  private readonly logger = new Logger(InternalAppointmentHandler.name);

  private readonly toolNames = ['book_appointment', 'get_appointments'];

  constructor(
    private readonly appointmentService: AppointmentService,
  ) {}

  handles(name: string): boolean {
    return this.toolNames.includes(name);
  }

  getToolDefinitions(_context: ToolExecutionContext): ToolDefinition[] {
    return [
      {
        name: 'book_appointment',
        description: 'Book a new appointment for the customer. Requires a date, start time, and end time.',
        parameters: {
          type: 'object',
          properties: {
            clientName: {
              type: 'string',
              description: 'Name of the customer',
            },
            clientPhone: {
              type: 'string',
              description: 'Phone number of the customer',
            },
            date: {
              type: 'string',
              description: 'Appointment date in YYYY-MM-DD format',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM format (24h)',
            },
            endTime: {
              type: 'string',
              description: 'End time in HH:MM format (24h)',
            },
            title: {
              type: 'string',
              description: 'Title or reason for the appointment',
            },
            description: {
              type: 'string',
              description: 'Additional details about the appointment',
            },
          },
          required: ['clientPhone', 'date', 'startTime', 'endTime'],
        },
      },
      {
        name: 'get_appointments',
        description: 'List upcoming appointments for a customer by their phone number.',
        parameters: {
          type: 'object',
          properties: {
            clientPhone: {
              type: 'string',
              description: 'Phone number of the customer',
            },
          },
          required: ['clientPhone'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    switch (name) {
      case 'book_appointment':
        return this.bookAppointment(args, context);
      case 'get_appointments':
        return this.getAppointments(args, context);
      default:
        return { success: false, error: `Unknown appointment tool: ${name}` };
    }
  }

  private async bookAppointment(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const appointment = await this.appointmentService.createFromAI({
        organizationId: context.organizationId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        clientPhoneNumber: args.clientPhone || context.clientPhoneNumber,
        clientName: args.clientName,
        scheduledDate: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        title: args.title,
        description: args.description,
      });

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          scheduledDate: appointment.scheduledDate,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          status: appointment.status,
          title: appointment.title,
        },
      };
    } catch (error) {
      this.logger.error(`book_appointment failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async getAppointments(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await this.appointmentService.findAll(context.organizationId, {
        search: args.clientPhone,
        limit: 10,
      });

      const appointments = (result.appointments || []).map(a => ({
        id: a.id,
        scheduledDate: a.scheduledDate,
        startTime: a.startTime,
        endTime: a.endTime,
        title: a.title,
        status: a.status,
        clientName: a.clientName,
      }));

      return { success: true, data: { appointments, total: result.total } };
    } catch (error) {
      this.logger.error(`get_appointments failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
