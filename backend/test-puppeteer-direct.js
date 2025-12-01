// Test direct avec Puppeteer pour E-Market 237
const puppeteer = require('puppeteer');

async function testPuppeteerDirect() {
  console.log('🚀 Testing E-Market 237 with Puppeteer\n');
  console.log('='.repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const testUrls = [
      'https://emarket237.com/products/kit-de-survie-auto-35-en-1',
      'https://emarket237.com/'
    ];

    for (const url of testUrls) {
      console.log(`\n📍 Testing: ${url}`);
      console.log('-'.repeat(60));

      const page = await browser.newPage();
      
      try {
        console.log('🌐 Navigating to page...');
        await page.goto(url, { 
          waitUntil: 'networkidle0', 
          timeout: 60000 
        });

        console.log('⏳ Waiting for Next.js content to load...');
        
        // Strategy 1: Wait for content to appear
        const contentLoaded = await page.waitForFunction(
          () => {
            const text = document.body.textContent || '';
            const hasContent = text.length > 1000;
            const notLoading = !text.includes('Initialisation') && 
                              !text.includes('Chargement de l\'application');
            return hasContent && notLoading;
          },
          { timeout: 45000 }
        ).then(() => true).catch(() => false);

        if (!contentLoaded) {
          console.log('⚠️ Content wait timed out, trying scroll strategy...');
          
          // Scroll to trigger lazy loading
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
          });
          await new Promise(r => setTimeout(r, 3000));
          
          await page.evaluate(() => {
            window.scrollTo(0, 0);
          });
          await new Promise(r => setTimeout(r, 3000));
        }

        // Additional wait for dynamic content
        console.log('⏱️ Additional wait for dynamic content...');
        await new Promise(r => setTimeout(r, 10000));

        // Extract content with enhanced Next.js extraction
        const extractedData = await page.evaluate(() => {
          let text = '';
          let productData = {};

          // Extract from Next.js scripts
          const scripts = document.querySelectorAll('script');
          scripts.forEach(script => {
            const content = script.textContent || script.innerHTML;
            if (!content) return;

            // Pattern for E-Market 237 (with escaped quotes)
            const productPattern = /\\"product\\":\{\\"id\\":(\d+),\\"name\\":\\"([^"]+)\\",\\"slug\\":\\"([^"]+)\\",\\"description\\":\\"([^"]*)/;
            const match = content.match(productPattern);

            if (match) {
              const [, id, name, slug, description] = match;
              productData.id = id;
              productData.name = name;
              productData.slug = slug;
              
              // Clean description
              productData.description = description
                .replace(/\\u003c[^>]*\\u003e/g, '')
                .replace(/<[^>]*>/g, '')
                .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => 
                  String.fromCharCode(parseInt(code, 16))
                );

              text += name + '. ' + productData.description + ' ';

              // Look for additional data
              const contextStart = content.indexOf(match[0]);
              const context = content.substring(contextStart, contextStart + 2000);

              const priceMatch = context.match(/\\"(?:salePrice|basePrice)\\":(\d+)/);
              const currencyMatch = context.match(/\\"currency\\":\\"([^"]+)\\"/);
              const skuMatch = context.match(/\\"sku\\":\\"([^"]+)\\"/);
              const categoryMatch = context.match(/\\"category\\":\{[^}]*\\"name\\":\\"([^"]+)\\"/);

              if (priceMatch) {
                productData.price = priceMatch[1];
                text += `Prix: ${priceMatch[1]} `;
              }
              if (currencyMatch) {
                productData.currency = currencyMatch[1];
                text += currencyMatch[1] + ' ';
              }
              if (skuMatch) {
                productData.sku = skuMatch[1];
                text += `SKU: ${skuMatch[1]} `;
              }
              if (categoryMatch) {
                productData.category = categoryMatch[1];
                text += `Catégorie: ${categoryMatch[1]} `;
              }
            }
          });

          // Fallback to regular text extraction
          if (!text) {
            text = document.body.textContent || '';
          }

          return {
            title: document.title,
            text: text.trim(),
            bodyText: document.body.textContent?.substring(0, 500) || '',
            productData,
            scriptCount: scripts.length,
            hasNextJS: document.body.innerHTML.includes('__next'),
            hasProduct: document.body.innerHTML.includes('product')
          };
        });

        console.log('\n📊 EXTRACTION RESULTS:');
        console.log(`   📋 Title: ${extractedData.title}`);
        console.log(`   📝 Extracted text: ${extractedData.text.length} characters`);
        console.log(`   📜 Scripts: ${extractedData.scriptCount}`);
        console.log(`   ⚛️ Next.js: ${extractedData.hasNextJS ? 'Yes' : 'No'}`);
        console.log(`   📦 Has product: ${extractedData.hasProduct ? 'Yes' : 'No'}`);

        if (Object.keys(extractedData.productData).length > 0) {
          console.log('\n🛍️ PRODUCT DATA:');
          Object.entries(extractedData.productData).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > 100) {
              console.log(`   ${key}: ${value.substring(0, 100)}...`);
            } else {
              console.log(`   ${key}: ${value}`);
            }
          });
        }

        console.log('\n📖 CONTENT PREVIEW:');
        const preview = extractedData.text || extractedData.bodyText;
        console.log(preview.substring(0, 500) + (preview.length > 500 ? '...' : ''));

        // Quality check
        const hasRealContent = extractedData.text.length > 200 && 
                              !extractedData.text.includes('Initialisation');
        const hasProductInfo = Object.keys(extractedData.productData).length > 0 ||
                              extractedData.text.includes('Prix') ||
                              extractedData.text.includes('KIT');

        console.log('\n🎯 QUALITY:');
        if (hasRealContent && hasProductInfo) {
          console.log('   ✅ EXCELLENT - Full content with product data');
        } else if (hasRealContent) {
          console.log('   ⚠️ GOOD - Content loaded but limited product data');
        } else if (hasProductInfo) {
          console.log('   ⚠️ PARTIAL - Product data but limited content');
        } else {
          console.log('   ❌ POOR - Loading screen or minimal content');
        }

      } catch (error) {
        console.error(`❌ Error scraping page:`, error.message);
      } finally {
        await page.close();
      }
    }

  } finally {
    await browser.close();
    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed');
  }
}

testPuppeteerDirect().catch(console.error);