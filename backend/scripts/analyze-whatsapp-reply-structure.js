#!/usr/bin/env node

/**
 * Script pour analyser la structure des messages de réponse WhatsApp
 * Basé sur la documentation Baileys
 */

console.log('📱 Structure des messages de réponse WhatsApp (Reply/Quote)');
console.log('=======================================================\n');

// Structure typique d'un message de réponse selon Baileys
const exampleReplyMessage = {
  key: {
    remoteJid: '1234567890@s.whatsapp.net',
    fromMe: false,
    id: 'MESSAGE_ID'
  },
  message: {
    extendedTextMessage: {
      text: "Oui, je suis intéressé par ce produit !",
      contextInfo: {
        stanzaId: 'QUOTED_MESSAGE_ID',
        participant: '0987654321@s.whatsapp.net', // Auteur du message cité
        quotedMessage: {
          conversation: "Box TV & Console de jeu. 25.000FRC"
          // OU
          // imageMessage: { caption: "Box TV & Console", ... }
          // OU
          // extendedTextMessage: { text: "Message original" }
        }
      }
    }
  },
  messageTimestamp: 1642678901
};

console.log('📋 Structure d\'un message de réponse:');
console.log(JSON.stringify(exampleReplyMessage, null, 2));

console.log('\n🔍 Points clés à détecter:\n');

console.log('1. Message avec réponse:');
console.log('   message.extendedTextMessage.contextInfo.quotedMessage existe\n');

console.log('2. Types de messages quotés possibles:');
console.log('   - conversation (texte simple)');
console.log('   - extendedTextMessage.text (texte enrichi)');
console.log('   - imageMessage.caption (image avec légende)');
console.log('   - videoMessage.caption (vidéo avec légende)');
console.log('   - documentMessage (document)\n');

console.log('3. Informations du contexte:');
console.log('   - contextInfo.stanzaId : ID du message original');
console.log('   - contextInfo.participant : Auteur du message cité');
console.log('   - quotedMessage : Contenu du message original\n');

// Exemple de cas d'usage
const useCases = [
  {
    scenario: "Client répond à une image produit",
    originalMessage: "image de Box TV 25.000FRC",
    reply: "Je voudrais l'acheter",
    expectedBehavior: "L'IA doit comprendre que le client veut acheter la Box TV montrée dans l'image précédente"
  },
  {
    scenario: "Client répond à une question de l'IA",
    originalMessage: "Quelle couleur préférez-vous ?",
    reply: "Rouge s'il vous plaît",
    expectedBehavior: "L'IA doit associer 'Rouge' à la question sur la couleur"
  },
  {
    scenario: "Client répond à un lien produit",
    originalMessage: "https://facebook.com/product-link",
    reply: "C'est disponible ?",
    expectedBehavior: "L'IA doit comprendre que la question porte sur le produit du lien partagé"
  }
];

console.log('🎯 Cas d\'usage importants:\n');
useCases.forEach((useCase, index) => {
  console.log(`${index + 1}. ${useCase.scenario}`);
  console.log(`   Original: "${useCase.originalMessage}"`);
  console.log(`   Réponse: "${useCase.reply}"`);
  console.log(`   ✅ Attendu: ${useCase.expectedBehavior}\n`);
});

console.log('🚀 Améliorations nécessaires:');
console.log('1. Détecter contextInfo.quotedMessage dans extractMessageText()');
console.log('2. Extraire le contenu du message cité');
console.log('3. Enrichir le prompt IA avec le contexte de la réponse');
console.log('4. Tester avec de vrais messages de réponse WhatsApp');

console.log('\n📝 Prochaines étapes:');
console.log('- Modifier extractMessageText() pour gérer les replies');
console.log('- Ajouter extractQuotedMessage() helper');
console.log('- Enrichir le contexte envoyé à l\'IA');
console.log('- Créer des tests pour les différents types de replies');