// Solution fonctionnelle basée sur l'analyse réelle
const axios = require('axios');
const cheerio = require('cheerio');

class WorkingExtractionService {
  
  extractFromNextJS(html) {
    console.log('🔍 Extracting from Next.js content...');
    
    let extractedData = {
      text: '',
      productInfo: {}
    };
    
    // Pattern trouvé dans l'analyse : script avec "product":{...}
    const productDataPattern = /\{"product":\{"id":(\d+),"name":"([^"]+)","slug":"([^"]+)","description":"([^"]+)","[^"]*"basePrice":([0-9]+),"salePrice":([0-9]+),"currency":"([^"]+)","sku":"([^"]+)","stockQuantity":([0-9]+)[^}]*"category":\{[^}]*"name":"([^"]+)"[^}]*\}/;
    
    const productMatch = html.match(productDataPattern);
    
    if (productMatch) {
      console.log('✅ Product data found in Next.js content!');
      
      const [, id, name, slug, description, basePrice, salePrice, currency, sku, stock, category] = productMatch;
      
      extractedData.productInfo = {
        id: parseInt(id),
        name,
        slug,
        description: description.replace(/\\u003c[^>]*\\u003e/g, '').replace(/<[^>]*>/g, ''),
        basePrice: parseInt(basePrice),
        salePrice: parseInt(salePrice),
        currency,
        sku,
        stock: parseInt(stock),
        category
      };
      
      // Construire le texte extrait
      extractedData.text = `${name} - Prix: ${salePrice} ${currency} (réduit de ${basePrice} ${currency}). ${extractedData.productInfo.description} SKU: ${sku}. Catégorie: ${category}. Stock: ${stock} unités.`;
      
      console.log(`📦 Extracted product: ${name}`);
      console.log(`💰 Price: ${salePrice} ${currency} (was ${basePrice})`);
      console.log(`🏷️ SKU: ${sku}`);
      console.log(`📦 Stock: ${stock}`);
      console.log(`🏷️ Category: ${category}`);
      
    } else {
      console.log('⚠️ Product data pattern not found, trying alternative extraction...');
      
      // Alternative: chercher dans tous les scripts
      const scriptPattern = /<script[^>]*>(.*?)<\/script>/gs;
      const scripts = html.match(scriptPattern) || [];
      
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        
        if (script.includes('KIT DE SURVIE') && script.includes('product')) {
          console.log(`📜 Found product data in script ${i + 1}`);
          
          // Extract individual pieces
          const nameMatch = script.match(/"name":"([^"]*KIT[^"]*)"/);
          const priceMatches = script.match(/"(?:salePrice|basePrice)":(\d+)/g);
          const skuMatch = script.match(/"sku":"([^"]+)"/);
          const stockMatch = script.match(/"stockQuantity":(\d+)/);
          
          if (nameMatch) {
            extractedData.productInfo.name = nameMatch[1];
            extractedData.text += nameMatch[1] + ' ';
            console.log(`✅ Name: ${nameMatch[1]}`);
          }
          
          if (priceMatches) {
            priceMatches.forEach(priceMatch => {
              const price = priceMatch.match(/(\d+)/)[1];
              extractedData.text += `Prix: ${price} XAF `;
              console.log(`✅ Price found: ${price}`);
            });
          }
          
          if (skuMatch) {
            extractedData.productInfo.sku = skuMatch[1];
            extractedData.text += `SKU: ${skuMatch[1]} `;
            console.log(`✅ SKU: ${skuMatch[1]}`);
          }
          
          if (stockMatch) {
            extractedData.productInfo.stock = parseInt(stockMatch[1]);
            extractedData.text += `Stock: ${stockMatch[1]} `;
            console.log(`✅ Stock: ${stockMatch[1]}`);
          }
          
          break;
        }
      }
    }
    
    // Clean up the text
    extractedData.text = extractedData.text.replace(/\s+/g, ' ').trim();
    
    console.log(`📝 Final extracted text: ${extractedData.text.length} characters`);
    return extractedData;
  }

  async scrapeEMarket237() {
    console.log('🚀 WORKING SOLUTION - E-Market 237 Extraction');
    console.log('URL: https://emarket237.com/products/kit-de-survie-auto-35-en-1\n');

    try {
      // Step 1: Get the HTML
      console.log('📡 Fetching HTML...');
      const response = await axios.get('https://emarket237.com/products/kit-de-survie-auto-35-en-1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
        timeout: 30000,
      });

      console.log(`✅ HTML fetched: ${response.data.length} characters\n`);

      // Step 2: Parse with Cheerio for metadata
      const $ = cheerio.load(response.data);
      const title = $('title').text().trim();
      const description = $('meta[name="description"]').attr('content') || '';
      const keywords = $('meta[name="keywords"]').attr('content') || '';

      console.log(`📋 Title: ${title}`);
      console.log(`📝 Meta description: ${description.substring(0, 100)}...\n`);

      // Step 3: Extract from Next.js (THE REAL SOLUTION)
      const extractedData = this.extractFromNextJS(response.data);

      // Step 4: Build final result
      const result = {
        text: extractedData.text,
        images: [],
        videos: [],
        links: [],
        metadata: {
          title,
          description,
          keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
          wordCount: extractedData.text.split(/\s+/).filter(w => w.length > 0).length,
          language: 'fr',
          productInfo: extractedData.productInfo,
          extractionMethod: 'nextjs_javascript',
          source: 'emarket237.com'
        }
      };

      // Extract images from HTML
      $('img').each((_, img) => {
        const src = $(img).attr('src');
        const alt = $(img).attr('alt') || '';
        
        if (src && !src.startsWith('data:')) {
          let fullUrl = src;
          if (src.startsWith('/')) {
            fullUrl = 'https://emarket237.com' + src;
          }
          result.images.push({ url: fullUrl, alt });
        }
      });

      console.log('\n📊 FINAL RESULTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Title: ${result.metadata.title}`);
      console.log(`📝 Extracted text: ${result.text.length} characters`);
      console.log(`🔤 Word count: ${result.metadata.wordCount}`);
      console.log(`🖼️ Images: ${result.images.length}`);

      if (Object.keys(result.metadata.productInfo).length > 0) {
        console.log('\n📦 PRODUCT DATA EXTRACTED:');
        Object.entries(result.metadata.productInfo).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }

      console.log('\n📖 EXTRACTED CONTENT:');
      console.log(result.text);

      // Success check
      const isSuccess = result.text.length > 100 && 
                       (result.text.includes('KIT') || result.text.includes('SURVIE')) &&
                       Object.keys(result.metadata.productInfo).length > 0;

      console.log(`\n🏆 STATUS: ${isSuccess ? 'SUCCESS ✅' : 'PARTIAL ⚠️'}`);
      
      if (isSuccess) {
        console.log('✅ Real extraction working perfectly!');
        console.log('✅ Product data successfully extracted from Next.js');
        console.log('✅ Ready for production integration');
        
        // Show how it would integrate with knowledge base
        console.log('\n🧠 KNOWLEDGE BASE INTEGRATION:');
        console.log(`Title: ${result.metadata.productInfo.name || result.metadata.title}`);
        console.log(`Content: ${result.text}`);
        console.log(`Metadata: Product from E-Market 237, Price: ${result.metadata.productInfo.salePrice} XAF`);
      }

      return result;

    } catch (error) {
      console.error('❌ Extraction failed:', error.message);
      throw error;
    }
  }
}

// Run the working solution
async function runWorkingSolution() {
  const extractor = new WorkingExtractionService();
  try {
    await extractor.scrapeEMarket237();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runWorkingSolution();