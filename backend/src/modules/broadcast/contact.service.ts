import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, ILike } from 'typeorm';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { BroadcastContact, Subscription, SUBSCRIPTION_LIMITS } from '../../common/entities';
import { SubscriptionStatus } from '../../common/enums';
import { BaileysService } from '../whatsapp/baileys.service';
import {
  CreateContactDto,
  ImportContactsDto,
  ContactFilterDto,
  ImportResultDto,
} from './dto/broadcast.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectRepository(BroadcastContact)
    private contactRepository: Repository<BroadcastContact>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private baileysService: BaileysService,
  ) {}

  /**
   * Get contact limit based on subscription plan
   */
  async getContactLimit(organizationId: string): Promise<number> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });

    const plan = subscription?.plan || 'free';
    const limit = SUBSCRIPTION_LIMITS[plan]?.broadcastContacts;

    this.logger.log(`ContactLimit: orgId=${organizationId}, found=${!!subscription}, plan=${plan}, limit=${limit}`);

    return limit;
  }

  /**
   * Get current contact count for organization
   */
  async getContactCount(organizationId: string): Promise<number> {
    return this.contactRepository.count({ where: { organizationId } });
  }

  /**
   * Get contact statistics for organization
   */
  async getContactStats(organizationId: string): Promise<{
    total: number;
    validated: number;
    subscribed: number;
  }> {
    const total = await this.contactRepository.count({ where: { organizationId } });
    const validated = await this.contactRepository.count({
      where: { organizationId, isValidWhatsApp: true },
    });
    const subscribed = await this.contactRepository.count({
      where: { organizationId, isSubscribed: true },
    });

    return { total, validated, subscribed };
  }

  /**
   * Create a single contact
   */
  async createContact(
    organizationId: string,
    dto: CreateContactDto,
  ): Promise<BroadcastContact> {
    // Check limit
    const limit = await this.getContactLimit(organizationId);
    const count = await this.getContactCount(organizationId);

    if (count >= limit) {
      throw new BadRequestException(
        `Contact limit reached (${limit}). Upgrade your plan to add more contacts.`,
      );
    }

    // Normalize phone number
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);

    // Check for duplicate
    const existing = await this.contactRepository.findOne({
      where: { organizationId, phoneNumber },
    });

    if (existing) {
      throw new BadRequestException('Contact with this phone number already exists');
    }

    const contact = this.contactRepository.create({
      organizationId,
      phoneNumber,
      name: dto.name,
      email: dto.email,
      company: dto.company,
      tags: dto.tags || [],
      customFields: dto.customFields || {},
      notes: dto.notes,
      isSubscribed: true,
    });

    return this.contactRepository.save(contact);
  }

  /**
   * Import contacts from file buffer
   */
  async importContacts(
    organizationId: string,
    fileBuffer: Buffer,
    filename: string,
    options: ImportContactsDto,
  ): Promise<ImportResultDto> {
    const extension = filename.split('.').pop()?.toLowerCase();
    let contacts: any[] = [];

    // Parse file based on extension
    if (extension === 'csv') {
      contacts = await this.parseCSV(fileBuffer);
    } else if (['xlsx', 'xls'].includes(extension)) {
      contacts = await this.parseExcel(fileBuffer);
    } else if (extension === 'json') {
      contacts = JSON.parse(fileBuffer.toString());
    } else {
      throw new BadRequestException(
        'Unsupported file format. Please use CSV, Excel, or JSON.',
      );
    }

    // Check limit
    const limit = await this.getContactLimit(organizationId);
    const currentCount = await this.getContactCount(organizationId);
    const availableSlots = limit - currentCount;

    if (availableSlots <= 0) {
      throw new BadRequestException(
        `Contact limit reached (${limit}). Upgrade your plan to add more contacts.`,
      );
    }

    // Process contacts
    const result: ImportResultDto = {
      success: true,
      totalProcessed: contacts.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const contactsToSave: BroadcastContact[] = [];
    const contactsToUpdate: BroadcastContact[] = [];
    const phonesForValidation: string[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const row = contacts[i];

      try {
        // Extract fields (support multiple column naming conventions)
        const phoneNumber = this.normalizePhoneNumber(
          row.phoneNumber || row.phone || row.Phone || row.numero || row.Numero || row.tel || row.Tel || '',
        );
        const name =
          row.name || row.Name || row.nom || row.Nom || row.firstName || row.first_name || '';
        const email = row.email || row.Email || row.e_mail || '';
        const company =
          row.company || row.Company || row.entreprise || row.Entreprise || row.organization || '';
        const tags = row.tags
          ? (typeof row.tags === 'string' ? row.tags.split(',').map((t: string) => t.trim()) : row.tags)
          : options.tags || [];

        // Validate required fields
        if (!phoneNumber) {
          result.failed++;
          result.errors.push({ row: i + 1, error: 'Phone number is required' });
          continue;
        }

        if (!name) {
          result.failed++;
          result.errors.push({ row: i + 1, error: 'Name is required' });
          continue;
        }

        // Check if we're over the limit
        if (contactsToSave.length + result.updated >= availableSlots) {
          result.skipped++;
          result.errors.push({
            row: i + 1,
            error: 'Contact limit reached',
          });
          continue;
        }

        // Check for existing contact
        const existing = await this.contactRepository.findOne({
          where: { organizationId, phoneNumber },
        });

        if (existing) {
          if (options.skipDuplicates) {
            result.skipped++;
            continue;
          }

          // Update existing
          existing.name = name;
          if (email) existing.email = email;
          if (company) existing.company = company;
          existing.tags = [...new Set([...(existing.tags || []), ...tags])];
          contactsToUpdate.push(existing);
          result.updated++;
        } else {
          // Create new
          const contact = this.contactRepository.create({
            organizationId,
            phoneNumber,
            name,
            email: email || undefined,
            company: company || undefined,
            tags,
            isSubscribed: true,
          });
          contactsToSave.push(contact);
          phonesForValidation.push(phoneNumber);
          result.imported++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({ row: i + 1, error: error.message });
      }
    }

    // Save new contacts
    if (contactsToSave.length > 0) {
      await this.contactRepository.save(contactsToSave);
    }

    // Update existing contacts
    if (contactsToUpdate.length > 0) {
      await this.contactRepository.save(contactsToUpdate);
    }

    // Validate WhatsApp numbers in background
    if (options.validateWhatsApp && options.sessionId && phonesForValidation.length > 0) {
      this.validateWhatsAppNumbers(
        organizationId,
        options.sessionId,
        phonesForValidation,
      ).catch((err) => {
        this.logger.error('WhatsApp validation failed:', err);
      });
    }

    return result;
  }

  /**
   * Validate WhatsApp numbers
   */
  async validateWhatsAppNumbers(
    organizationId: string,
    sessionId: string,
    phoneNumbers: string[],
  ): Promise<void> {
    this.logger.log(`Validating ${phoneNumbers.length} WhatsApp numbers...`);

    const sock = this.baileysService.getSessionSocket(sessionId);
    if (!sock) {
      this.logger.warn('Session not found for validation');
      return;
    }

    for (const phone of phoneNumbers) {
      try {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid.replace('@s.whatsapp.net', ''));

        await this.contactRepository.update(
          { organizationId, phoneNumber: phone },
          {
            isValidWhatsApp: result?.exists || false,
            whatsappVerifiedAt: new Date(),
          },
        );

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`Failed to validate ${phone}:`, error);
      }
    }

    this.logger.log('WhatsApp validation completed');
  }

  /**
   * Get contacts with filtering
   */
  async getContacts(
    organizationId: string,
    filter: ContactFilterDto,
  ): Promise<{ data: BroadcastContact[]; total: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const queryBuilder = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.organizationId = :organizationId', { organizationId });

    // Apply filters
    if (filter.tags && filter.tags.length > 0) {
      queryBuilder.andWhere('contact.tags && :tags', { tags: filter.tags });
    }

    if (filter.isValidWhatsApp !== undefined) {
      queryBuilder.andWhere('contact.isValidWhatsApp = :isValidWhatsApp', {
        isValidWhatsApp: filter.isValidWhatsApp,
      });
    }

    if (filter.isSubscribed !== undefined) {
      queryBuilder.andWhere('contact.isSubscribed = :isSubscribed', {
        isSubscribed: filter.isSubscribed,
      });
    }

    if (filter.search) {
      queryBuilder.andWhere(
        '(contact.name ILIKE :search OR contact.phoneNumber ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    const [data, total] = await queryBuilder
      .orderBy('contact.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Get contact by ID
   */
  async getContact(
    organizationId: string,
    contactId: string,
  ): Promise<BroadcastContact> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, organizationId },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  /**
   * Update contact
   */
  async updateContact(
    organizationId: string,
    contactId: string,
    updates: Partial<CreateContactDto>,
  ): Promise<BroadcastContact> {
    const contact = await this.getContact(organizationId, contactId);

    if (updates.phoneNumber) {
      updates.phoneNumber = this.normalizePhoneNumber(updates.phoneNumber);
    }

    Object.assign(contact, updates);
    return this.contactRepository.save(contact);
  }

  /**
   * Delete contact
   */
  async deleteContact(organizationId: string, contactId: string): Promise<void> {
    const contact = await this.getContact(organizationId, contactId);
    await this.contactRepository.remove(contact);
  }

  /**
   * Bulk delete contacts
   */
  async bulkDeleteContacts(
    organizationId: string,
    contactIds: string[],
  ): Promise<number> {
    const result = await this.contactRepository.delete({
      id: In(contactIds),
      organizationId,
    });
    return result.affected || 0;
  }

  /**
   * Add tags to contacts
   */
  async addTags(
    organizationId: string,
    contactIds: string[],
    tags: string[],
  ): Promise<number> {
    const contacts = await this.contactRepository.find({
      where: { id: In(contactIds), organizationId },
    });

    for (const contact of contacts) {
      contact.tags = [...new Set([...(contact.tags || []), ...tags])];
    }

    await this.contactRepository.save(contacts);
    return contacts.length;
  }

  /**
   * Get all unique tags
   */
  async getAllTags(organizationId: string): Promise<string[]> {
    const contacts = await this.contactRepository.find({
      where: { organizationId },
      select: ['tags'],
    });

    const allTags = contacts.flatMap((c) => c.tags || []);
    return [...new Set(allTags)].sort();
  }

  /**
   * Unsubscribe contact
   */
  async unsubscribe(phoneNumber: string): Promise<void> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    await this.contactRepository.update(
      { phoneNumber: normalized },
      { isSubscribed: false, unsubscribedAt: new Date() },
    );
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters except +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with country code
    if (normalized.startsWith('00')) {
      normalized = '+' + normalized.slice(2);
    } else if (!normalized.startsWith('+')) {
      // Assume it's missing the + if it looks like a full number
      if (normalized.length >= 10) {
        normalized = '+' + normalized;
      }
    }

    return normalized;
  }

  private async parseCSV(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const csvString = buffer.toString('utf-8');
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });
  }

  private async parseExcel(buffer: Buffer): Promise<any[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet);
  }
}
