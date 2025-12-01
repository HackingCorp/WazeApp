// Test du vrai service de scraping avec les améliorations
require('dotenv').config();

async function testRealScrapingService() {
  console.log('🚀 Testing Real Web Scraping Service\n');
  console.log('='*60 + '\n');

  try {
    // Importer le module NestJS compilé
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/app.module');
    
    console.log('📦 Starting NestJS application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Obtenir le service de web scraping
    const WebScrapingService = app.get(require('./dist/modules/knowledge-base/web-scraping.service').WebScrapingService);
    
    console.log('✅ Service initialized\n');

    // URLs de test
    const testUrls = [
      'https://emarket237.com/products/kit-de-survie-auto-35-en-1',
      'https://emarket237.com/'
    ];

    for (const url of testUrls) {
      console.log(`\n📍 Testing: ${url}`);
      console.log('-'.repeat(60));
      
      try {
        console.log('🌐 Scraping with Puppeteer (this may take 30-45 seconds)...');
        
        const startTime = Date.now();
        const result = await WebScrapingService.scrapeUrl(url, {
          includeImages: true,
          includeLinks: true,
          includeVideos: true,
          waitTime: 15000, // 15 seconds additional wait
          removeSelectors: ['.cookie-banner', '.popup', '.modal']
        });
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏱️ Scraping completed in ${elapsed} seconds\n`);

        if (result.success) {
          const { scrapedContent } = result.data;
          
          console.log('📊 RESULTS:');
          console.log(`   ✅ Success: Yes`);
          console.log(`   📝 Text length: ${scrapedContent.text.length} characters`);
          console.log(`   🔤 Word count: ${scrapedContent.metadata?.wordCount || 0}`);
          console.log(`   🖼️ Images: ${scrapedContent.images.length}`);
          console.log(`   🔗 Links: ${scrapedContent.links.length}`);
          console.log(`   🎥 Videos: ${scrapedContent.videos.length}`);
          
          if (scrapedContent.metadata) {
            console.log('\n📋 METADATA:');
            console.log(`   Title: ${scrapedContent.metadata.title}`);
            console.log(`   Description: ${scrapedContent.metadata.description?.substring(0, 100)}...`);
            console.log(`   Keywords: ${scrapedContent.metadata.keywords?.slice(0, 5).join(', ')}`);
          }
          
          console.log('\n📖 CONTENT PREVIEW:');
          const preview = scrapedContent.text.substring(0, 500);
          console.log(preview + (scrapedContent.text.length > 500 ? '...' : ''));
          
          // Vérifier la qualité
          const hasProductData = scrapedContent.text.includes('KIT') || 
                                scrapedContent.text.includes('Prix') ||
                                scrapedContent.text.includes('SKU');
          const hasLoadingText = scrapedContent.text.includes('Initialisation') ||
                                scrapedContent.text.includes('Chargement');
          
          console.log('\n🎯 QUALITY CHECK:');
          if (hasProductData && !hasLoadingText) {
            console.log('   ✅ EXCELLENT - Full product data extracted');
          } else if (hasProductData && hasLoadingText) {
            console.log('   ⚠️ GOOD - Product data with some loading text');
          } else if (!hasLoadingText) {
            console.log('   ⚠️ PARTIAL - Content without product specifics');
          } else {
            console.log('   ❌ POOR - Only loading screen captured');
          }
          
          // AI Synthesis
          if (result.data.aiSynthesis) {
            console.log('\n🤖 AI SYNTHESIS:');
            console.log(result.data.aiSynthesis.substring(0, 300) + '...');
          }
          
        } else {
          console.log(`❌ Scraping failed: ${result.error || 'Unknown error'}`);
        }
        
      } catch (error) {
        console.error(`❌ Error scraping ${url}:`, error.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed');
    
    // Fermer l'application
    await app.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to initialize service:', error.message);
    console.log('\n💡 Make sure the application is built: npm run build');
    process.exit(1);
  }
}

// Fonction alternative si le service NestJS ne peut pas être chargé
async function testWithDirectPuppeteer() {
  console.log('🔧 Alternative: Testing with direct Puppeteer\n');
  
  const puppeteer = require('puppeteer');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    const url = 'https://emarket237.com/products/kit-de-survie-auto-35-en-1';
    console.log(`📍 Testing: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Wait for Next.js to hydrate
    console.log('⏳ Waiting for Next.js hydration...');
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        return !text.includes('Initialisation') && 
               !text.includes('Chargement') && 
               text.length > 1000;
      },
      { timeout: 30000 }
    ).catch(() => console.log('Timeout waiting for content'));
    
    // Extract content
    const content = await page.evaluate(() => {
      return {
        title: document.title,
        text: document.body.textContent || '',
        hasProducts: document.body.innerHTML.includes('product'),
        scriptCount: document.querySelectorAll('script').length
      };
    });
    
    console.log('\n📊 RESULTS:');
    console.log(`   Title: ${content.title}`);
    console.log(`   Text length: ${content.text.length} characters`);
    console.log(`   Has products: ${content.hasProducts}`);
    console.log(`   Scripts: ${content.scriptCount}`);
    
    console.log('\n📖 PREVIEW:');
    console.log(content.text.substring(0, 500) + '...');
    
  } finally {
    await browser.close();
  }
}

// Décider quelle fonction utiliser
testRealScrapingService().catch(err => {
  console.error('\n⚠️ NestJS service test failed, trying direct Puppeteer...\n');
  testWithDirectPuppeteer().catch(console.error);
});