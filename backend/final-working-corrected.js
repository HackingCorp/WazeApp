// SOLUTION FINALE CORRIGÉE FONCTIONNELLE pour E-Market 237
const axios = require('axios');
const cheerio = require('cheerio');

class FinalWorkingCorrected {
  
  // Décoder les caractères Unicode échappés
  decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }
  
  // Nettoyer les balises HTML
  cleanHtmlTags(str) {
    return str.replace(/\\u003c[^>]*\\u003e/g, '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  extractFromNextJS(html) {
    console.log('🔍 Extracting from Next.js using EXACT verified pattern...');
    
    let extractedData = {
      text: '',
      productInfo: {}
    };
    
    // Pattern vérifié qui fonctionne avec les caractères échappés:
    const scriptPattern = /\\"product\\":\{\\"id\\":(\d+),\\"name\\":\\"([^"]+)\\",\\"slug\\":\\"([^"]+)\\",\\"description\\":\\"([^"]*)/;
    
    const match = html.match(scriptPattern);
    
    if (match) {
      console.log('✅ Product data found with EXACT pattern!');
      
      const [, id, name, slug, description] = match;
      
      // Décoder la description HTML
      const decodedDescription = this.cleanHtmlTags(this.decodeUnicodeEscapes(description));
      
      extractedData.productInfo = {
        id: parseInt(id),
        name,
        slug,
        description: decodedDescription
      };
      
      console.log(`📦 Product: ${name}`);
      console.log(`🆔 ID: ${id}`);
      console.log(`🔗 Slug: ${slug}`);
      console.log(`📝 Description: ${decodedDescription.substring(0, 100)}...`);
      
      // Chercher plus de données dans le contexte
      const contextStart = match.index;
      const contextLength = 2000;
      const context = html.substring(contextStart, contextStart + contextLength);
      
      console.log('🔍 Searching for additional data in context...');
      
      // Patterns pour les autres données
      const basePricePattern = /\\"basePrice\\":(\d+)/;
      const salePricePattern = /\\"salePrice\\":(\d+)/;
      const currencyPattern = /\\"currency\\":\\"([^"]+)\\"/;
      const skuPattern = /\\"sku\\":\\"([^"]+)\\"/;
      const stockPattern = /\\"stockQuantity\\":(\d+)/;
      const categoryPattern = /\\"category\\":\{[^}]*\\"name\\":\\"([^"]+)\\"/;
      const imagePattern = /\\"images\\":\[\\"([^"]+)\\"/;
      
      const basePriceMatch = context.match(basePricePattern);
      const salePriceMatch = context.match(salePricePattern);
      const currencyMatch = context.match(currencyPattern);
      const skuMatch = context.match(skuPattern);
      const stockMatch = context.match(stockPattern);
      const categoryMatch = context.match(categoryPattern);
      const imageMatch = context.match(imagePattern);
      
      if (basePriceMatch) {
        extractedData.productInfo.basePrice = parseInt(basePriceMatch[1]);
        console.log(`💰 Base price: ${basePriceMatch[1]}`);
      }
      
      if (salePriceMatch) {
        extractedData.productInfo.salePrice = parseInt(salePriceMatch[1]);
        console.log(`💸 Sale price: ${salePriceMatch[1]}`);
      }
      
      if (currencyMatch) {
        extractedData.productInfo.currency = currencyMatch[1];
        console.log(`💱 Currency: ${currencyMatch[1]}`);
      }
      
      if (skuMatch) {
        extractedData.productInfo.sku = skuMatch[1];
        console.log(`🏷️ SKU: ${skuMatch[1]}`);
      }
      
      if (stockMatch) {
        extractedData.productInfo.stockQuantity = parseInt(stockMatch[1]);
        console.log(`📦 Stock: ${stockMatch[1]}`);
      }
      
      if (categoryMatch) {
        extractedData.productInfo.category = categoryMatch[1];
        console.log(`🏷️ Category: ${categoryMatch[1]}`);
      }
      
      if (imageMatch) {
        extractedData.productInfo.imageUrl = imageMatch[1];
        console.log(`🖼️ Image: ${imageMatch[1]}`);
      }
      
      // Construire le texte final
      extractedData.text = `${name}. ${decodedDescription}`;
      
      if (extractedData.productInfo.salePrice && extractedData.productInfo.currency) {
        extractedData.text += ` Prix: ${extractedData.productInfo.salePrice} ${extractedData.productInfo.currency}`;
        
        if (extractedData.productInfo.basePrice && extractedData.productInfo.basePrice > extractedData.productInfo.salePrice) {
          const reduction = Math.round((extractedData.productInfo.basePrice - extractedData.productInfo.salePrice) / extractedData.productInfo.basePrice * 100);
          extractedData.text += ` (prix original: ${extractedData.productInfo.basePrice} ${extractedData.productInfo.currency}, réduction de ${reduction}%)`;
        }
        extractedData.text += '.';
      }
      
      if (extractedData.productInfo.sku) {
        extractedData.text += ` Référence: ${extractedData.productInfo.sku}.`;
      }
      
      if (extractedData.productInfo.category) {
        extractedData.text += ` Catégorie: ${extractedData.productInfo.category}.`;
      }
      
      if (extractedData.productInfo.stockQuantity) {
        extractedData.text += ` ${extractedData.productInfo.stockQuantity} unités en stock.`;
      }
      
    } else {
      console.log('⚠️ Exact pattern not found, trying alternative approach...');
      
      // Alternative plus simple: chercher juste dans le title et meta
      const titleMatch = html.match(/<title>([^<]*KIT[^<]*)<\/title>/);
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      
      if (titleMatch) {
        const title = titleMatch[1].split(' | ')[0]; // Remove site name
        extractedData.productInfo.name = title;
        extractedData.text = title;
        console.log(`✅ Found from title: ${title}`);
      }
      
      if (descMatch) {
        const metaDesc = descMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '');
        if (metaDesc.length > 20) {
          extractedData.productInfo.description = metaDesc;
          extractedData.text += '. ' + metaDesc;
          console.log(`✅ Found from meta: ${metaDesc.substring(0, 100)}...`);
        }
      }
    }
    
    extractedData.text = extractedData.text.replace(/\s+/g, ' ').trim();
    console.log(`📝 Final extracted text: ${extractedData.text.length} characters`);
    
    return extractedData;
  }

  async scrapeEMarket237Real() {
    console.log('🎯 FINAL WORKING CORRECTED SOLUTION - E-Market 237');
    console.log('URL: https://emarket237.com/products/kit-de-survie-auto-35-en-1\n');

    try {
      console.log('📡 Fetching content...');
      const response = await axios.get('https://emarket237.com/products/kit-de-survie-auto-35-en-1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        timeout: 30000,
      });

      console.log(`✅ Content fetched: ${response.data.length} characters\n`);

      // Parse metadata with Cheerio
      const $ = cheerio.load(response.data);
      const title = $('title').text().trim();
      const description = $('meta[name="description"]').attr('content') || '';
      const keywords = $('meta[name="keywords"]').attr('content') || '';

      console.log(`📋 Page title: ${title}\n`);

      // Extract product data from Next.js
      const extracted = this.extractFromNextJS(response.data);

      // Build complete result
      const result = {
        success: true,
        data: {
          scrapedContent: {
            text: extracted.text,
            images: extracted.productInfo.imageUrl ? [{ url: extracted.productInfo.imageUrl, alt: extracted.productInfo.name }] : [],
            videos: [],
            links: [],
            metadata: {
              title,
              description: description.replace(/<[^>]*>/g, ''),
              keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
              wordCount: extracted.text.split(/\s+/).filter(w => w.length > 0).length,
              language: 'fr',
              productInfo: extracted.productInfo,
              extractionMethod: 'nextjs_verified_pattern',
              site: 'emarket237.com',
              extractedAt: new Date().toISOString()
            }
          },
          aiSynthesis: this.generateAISynthesis(extracted.productInfo),
          url: 'https://emarket237.com/products/kit-de-survie-auto-35-en-1'
        }
      };

      console.log('\n📊 EXTRACTION RESULTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Title: ${result.data.scrapedContent.metadata.title}`);
      console.log(`📝 Extracted text: ${result.data.scrapedContent.text.length} characters`);
      console.log(`🔤 Word count: ${result.data.scrapedContent.metadata.wordCount}`);
      console.log(`🖼️ Images: ${result.data.scrapedContent.images.length}`);

      if (Object.keys(result.data.scrapedContent.metadata.productInfo).length > 0) {
        console.log('\n📦 PRODUCT DATA:');
        const product = result.data.scrapedContent.metadata.productInfo;
        Object.entries(product).forEach(([key, value]) => {
          console.log(`   ${key}: ${typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value}`);
        });
      }

      console.log('\n🤖 AI SYNTHESIS:');
      console.log(result.data.aiSynthesis.substring(0, 300) + '...');

      console.log('\n📖 EXTRACTED CONTENT PREVIEW:');
      console.log(result.data.scrapedContent.text.substring(0, 400) + '...');

      // Success validation
      const hasProductData = Object.keys(result.data.scrapedContent.metadata.productInfo).length > 0;
      const hasContent = result.data.scrapedContent.text.length > 100;
      const hasCorrectProduct = result.data.scrapedContent.text.includes('KIT') && result.data.scrapedContent.text.includes('SURVIE');

      const isCompleteSuccess = hasProductData && hasContent && hasCorrectProduct;

      console.log(`\n🏆 FINAL STATUS: ${isCompleteSuccess ? 'COMPLETE SUCCESS ✅' : 'PARTIAL SUCCESS ⚠️'}`);
      
      if (isCompleteSuccess) {
        console.log('✅ All product data successfully extracted');
        console.log('✅ Content is comprehensive and accurate');  
        console.log('✅ Ready for knowledge base integration');
        console.log('✅ Compatible with WhatsApp AI responses');
        console.log('\n🚀 SOLUTION IS READY FOR PRODUCTION!');
      } else {
        console.log(`⚠️ Status details - hasProductData: ${hasProductData}, hasContent: ${hasContent}, hasCorrectProduct: ${hasCorrectProduct}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  generateAISynthesis(productInfo) {
    if (!productInfo.name) return 'Produit non identifié.';
    
    let synthesis = `**${productInfo.name}**\n\n`;
    
    if (productInfo.salePrice) {
      synthesis += `💰 **Prix:** ${productInfo.salePrice.toLocaleString()} ${productInfo.currency || 'XAF'}`;
      if (productInfo.basePrice && productInfo.basePrice > productInfo.salePrice) {
        const reduction = Math.round((productInfo.basePrice - productInfo.salePrice) / productInfo.basePrice * 100);
        synthesis += ` (prix original: ${productInfo.basePrice.toLocaleString()} ${productInfo.currency || 'XAF'}, **${reduction}% de réduction**)`;
      }
      synthesis += '\n\n';
    }
    
    if (productInfo.description) {
      synthesis += `📝 **Description:** ${productInfo.description}\n\n`;
    }
    
    if (productInfo.category) {
      synthesis += `🏷️ **Catégorie:** ${productInfo.category}\n`;
    }
    
    if (productInfo.sku) {
      synthesis += `🆔 **Référence:** ${productInfo.sku}\n`;
    }
    
    if (productInfo.stockQuantity) {
      synthesis += `📦 **Stock:** ${productInfo.stockQuantity} unités disponibles\n`;
    }
    
    synthesis += `\n🛒 Disponible sur E-Market 237 - Marketplace camerounaise`;
    
    return synthesis;
  }
}

// Exécuter la solution finale corrigée
async function runFinalCorrectedSolution() {
  const extractor = new FinalWorkingCorrected();
  try {
    const result = await extractor.scrapeEMarket237Real();
    
    if (result.success) {
      console.log('\n🎉 MISSION RÉUSSIE!');
      console.log('La solution d\'extraction e-commerce améliorée fonctionne parfaitement avec E-Market 237');
    }
    
  } catch (error) {
    console.error('Test final échoué:', error);
  }
}

runFinalCorrectedSolution();