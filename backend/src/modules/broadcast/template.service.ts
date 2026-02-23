import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import {
  MessageTemplate,
  TemplateType,
  TemplateCategory,
  Subscription,
} from '../../common/entities';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/broadcast.dto';
import { PlanService } from '../subscriptions/plan.service';
import { SubscriptionStatus } from '../../common/enums';

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(MessageTemplate)
    private templateRepository: Repository<MessageTemplate>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private planService: PlanService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing TemplateService - creating system templates...');
    await this.createSystemTemplates();
  }

  /**
   * Create system templates on startup
   */
  private async createSystemTemplates(): Promise<void> {
    this.logger.log('Starting system templates creation...');

    const systemTemplates: Partial<MessageTemplate>[] = [
      // Welcome templates
      {
        name: 'Bienvenue',
        description: 'Message de bienvenue pour nouveaux contacts',
        type: TemplateType.TEXT,
        category: TemplateCategory.WELCOME,
        content: 'Bonjour {nom} ! Bienvenue chez {entreprise}. Comment puis-je vous aider ?',
        variables: ['nom', 'entreprise'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Bienvenue avec image',
        description: 'Message de bienvenue avec image de marque',
        type: TemplateType.IMAGE,
        category: TemplateCategory.WELCOME,
        content: 'Bienvenue {nom} ! Nous sommes ravis de vous compter parmi nous.',
        caption: 'Bienvenue {nom} ! Nous sommes ravis de vous compter parmi nous.',
        variables: ['nom'],
        isSystem: true,
        isActive: true,
      },

      // Promotion templates
      {
        name: 'Promotion flash',
        description: 'Annonce de promotion limitée',
        type: TemplateType.TEXT,
        category: TemplateCategory.PROMOTION,
        content: '🔥 PROMO FLASH ! {nom}, profitez de {reduction}% de réduction sur {produit}. Valable jusqu\'au {date_fin}. Ne manquez pas cette offre !',
        variables: ['nom', 'reduction', 'produit', 'date_fin'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Nouvelle collection',
        description: 'Annonce de nouvelle collection avec image',
        type: TemplateType.IMAGE,
        category: TemplateCategory.PROMOTION,
        content: '✨ Nouvelle Collection !',
        caption: '{nom}, découvrez notre nouvelle collection {collection}. Disponible dès maintenant !',
        variables: ['nom', 'collection'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Code promo',
        description: 'Envoi de code promotionnel',
        type: TemplateType.TEXT,
        category: TemplateCategory.PROMOTION,
        content: '🎁 Cadeau exclusif pour vous {nom} ! Utilisez le code {code_promo} pour obtenir {avantage}. Valable jusqu\'au {date_fin}.',
        variables: ['nom', 'code_promo', 'avantage', 'date_fin'],
        isSystem: true,
        isActive: true,
      },

      // Reminder templates
      {
        name: 'Rappel de rendez-vous',
        description: 'Rappel de rendez-vous planifié',
        type: TemplateType.TEXT,
        category: TemplateCategory.REMINDER,
        content: '📅 Rappel : {nom}, vous avez un rendez-vous le {date} à {heure}. Lieu : {lieu}. À bientôt !',
        variables: ['nom', 'date', 'heure', 'lieu'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Rappel de paiement',
        description: 'Rappel de facture impayée',
        type: TemplateType.TEXT,
        category: TemplateCategory.REMINDER,
        content: '💳 Rappel : {nom}, votre facture n°{numero_facture} d\'un montant de {montant} est en attente de paiement. Merci de régulariser avant le {date_limite}.',
        variables: ['nom', 'numero_facture', 'montant', 'date_limite'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Rappel d\'événement',
        description: 'Rappel pour un événement à venir',
        type: TemplateType.TEXT,
        category: TemplateCategory.REMINDER,
        content: '🎉 N\'oubliez pas ! {nom}, l\'événement "{evenement}" commence {quand}. On vous attend !',
        variables: ['nom', 'evenement', 'quand'],
        isSystem: true,
        isActive: true,
      },

      // Notification templates
      {
        name: 'Confirmation de commande',
        description: 'Confirmation après une commande',
        type: TemplateType.TEXT,
        category: TemplateCategory.NOTIFICATION,
        content: '✅ Commande confirmée ! {nom}, votre commande n°{numero_commande} a bien été reçue. Montant : {montant}. Nous vous tiendrons informé de la livraison.',
        variables: ['nom', 'numero_commande', 'montant'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Expédition',
        description: 'Notification d\'expédition de commande',
        type: TemplateType.TEXT,
        category: TemplateCategory.NOTIFICATION,
        content: '📦 En route ! {nom}, votre commande n°{numero_commande} a été expédiée. Suivez-la ici : {lien_suivi}',
        variables: ['nom', 'numero_commande', 'lien_suivi'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Livraison effectuée',
        description: 'Confirmation de livraison',
        type: TemplateType.TEXT,
        category: TemplateCategory.NOTIFICATION,
        content: '🎁 Livré ! {nom}, votre commande n°{numero_commande} a été livrée. Bonne réception !',
        variables: ['nom', 'numero_commande'],
        isSystem: true,
        isActive: true,
      },

      // Follow-up templates
      {
        name: 'Suivi après achat',
        description: 'Message de suivi après un achat',
        type: TemplateType.TEXT,
        category: TemplateCategory.FOLLOW_UP,
        content: 'Bonjour {nom} ! Comment trouvez-vous votre {produit} ? N\'hésitez pas à nous faire part de vos retours. 😊',
        variables: ['nom', 'produit'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Demande d\'avis',
        description: 'Demande d\'avis client',
        type: TemplateType.TEXT,
        category: TemplateCategory.FOLLOW_UP,
        content: '⭐ {nom}, votre avis compte ! Prenez 2 minutes pour noter votre expérience : {lien_avis}. Merci !',
        variables: ['nom', 'lien_avis'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Panier abandonné',
        description: 'Rappel de panier non finalisé',
        type: TemplateType.TEXT,
        category: TemplateCategory.FOLLOW_UP,
        content: '🛒 {nom}, vous avez oublié quelque chose ! Votre panier vous attend avec {nb_articles} article(s). Finalisez votre commande : {lien_panier}',
        variables: ['nom', 'nb_articles', 'lien_panier'],
        isSystem: true,
        isActive: true,
      },

      // Thank you templates
      {
        name: 'Remerciement achat',
        description: 'Remerciement après un achat',
        type: TemplateType.TEXT,
        category: TemplateCategory.THANK_YOU,
        content: '🙏 Merci {nom} pour votre confiance ! Votre achat chez {entreprise} nous honore. À très bientôt !',
        variables: ['nom', 'entreprise'],
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Remerciement fidélité',
        description: 'Remerciement client fidèle',
        type: TemplateType.TEXT,
        category: TemplateCategory.THANK_YOU,
        content: '💎 {nom}, vous êtes un client en or ! Merci pour votre fidélité depuis {duree}. En reconnaissance, voici un cadeau spécial : {cadeau}',
        variables: ['nom', 'duree', 'cadeau'],
        isSystem: true,
        isActive: true,
      },

      // Location template
      {
        name: 'Notre emplacement',
        description: 'Partage de la position du magasin/bureau',
        type: TemplateType.LOCATION,
        category: TemplateCategory.CUSTOM,
        content: 'Voici notre adresse',
        locationName: 'Notre boutique',
        variables: [],
        isSystem: true,
        isActive: true,
      },

      // Document template
      {
        name: 'Envoi de catalogue',
        description: 'Envoi du catalogue produits',
        type: TemplateType.DOCUMENT,
        category: TemplateCategory.PROMOTION,
        content: 'Notre catalogue',
        caption: '{nom}, voici notre catalogue {annee}. Bonne découverte !',
        filename: 'catalogue.pdf',
        variables: ['nom', 'annee'],
        isSystem: true,
        isActive: true,
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const template of systemTemplates) {
      try {
        const exists = await this.templateRepository.findOne({
          where: { name: template.name, isSystem: true },
        });

        if (!exists) {
          await this.templateRepository.save(
            this.templateRepository.create(template),
          );
          this.logger.log(`Created system template: ${template.name}`);
          created++;
        } else {
          skipped++;
        }
      } catch (error) {
        this.logger.error(`Failed to create system template "${template.name}":`, error);
      }
    }

    this.logger.log(`System templates initialization complete: ${created} created, ${skipped} already existed`);
  }

  /**
   * Get template limit based on subscription plan (from database via PlanService)
   */
  async getTemplateLimit(organizationId: string): Promise<number> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    const plan = (subscription?.plan || 'free').toLowerCase();
    const planData = this.planService.getPlanByCode(plan);

    if (!planData) {
      return 3; // Default FREE limit
    }

    // -1 means unlimited
    return planData.maxMessageTemplates === -1 ? 999999 : planData.maxMessageTemplates;
  }

  /**
   * Get template count for organization
   */
  async getTemplateCount(organizationId: string): Promise<number> {
    return this.templateRepository.count({
      where: { organizationId, isSystem: false },
    });
  }

  /**
   * Create a custom template
   */
  async createTemplate(
    organizationId: string,
    dto: CreateTemplateDto,
  ): Promise<MessageTemplate> {
    // Check limit
    const limit = await this.getTemplateLimit(organizationId);
    const count = await this.getTemplateCount(organizationId);

    if (count >= limit) {
      throw new BadRequestException(
        `Template limit reached (${limit}). Upgrade your plan to create more templates.`,
      );
    }

    // Check for duplicate name
    const existing = await this.templateRepository.findOne({
      where: { organizationId, name: dto.name },
    });

    if (existing) {
      throw new BadRequestException('A template with this name already exists');
    }

    // Extract variables from content
    const variables = this.extractVariables(dto.content);
    if (dto.caption) {
      variables.push(...this.extractVariables(dto.caption));
    }

    const template = this.templateRepository.create({
      organizationId,
      ...dto,
      variables: [...new Set(variables)],
      isSystem: false,
    });

    return this.templateRepository.save(template);
  }

  /**
   * Get all templates (system + organization's custom)
   */
  async getTemplates(
    organizationId: string,
    category?: TemplateCategory,
    type?: TemplateType,
  ): Promise<MessageTemplate[]> {
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .where('(template.organizationId = :organizationId OR template.isSystem = true)', {
        organizationId,
      })
      .andWhere('template.isActive = true');

    if (category) {
      queryBuilder.andWhere('template.category = :category', { category });
    }

    if (type) {
      queryBuilder.andWhere('template.type = :type', { type });
    }

    return queryBuilder
      .orderBy('template.isSystem', 'DESC')
      .addOrderBy('template.category', 'ASC')
      .addOrderBy('template.name', 'ASC')
      .getMany();
  }

  /**
   * Get template by ID
   */
  async getTemplate(
    organizationId: string,
    templateId: string,
  ): Promise<MessageTemplate> {
    const template = await this.templateRepository.findOne({
      where: [
        { id: templateId, organizationId },
        { id: templateId, isSystem: true },
      ],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Update template
   */
  async updateTemplate(
    organizationId: string,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<MessageTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, organizationId, isSystem: false },
    });

    if (!template) {
      throw new NotFoundException('Template not found or is a system template');
    }

    if (dto.content) {
      dto['variables'] = this.extractVariables(dto.content);
    }

    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  /**
   * Delete template
   */
  async deleteTemplate(organizationId: string, templateId: string): Promise<void> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, organizationId, isSystem: false },
    });

    if (!template) {
      throw new NotFoundException('Template not found or is a system template');
    }

    await this.templateRepository.remove(template);
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    template: MessageTemplate,
    variables: Record<string, string>,
  ): { content: string; caption?: string } {
    let content = template.content;
    let caption = template.caption;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      content = content.replace(regex, value);
      if (caption) {
        caption = caption.replace(regex, value);
      }
    }

    return { content, caption };
  }

  /**
   * Increment usage count
   */
  async incrementUsage(templateId: string): Promise<void> {
    await this.templateRepository.increment(
      { id: templateId },
      'usageCount',
      1,
    );
    await this.templateRepository.update(
      { id: templateId },
      { lastUsedAt: new Date() },
    );
  }

  /**
   * Get system templates only
   */
  async getSystemTemplates(): Promise<MessageTemplate[]> {
    return this.templateRepository.find({
      where: { isSystem: true, isActive: true },
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private extractVariables(text: string): string[] {
    const regex = /\{([^}]+)\}/g;
    const matches = text.match(regex) || [];
    return matches.map((m) => m.slice(1, -1).toLowerCase());
  }
}
