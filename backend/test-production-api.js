// Test de l'API de production avec les améliorations Next.js
const axios = require('axios');

async function testProductionAPI() {
  console.log('🚀 Testing Production API - Enhanced Next.js Extraction\n');
  console.log('='*60 + '\n');

  const API_BASE = 'https://api.wazeapp.ai/api/v1';
  
  // Test URLs
  const testUrls = [
    'https://emarket237.com/',
    'https://emarket237.com/products/kit-de-survie-auto-35-en-1'
  ];

  for (const url of testUrls) {
    console.log(`\n📍 Testing URL: ${url}`);
    console.log('-'.repeat(60));

    try {
      console.log('📡 Making API request to scrape-url endpoint...');
      
      const startTime = Date.now();
      const response = await axios.post(`${API_BASE}/documents/scrape-url`, {
        url: url
      }, {
        timeout: 120000, // 2 minutes timeout
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏱️ Request completed in ${elapsed} seconds\n`);

      if (response.data.success) {
        const { scrapedContent, aiSynthesis } = response.data.data;
        
        console.log('📊 EXTRACTION RESULTS:');
        console.log(`   ✅ Status: Success`);
        console.log(`   📝 Text length: ${scrapedContent.text.length} characters`);
        console.log(`   🔤 Word count: ${scrapedContent.metadata?.wordCount || 0}`);
        console.log(`   🖼️ Images: ${scrapedContent.images.length}`);
        console.log(`   🔗 Links: ${scrapedContent.links.length}`);
        console.log(`   📋 Title: ${scrapedContent.metadata?.title || 'N/A'}`);
        
        if (scrapedContent.metadata) {
          console.log(`   🏷️ Keywords: ${(scrapedContent.metadata.keywords || []).slice(0, 3).join(', ')}`);
          console.log(`   🔧 Extraction method: ${scrapedContent.metadata.extractionMethod || 'standard'}`);
          console.log(`   ⚛️ Site type: ${scrapedContent.metadata.site || 'unknown'}`);
        }

        // Quality analysis
        const hasRealContent = scrapedContent.text.length > 500;
        const hasLoadingText = scrapedContent.text.includes('Initialisation') || 
                              scrapedContent.text.includes('Chargement');
        const hasProductData = scrapedContent.text.includes('Prix') || 
                              scrapedContent.text.includes('KIT') ||
                              scrapedContent.text.includes('product');

        console.log('\n🎯 QUALITY ANALYSIS:');
        if (hasRealContent && !hasLoadingText && hasProductData) {
          console.log('   ✅ EXCELLENT - Rich content with product data');
        } else if (hasRealContent && !hasLoadingText) {
          console.log('   ✅ GOOD - Rich content extracted');
        } else if (hasRealContent && hasLoadingText) {
          console.log('   ⚠️ PARTIAL - Content with loading text');
        } else {
          console.log('   ❌ POOR - Minimal or loading content only');
        }

        console.log(`   📈 Metrics:`);
        console.log(`      • Real content: ${hasRealContent ? 'Yes' : 'No'}`);
        console.log(`      • Loading text: ${hasLoadingText ? 'Yes' : 'No'}`);
        console.log(`      • Product data: ${hasProductData ? 'Yes' : 'No'}`);

        // Content preview
        console.log('\n📖 CONTENT PREVIEW:');
        const preview = scrapedContent.text.substring(0, 400);
        console.log(preview + (scrapedContent.text.length > 400 ? '...' : ''));

        // AI Synthesis preview
        if (aiSynthesis) {
          console.log('\n🤖 AI SYNTHESIS PREVIEW:');
          const synthPreview = aiSynthesis.substring(0, 200);
          console.log(synthPreview + (aiSynthesis.length > 200 ? '...' : ''));
        }

      } else {
        console.log(`❌ API Error: ${response.data.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error(`❌ Request failed:`, error.message);
      
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error: ${error.response.data?.error || 'No error details'}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Production API test completed');
  
  console.log('\n📊 TEST SUMMARY:');
  console.log('✅ If you see rich content without "Initialisation", the upgrade worked!');
  console.log('⚠️ If you still see "Initialisation", the old service is still cached');
  console.log('❌ If you see errors, check the deployment logs');
}

testProductionAPI().catch(console.error);