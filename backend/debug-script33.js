// Debug script 33 pour comprendre la structure exacte
const axios = require('axios');
const cheerio = require('cheerio');

async function debugScript33() {
  try {
    const response = await axios.get('https://emarket237.com/products/kit-de-survie-auto-35-en-1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 30000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    console.log('🔍 Analyzing Script 33 (the one with product data)...\n');

    // Find all scripts
    const scripts = [];
    $('script').each((i, script) => {
      const content = $(script).html();
      if (content && (content.includes('KIT') || content.includes('product'))) {
        scripts.push({ index: i + 1, content });
      }
    });

    console.log(`Found ${scripts.length} scripts with product data\n`);

    // Analyze each script
    scripts.forEach(({ index, content }) => {
      console.log(`📜 SCRIPT ${index}:`);
      console.log(`Length: ${content.length} characters`);
      
      if (content.includes('KIT DE SURVIE')) {
        console.log('✅ Contains "KIT DE SURVIE"');
        
        // Show the relevant part
        const kitIndex = content.indexOf('KIT DE SURVIE');
        const start = Math.max(0, kitIndex - 100);
        const end = Math.min(content.length, kitIndex + 500);
        const snippet = content.substring(start, end);
        
        console.log('📖 RELEVANT SNIPPET:');
        console.log(snippet);
        console.log('\n' + '─'.repeat(80) + '\n');
        
        // Try to find the exact pattern
        console.log('🎯 PATTERN ANALYSIS:');
        
        // Look for the product object structure
        const productObjectPattern = /"product":\{[^}]+\}/;
        const productMatch = content.match(productObjectPattern);
        
        if (productMatch) {
          console.log('✅ Found product object pattern!');
          console.log('Raw match:', productMatch[0].substring(0, 200) + '...');
        } else {
          console.log('❌ Product object pattern not found');
          
          // Try simpler patterns
          const namePattern = /"name":"([^"]*KIT[^"]*)"/;
          const nameMatch = content.match(namePattern);
          
          if (nameMatch) {
            console.log(`✅ Found name: ${nameMatch[1]}`);
            
            // Find the context around the name
            const nameIndex = content.indexOf(nameMatch[0]);
            const contextStart = Math.max(0, nameIndex - 200);
            const contextEnd = Math.min(content.length, nameIndex + 800);
            const context = content.substring(contextStart, contextEnd);
            
            console.log('📖 CONTEXT AROUND NAME:');
            console.log(context);
          }
          
          // Try to find prices
          const pricePattern = /"(?:price|basePrice|salePrice)":\s*(\d+)/g;
          let priceMatch;
          console.log('💰 PRICES FOUND:');
          while ((priceMatch = pricePattern.exec(content)) !== null) {
            console.log(`   Price: ${priceMatch[1]}`);
          }
          
          // Try to find SKU
          const skuPattern = /"sku":"([^"]+)"/;
          const skuMatch = content.match(skuPattern);
          if (skuMatch) {
            console.log(`🏷️ SKU: ${skuMatch[1]}`);
          }
        }
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugScript33();