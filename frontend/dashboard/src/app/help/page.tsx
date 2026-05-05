'use client';

import React, { useState } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Book,
  Zap,
  Users,
  Bot,
  Database,
  BarChart3,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
} from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: 'Comment connecter mon WhatsApp ?',
    answer:
      "Allez dans la section WhatsApp du dashboard, cliquez sur \"Nouvelle session\" et scannez le QR code avec votre application WhatsApp. La connexion se fait en quelques secondes.",
  },
  {
    question: "Comment cr\u00e9er un agent IA ?",
    answer:
      "Dans la section Agents, cliquez sur \"Nouvel agent\", configurez son nom, sa langue, son ton et son prompt syst\u00e8me. Associez-le ensuite \u00e0 une session WhatsApp pour qu'il commence \u00e0 r\u00e9pondre automatiquement.",
  },
  {
    question: "Qu'est-ce qu'une base de connaissances ?",
    answer:
      "Une base de connaissances est un ensemble de documents (PDF, texte, URLs) que votre agent IA utilise pour r\u00e9pondre aux questions. Plus la base est compl\u00e8te, plus les r\u00e9ponses seront pr\u00e9cises et pertinentes.",
  },
  {
    question: "Comment fonctionne l'escalade vers un humain ?",
    answer:
      "Quand un client utilise un mot-cl\u00e9 d'escalade (configurable dans les param\u00e8tres de l'agent) ou quand l'IA d\u00e9tecte qu'une intervention humaine est n\u00e9cessaire, la conversation est transf\u00e9r\u00e9e \u00e0 un op\u00e9rateur. Vous recevez une notification par WhatsApp et/ou email. Cette fonctionnalit\u00e9 est disponible \u00e0 partir du plan Pro.",
  },
  {
    question: 'Comment suivre mes quotas et ma consommation ?',
    answer:
      "La section Abonnement affiche votre consommation en temps r\u00e9el : messages envoy\u00e9s, tokens utilis\u00e9s, stockage, etc. Vous recevez des alertes quand vous approchez de vos limites.",
  },
  {
    question: 'Comment configurer le e-commerce ?',
    answer:
      "Dans la section Produits/Boutique, vous pouvez cr\u00e9er un catalogue manuellement ou connecter une boutique Shopify/WooCommerce. Votre agent IA pourra ensuite pr\u00e9senter les produits et prendre des commandes via WhatsApp. Cette fonctionnalit\u00e9 est disponible \u00e0 partir du plan Pro.",
  },
  {
    question: 'Puis-je utiliser plusieurs agents ?',
    answer:
      "Oui, le nombre d'agents d\u00e9pend de votre plan. Le plan Standard permet 1 agent, le plan Pro jusqu'\u00e0 3 agents, et le plan Enterprise jusqu'\u00e0 10 agents.",
  },
  {
    question: 'Comment fonctionne la diffusion (broadcast) ?',
    answer:
      "La fonctionnalit\u00e9 Broadcast vous permet d'envoyer des messages \u00e0 plusieurs contacts simultan\u00e9ment. Cr\u00e9ez un mod\u00e8le de message, s\u00e9lectionnez vos contacts et planifiez l'envoi. Le nombre de contacts par diffusion d\u00e9pend de votre plan.",
  },
];

const features = [
  {
    icon: Bot,
    title: 'Agents IA',
    description: "Cr\u00e9ez et configurez des agents IA pour r\u00e9pondre automatiquement sur WhatsApp.",
    link: '/agents',
  },
  {
    icon: MessageSquare,
    title: 'Conversations',
    description: "Suivez toutes les conversations en temps r\u00e9el et intervenez quand n\u00e9cessaire.",
    link: '/conversations',
  },
  {
    icon: Database,
    title: 'Base de connaissances',
    description: "Alimentez votre agent avec des documents pour des r\u00e9ponses pr\u00e9cises.",
    link: '/knowledge-base',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: "Analysez les performances de vos agents et la satisfaction client.",
    link: '/dashboard',
  },
  {
    icon: Users,
    title: 'Broadcast',
    description: "Envoyez des messages \u00e0 plusieurs contacts simultan\u00e9ment.",
    link: '/broadcast',
  },
  {
    icon: ShieldCheck,
    title: 'Abonnement',
    description: "G\u00e9rez votre plan, vos quotas et votre facturation.",
    link: '/billing',
  },
];

function FaqAccordion({ item }: { item: FaqItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-medium text-gray-900 dark:text-white">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
          <HelpCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Centre d&apos;aide</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Tout ce dont vous avez besoin pour utiliser WazeApp efficacement.
        </p>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          <Zap className="inline h-5 w-5 mr-2 text-green-600" />
          Acc\u00e8s rapide
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <a
              key={feature.title}
              href={feature.link}
              className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-500 hover:shadow-md transition-all group"
            >
              <feature.icon className="h-6 w-6 text-green-600 dark:text-green-400 mb-2 group-hover:scale-110 transition-transform" />
              <h3 className="font-medium text-gray-900 dark:text-white">{feature.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{feature.description}</p>
            </a>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          <Book className="inline h-5 w-5 mr-2 text-green-600" />
          Questions fr\u00e9quentes
        </h2>
        <div className="space-y-2">
          {faqs.map((faq) => (
            <FaqAccordion key={faq.question} item={faq} />
          ))}
        </div>
      </div>

      {/* Contact support */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Besoin d&apos;aide suppl\u00e9mentaire ?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Notre \u00e9quipe est disponible pour vous aider.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="mailto:support@wazeapp.ai"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Mail className="h-4 w-4" />
            support@wazeapp.ai
          </a>
          <a
            href="https://wazeapp.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Site web
          </a>
        </div>
      </div>
    </div>
  );
}
