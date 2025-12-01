// Test sur la page d'accueil E-Market 237
const axios = require('axios');
const cheerio = require('cheerio');

class TestHomepage {
  
  decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }
  
  cleanHtmlTags(str) {
    return str.replace(/\\u003c[^>]*\\u003e/g, '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  extractFromNextJS(html) {
    console.log('🔍 Extracting data from homepage...');
    
    let extractedData = {
      text: '',
      products: [],
      metadata: {}
    };
    
    // Pattern pour multiples produits sur la homepage
    const productsPattern = /\\"products\\":\[([^\]]+)\]/;
    const singleProductPattern = /\\"product\\":\{\\"id\\":(\d+),\\"name\\":\\"([^"]+)\\",\\"slug\\":\\"([^"]+)\\"/g;
    const categoryPattern = /\\"categories\\":\[([^\]]+)\]/;
    
    // Chercher la liste des produits
    const productsMatch = html.match(productsPattern);
    if (productsMatch) {
      console.log('✅ Found products array');
      const productsData = productsMatch[1];
      
      // Extraire chaque produit
      let productMatch;
      while ((productMatch = singleProductPattern.exec(productsData)) !== null) {
        const [, id, name, slug] = productMatch;
        extractedData.products.push({
          id: parseInt(id),
          name: this.decodeUnicodeEscapes(name),
          slug
        });
        console.log(`  📦 Product: ${this.decodeUnicodeEscapes(name)}`);
      }
    }
    
    // Chercher les catégories
    const categoriesMatch = html.match(categoryPattern);
    if (categoriesMatch) {
      console.log('✅ Found categories');
      const categoriesData = categoriesMatch[1];
      const categoryNames = [];
      
      const categoryNamePattern = /\\"name\\":\\"([^"]+)\\"/g;
      let categoryMatch;
      while ((categoryMatch = categoryNamePattern.exec(categoriesData)) !== null) {
        categoryNames.push(this.decodeUnicodeEscapes(categoryMatch[1]));
      }
      
      extractedData.metadata.categories = categoryNames;
      console.log(`  🏷️ Categories: ${categoryNames.join(', ')}`);
    }
    
    // Chercher des patterns généraux de produits (fallback)
    if (extractedData.products.length === 0) {
      console.log('🔄 Trying general product patterns...');
      
      // Pattern plus général pour les noms de produits
      const generalProductPattern = /\\"name\\":\\"([^"]*(?:KIT|PHONE|LAPTOP|TABLET|WATCH|CAMERA)[^"]*)\\"/gi;
      let generalMatch;
      const foundProducts = new Set();
      
      while ((generalMatch = generalProductPattern.exec(html)) !== null) {
        const productName = this.decodeUnicodeEscapes(generalMatch[1]);
        if (!foundProducts.has(productName)) {
          foundProducts.add(productName);
          extractedData.products.push({
            name: productName,
            source: 'general_pattern'
          });
          console.log(`  📦 General product: ${productName}`);
        }
      }
    }
    
    // Construire le texte final
    if (extractedData.products.length > 0) {
      extractedData.text = `E-Market 237 - Marketplace camerounaise avec ${extractedData.products.length} produits: `;
      extractedData.text += extractedData.products.map(p => p.name).join(', ');
    } else {
      extractedData.text = 'E-Market 237 - Marketplace camerounaise de référence';
    }
    
    if (extractedData.metadata.categories && extractedData.metadata.categories.length > 0) {
      extractedData.text += `. Catégories disponibles: ${extractedData.metadata.categories.join(', ')}`;
    }
    
    extractedData.text = extractedData.text.replace(/\s+/g, ' ').trim();
    console.log(`📝 Final extracted text: ${extractedData.text.length} characters`);
    
    return extractedData;
  }

  async scrapeHomepage() {
    console.log('🎯 Testing E-Market 237 Homepage');
    console.log('URL: https://emarket237.com/\n');

    try {
      console.log('📡 Fetching homepage content...');
      const response = await axios.get('https://emarket237.com/', {
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

      console.log(`📋 Page title: ${title}`);
      console.log(`📝 Meta description: ${description.substring(0, 150)}...\n`);

      // Check for Next.js patterns
      const isNextJS = response.data.includes('__next') || response.data.includes('self.__next_f');
      console.log(`🔍 Next.js detected: ${isNextJS ? 'YES' : 'NO'}\n`);

      // Extract data
      const extracted = this.extractFromNextJS(response.data);

      // Also try traditional selectors for comparison
      console.log('🎯 Trying traditional CSS selectors...');
      let traditionalText = '';
      const selectors = [
        'h1', 'h2', 'h3', '.product-name', '.product-title', 
        '[class*="product"]', '[class*="item"]', '[class*="card"]'
      ];
      
      selectors.forEach(selector => {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`  ✓ ${selector}: ${elements.length} elements`);
          elements.each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 3 && !traditionalText.includes(text)) {
              traditionalText += text + ' ';
            }
          });
        }
      });

      traditionalText = traditionalText.replace(/\s+/g, ' ').trim();
      console.log(`📝 Traditional selectors: ${traditionalText.length} characters\n`);

      // Build final result
      const result = {
        success: true,
        data: {
          scrapedContent: {
            text: extracted.text.length > traditionalText.length ? extracted.text : traditionalText,
            images: [],
            videos: [],
            links: [],
            metadata: {
              title,
              description: description.replace(/<[^>]*>/g, ''),
              keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
              wordCount: extracted.text.split(/\s+/).filter(w => w.length > 0).length,
              language: 'fr',
              productsFound: extracted.products.length,
              categories: extracted.metadata.categories || [],
              extractionMethod: isNextJS ? 'nextjs_homepage' : 'traditional_selectors',
              site: 'emarket237.com',
              extractedAt: new Date().toISOString()
            }
          },
          url: 'https://emarket237.com/'
        }
      };

      console.log('📊 EXTRACTION RESULTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Title: ${result.data.scrapedContent.metadata.title}`);
      console.log(`📝 Extracted text: ${result.data.scrapedContent.text.length} characters`);
      console.log(`🔤 Word count: ${result.data.scrapedContent.metadata.wordCount}`);
      console.log(`📦 Products found: ${result.data.scrapedContent.metadata.productsFound}`);
      console.log(`🏷️ Categories: ${result.data.scrapedContent.metadata.categories.length}`);

      if (extracted.products.length > 0) {
        console.log('\n📦 PRODUCTS FOUND:');
        extracted.products.slice(0, 10).forEach((product, index) => {
          console.log(`   ${index + 1}. ${product.name}`);
        });
        if (extracted.products.length > 10) {
          console.log(`   ... and ${extracted.products.length - 10} more products`);
        }
      }

      if (extracted.metadata.categories && extracted.metadata.categories.length > 0) {
        console.log('\n🏷️ CATEGORIES FOUND:');
        extracted.metadata.categories.forEach((category, index) => {
          console.log(`   ${index + 1}. ${category}`);
        });
      }

      console.log('\n📖 EXTRACTED CONTENT PREVIEW:');
      console.log(result.data.scrapedContent.text.substring(0, 500) + '...');

      // Success validation
      const hasContent = result.data.scrapedContent.text.length > 200;
      const hasProducts = extracted.products.length > 0;
      const hasCategories = extracted.metadata.categories && extracted.metadata.categories.length > 0;

      const isSuccessful = hasContent && (hasProducts || hasCategories);

      console.log(`\n🏆 RESULT: ${isSuccessful ? 'SUCCESS ✅' : 'PARTIAL ⚠️'}`);
      
      if (isSuccessful) {
        console.log('✅ Homepage data successfully extracted');
        console.log('✅ Can extract both individual products and categories');
        console.log('✅ Ready for e-commerce catalog integration');
      } else {
        console.log(`⚠️ Status: hasContent=${hasContent}, hasProducts=${hasProducts}, hasCategories=${hasCategories}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Homepage extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Run the test
async function runHomepageTest() {
  const tester = new TestHomepage();
  await tester.scrapeHomepage();
}

runHomepageTest();