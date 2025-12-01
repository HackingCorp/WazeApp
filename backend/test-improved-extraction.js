// Test de l'extraction améliorée pour E-Market 237
const axios = require('axios');

async function testImprovedExtraction() {
  console.log('🧪 Testing improved extraction for E-Market 237\n');
  console.log('='*60 + '\n');

  const testUrls = [
    'https://emarket237.com/',
    'https://emarket237.com/products/kit-de-survie-auto-35-en-1'
  ];

  for (const url of testUrls) {
    console.log(`\n📍 Testing URL: ${url}`);
    console.log('-'.repeat(60));

    try {
      // Simuler l'appel API au service de scraping
      console.log('📡 Fetching content...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 30000,
      });

      const html = response.data;
      console.log(`✅ Received ${html.length} characters`);

      // Analyser le contenu pour voir ce qui est présent
      const indicators = {
        'Next.js': html.includes('__next'),
        'React': html.includes('React'),
        'Loading text': html.includes('Initialisation') || html.includes('Chargement'),
        'Product data': html.includes('"product"') || html.includes('\\"product\\"'),
        'Price data': html.includes('price') || html.includes('Prix'),
        'SKU data': html.includes('sku') || html.includes('SKU'),
        'Category': html.includes('category') || html.includes('Catégorie'),
        'Images': html.includes('<img') || html.includes('image'),
        'Scripts': (html.match(/<script/g) || []).length,
        'Self.__next_f': html.includes('self.__next_f')
      };

      console.log('\n📊 Content Analysis:');
      Object.entries(indicators).forEach(([key, value]) => {
        const icon = value ? '✅' : '❌';
        const display = typeof value === 'number' ? value : (value ? 'Yes' : 'No');
        console.log(`   ${icon} ${key}: ${display}`);
      });

      // Chercher des données spécifiques
      console.log('\n🔍 Searching for specific data patterns:');

      // Pattern pour E-Market 237
      const patterns = [
        {
          name: 'Product (escaped)',
          pattern: /\\"product\\":\{\\"id\\":(\d+),\\"name\\":\\"([^"]+)\\"/,
        },
        {
          name: 'Product (normal)',
          pattern: /"product":\{"id":(\d+),"name":"([^"]+)"/,
        },
        {
          name: 'Title tag',
          pattern: /<title>([^<]+)<\/title>/,
        },
        {
          name: 'Meta description',
          pattern: /<meta name="description" content="([^"]+)"/,
        },
        {
          name: 'Price pattern',
          pattern: /(?:price|Prix)[:\s]*(\d+)/i,
        }
      ];

      patterns.forEach(({ name, pattern }) => {
        const match = html.match(pattern);
        if (match) {
          console.log(`   ✅ ${name}: Found`);
          if (match[1]) {
            const preview = match[1].substring(0, 50);
            console.log(`      → ${preview}${match[1].length > 50 ? '...' : ''}`);
          }
        } else {
          console.log(`   ❌ ${name}: Not found`);
        }
      });

      // Résumé
      const hasContent = !html.includes('Initialisation') || html.length > 5000;
      const hasProductData = html.includes('product') || html.includes('KIT');
      
      console.log('\n📈 Extraction Quality:');
      if (hasContent && hasProductData) {
        console.log('   ✅ GOOD - Content loaded with product data');
      } else if (hasContent) {
        console.log('   ⚠️ PARTIAL - Content loaded but no product data');
      } else {
        console.log('   ❌ POOR - Only loading screen captured');
      }

    } catch (error) {
      console.error(`❌ Error testing ${url}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Test completed\n');
  console.log('💡 Recommendations:');
  console.log('• If seeing "Initialisation", need longer wait times');
  console.log('• If no product data, check JavaScript extraction patterns');
  console.log('• Consider using Puppeteer for full rendering');
}

testImprovedExtraction();