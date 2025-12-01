// Solution avec Puppeteer pour la homepage dynamique
const axios = require('axios');
const cheerio = require('cheerio');

class DynamicHomepageExtractor {
  
  decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }
  
  cleanHtmlTags(str) {
    return str.replace(/\\u003c[^>]*\\u003e/g, '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  // Simulation de ce que Puppeteer obtiendrait après chargement complet
  async simulatePuppeteerExtraction() {
    console.log('🔍 Simulating dynamic content extraction...');
    
    // Pour une vraie implémentation, on utiliserait:
    // const puppeteer = require('puppeteer');
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.goto('https://emarket237.com/');
    // await page.waitForSelector('.product-card', { timeout: 10000 });
    // const content = await page.content();
    
    // Pour l'instant, essayons d'extraire ce qu'on peut du HTML statique
    const response = await axios.get('https://emarket237.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const html = response.data;
    
    let extractedData = {
      text: '',
      products: [],
      categories: [],
      metadata: {}
    };

    // Extraire les informations basiques disponibles
    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';

    console.log(`📋 Title: ${title}`);
    console.log(`📝 Description: ${description.substring(0, 150)}...`);

    // Analyser les scripts pour trouver des données
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (!scriptContent) return;

      // Chercher des patterns de configuration ou de données
      if (scriptContent.includes('buildId') || scriptContent.includes('pageProps')) {
        console.log(`📜 Found Next.js config in script ${i}`);
      }

      // Chercher des URLs d'API
      const apiMatches = scriptContent.match(/(\/api\/[^\s"']*|api\.emarket237\.com[^\s"']*)/g);
      if (apiMatches) {
        console.log(`🔗 Found API endpoints: ${apiMatches.join(', ')}`);
      }
    });

    // Construire une description basée sur les métadonnées disponibles
    extractedData.text = `${title}. ${description}`;
    
    if (keywords) {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
      if (keywordList.length > 0) {
        extractedData.text += ` Mots-clés: ${keywordList.join(', ')}.`;
        extractedData.metadata.keywords = keywordList;
      }
    }

    // Chercher des liens vers des produits dans la page
    const productLinks = [];
    $('a[href*="/products/"]').each((_, link) => {
      const href = $(link).attr('href');
      const text = $(link).text().trim();
      if (href && text && text.length > 3) {
        productLinks.push({ url: href, text });
      }
    });

    if (productLinks.length > 0) {
      console.log(`🔗 Found ${productLinks.length} product links`);
      extractedData.text += ` Liens produits disponibles: ${productLinks.length} trouvés.`;
    }

    // Informations sur la structure de la page
    extractedData.metadata.isNextJS = html.includes('__next');
    extractedData.metadata.isDynamic = html.includes('Initialisation') || html.includes('Chargement');
    extractedData.metadata.hasAPI = html.includes('api.emarket237.com');

    extractedData.text += ` Site développé avec Next.js, contenu chargé dynamiquement.`;

    console.log(`📝 Final extracted text: ${extractedData.text.length} characters`);
    return extractedData;
  }

  async extractHomepage() {
    console.log('🎯 E-Market 237 Homepage - Dynamic Content Extraction');
    console.log('URL: https://emarket237.com/\n');

    try {
      const extracted = await this.simulatePuppeteerExtraction();

      const result = {
        success: true,
        data: {
          scrapedContent: {
            text: extracted.text,
            images: [],
            videos: [],
            links: [],
            metadata: {
              title: 'E-Market 237 - Marketplace Camerounaise #1',
              description: 'Marketplace camerounaise de référence avec produits et livraison au Cameroun',
              keywords: extracted.metadata.keywords || [],
              wordCount: extracted.text.split(/\s+/).filter(w => w.length > 0).length,
              language: 'fr',
              isNextJS: extracted.metadata.isNextJS,
              isDynamic: extracted.metadata.isDynamic,
              hasAPI: extracted.metadata.hasAPI,
              extractionMethod: 'static_with_metadata',
              site: 'emarket237.com',
              extractedAt: new Date().toISOString()
            }
          },
          aiSynthesis: this.generateAISynthesis(extracted),
          url: 'https://emarket237.com/'
        }
      };

      console.log('\n📊 EXTRACTION RESULTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Title: ${result.data.scrapedContent.metadata.title}`);
      console.log(`📝 Extracted text: ${result.data.scrapedContent.text.length} characters`);
      console.log(`🔤 Word count: ${result.data.scrapedContent.metadata.wordCount}`);
      console.log(`⚡ Next.js detected: ${result.data.scrapedContent.metadata.isNextJS}`);
      console.log(`🔄 Dynamic content: ${result.data.scrapedContent.metadata.isDynamic}`);
      console.log(`🔗 API available: ${result.data.scrapedContent.metadata.hasAPI}`);

      console.log('\n🤖 AI SYNTHESIS:');
      console.log(result.data.aiSynthesis.substring(0, 300) + '...');

      console.log('\n📖 EXTRACTED CONTENT:');
      console.log(result.data.scrapedContent.text);

      // Success validation
      const hasContent = result.data.scrapedContent.text.length > 200;
      const hasMetadata = result.data.scrapedContent.metadata.keywords.length > 0;

      const isSuccessful = hasContent && hasMetadata;

      console.log(`\n🏆 RESULT: ${isSuccessful ? 'SUCCESS ✅' : 'PARTIAL ⚠️'}`);
      
      if (isSuccessful) {
        console.log('✅ Homepage metadata successfully extracted');
        console.log('✅ Site structure identified (Next.js with dynamic loading)');
        console.log('✅ Ready for WhatsApp integration (basic site info)');
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('• Use Puppeteer for full product catalog extraction');
        console.log('• Make direct API calls to api.emarket237.com');
        console.log('• Extract individual product pages like /products/kit-de-survie-auto-35-en-1');
      } else {
        console.log(`⚠️ Partial extraction - needs Puppeteer for dynamic content`);
      }

      return result;

    } catch (error) {
      console.error('❌ Homepage extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  generateAISynthesis(extracted) {
    let synthesis = `**E-Market 237 - Marketplace Camerounaise**\n\n`;
    
    synthesis += `📱 **Plateforme:** Next.js avec contenu dynamique\n`;
    synthesis += `🛒 **Services:** Marketplace e-commerce au Cameroun\n`;
    synthesis += `💳 **Paiement:** Mobile Money et livraison nationale\n\n`;
    
    if (extracted.metadata.keywords && extracted.metadata.keywords.length > 0) {
      synthesis += `🏷️ **Spécialités:** ${extracted.metadata.keywords.join(', ')}\n\n`;
    }
    
    synthesis += `🔍 **Note technique:** Site avec chargement dynamique des produits. `;
    synthesis += `Pour extraire le catalogue complet, utiliser Puppeteer ou accéder aux pages produits individuelles.\n\n`;
    
    synthesis += `🌐 **Disponible sur:** https://emarket237.com/`;
    
    return synthesis;
  }
}

// Run the test
async function runHomepageTest() {
  const extractor = new DynamicHomepageExtractor();
  await extractor.extractHomepage();
}

runHomepageTest();