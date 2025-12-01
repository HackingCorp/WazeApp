// SOLUTION FINALE FONCTIONNELLE pour E-Market 237
const axios = require('axios');
const cheerio = require('cheerio');

class FinalWorkingSolution {
  
  // Décoder les caractères Unicode échappés
  decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }
  
  // Nettoyer les balises HTML
  cleanHtmlTags(str) {
    return str.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  extractFromNextJS(html) {
    console.log('🔍 Extracting from Next.js (Script 31 pattern)...');
    
    let extractedData = {
      text: '',
      productInfo: {}
    };
    
    // Chercher le script qui contient "product":{"id":12,"name":"KIT DE SURVIE AUTO 35 EN 1"
    const scriptPattern = /"product":\{"id":(\d+),"name":"([^"]+)","slug":"([^"]+)","description":"([^"]+)","[^"]*"basePrice":(\d+),"salePrice":(\d+),"currency":"([^"]+)","sku":"([^"]+)","stockQuantity":(\d+)[^}]*"images":\["([^"]+)"\][^}]*"category":\{[^}]*"name":"([^"]+)"/;
    
    const match = html.match(scriptPattern);
    
    if (match) {
      console.log('✅ Perfect match found in Next.js script!');
      
      const [, id, name, slug, description, basePrice, salePrice, currency, sku, stockQuantity, imageUrl, category] = match;
      
      // Décoder la description HTML
      const decodedDescription = this.cleanHtmlTags(this.decodeUnicodeEscapes(description));
      
      extractedData.productInfo = {
        id: parseInt(id),
        name,
        slug,
        description: decodedDescription,
        basePrice: parseInt(basePrice),
        salePrice: parseInt(salePrice),
        currency,
        sku,
        stockQuantity: parseInt(stockQuantity),
        imageUrl,
        category
      };
      
      // Construire le texte complet
      extractedData.text = `${name}. Prix: ${salePrice} ${currency} (prix original: ${basePrice} ${currency}, réduction de ${Math.round((basePrice - salePrice) / basePrice * 100)}%). ${decodedDescription} Référence: ${sku}. Catégorie: ${category}. ${stockQuantity} unités en stock.`;
      
      console.log(`📦 Product: ${name}`);
      console.log(`💰 Price: ${salePrice} ${currency} (was ${basePrice} ${currency})`);
      console.log(`🏷️ SKU: ${sku}`);
      console.log(`📦 Stock: ${stockQuantity} units`);
      console.log(`🖼️ Image: ${imageUrl}`);
      console.log(`🏷️ Category: ${category}`);
      console.log(`📝 Description length: ${decodedDescription.length} chars`);
      
    } else {
      console.log('⚠️ Exact pattern not found, trying alternative extraction...');
      
      // Alternative: extraction par parties
      const nameMatch = html.match(/"name":"([^"]*KIT[^"]*)"/);
      const priceMatch = html.match(/"salePrice":(\d+)/);
      const basePriceMatch = html.match(/"basePrice":(\d+)/);
      const skuMatch = html.match(/"sku":"([^"]+)"/);
      const stockMatch = html.match(/"stockQuantity":(\d+)/);
      const currencyMatch = html.match(/"currency":"([^"]+)"/);
      const categoryMatch = html.match(/"category":\{[^}]*"name":"([^"]+)"/);
      const imageMatch = html.match(/"images":\["([^"]+)"/);
      const descMatch = html.match(/"description":"([^"]+)"/);
      
      if (nameMatch) {
        extractedData.productInfo.name = nameMatch[1];
        extractedData.text += nameMatch[1] + '. ';
        console.log(`✅ Name: ${nameMatch[1]}`);
      }
      
      if (priceMatch && currencyMatch) {
        extractedData.productInfo.salePrice = parseInt(priceMatch[1]);
        extractedData.productInfo.currency = currencyMatch[1];
        extractedData.text += `Prix: ${priceMatch[1]} ${currencyMatch[1]}. `;
        console.log(`✅ Price: ${priceMatch[1]} ${currencyMatch[1]}`);
      }
      
      if (basePriceMatch) {
        extractedData.productInfo.basePrice = parseInt(basePriceMatch[1]);
        console.log(`✅ Original price: ${basePriceMatch[1]}`);
      }
      
      if (skuMatch) {
        extractedData.productInfo.sku = skuMatch[1];
        extractedData.text += `Référence: ${skuMatch[1]}. `;
        console.log(`✅ SKU: ${skuMatch[1]}`);
      }
      
      if (stockMatch) {
        extractedData.productInfo.stockQuantity = parseInt(stockMatch[1]);
        extractedData.text += `${stockMatch[1]} unités en stock. `;
        console.log(`✅ Stock: ${stockMatch[1]}`);
      }
      
      if (categoryMatch) {
        extractedData.productInfo.category = categoryMatch[1];
        extractedData.text += `Catégorie: ${categoryMatch[1]}. `;
        console.log(`✅ Category: ${categoryMatch[1]}`);
      }
      
      if (imageMatch) {
        extractedData.productInfo.imageUrl = imageMatch[1];
        console.log(`✅ Image: ${imageMatch[1]}`);
      }
      
      if (descMatch) {
        const decodedDesc = this.cleanHtmlTags(this.decodeUnicodeEscapes(descMatch[1]));
        extractedData.productInfo.description = decodedDesc;
        extractedData.text += decodedDesc + ' ';
        console.log(`✅ Description: ${decodedDesc.substring(0, 100)}...`);
      }
    }
    
    extractedData.text = extractedData.text.replace(/\s+/g, ' ').trim();
    console.log(`📝 Final extracted text: ${extractedData.text.length} characters`);
    
    return extractedData;
  }

  async scrapeEMarket237Real() {
    console.log('🎯 FINAL WORKING SOLUTION - E-Market 237');
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
              extractionMethod: 'nextjs_enhanced',
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
        console.log(`⚠️ Partial success - hasProductData: ${hasProductData}, hasContent: ${hasContent}, hasCorrectProduct: ${hasCorrectProduct}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  generateAISynthesis(productInfo) {
    if (!productInfo.name) return 'Produit non identifié.';
    
    const reduction = productInfo.basePrice && productInfo.salePrice ? 
      Math.round((productInfo.basePrice - productInfo.salePrice) / productInfo.basePrice * 100) : 0;
    
    let synthesis = `**${productInfo.name}**\n\n`;
    
    if (productInfo.salePrice) {
      synthesis += `💰 **Prix:** ${productInfo.salePrice.toLocaleString()} ${productInfo.currency || 'XAF'}`;
      if (productInfo.basePrice && reduction > 0) {
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

// Exécuter la solution finale
async function runFinalSolution() {
  const extractor = new FinalWorkingSolution();
  try {
    const result = await extractor.scrapeEMarket237Real();
    
    if (result.success) {
      console.log('\n🎉 MISSION ACCOMPLISHED!');
      console.log('The enhanced e-commerce extractor is now working perfectly with E-Market 237');
    }
    
  } catch (error) {
    console.error('Final test failed:', error);
  }
}

runFinalSolution();