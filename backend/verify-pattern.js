// Vérifier le pattern exact dans le contenu
const axios = require('axios');

async function verifyPattern() {
  try {
    const response = await axios.get('https://emarket237.com/products/kit-de-survie-auto-35-en-1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 30000,
    });

    const html = response.data;
    console.log('🔍 Searching for exact pattern...\n');

    // Find the exact location of "KIT DE SURVIE AUTO 35 EN 1"
    const kitIndex = html.indexOf('KIT DE SURVIE AUTO 35 EN 1');
    if (kitIndex === -1) {
      console.log('❌ Product name not found');
      return;
    }
    
    console.log(`✅ Found "KIT DE SURVIE AUTO 35 EN 1" at position ${kitIndex}`);
    
    // Extract a large context around it
    const start = Math.max(0, kitIndex - 200);
    const end = Math.min(html.length, kitIndex + 1000);
    const context = html.substring(start, end);
    
    console.log('📖 CONTEXT:');
    console.log(context);
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Look for quotes and structure
    const beforeKit = html.substring(kitIndex - 100, kitIndex);
    const afterKit = html.substring(kitIndex, kitIndex + 500);
    
    console.log('📍 BEFORE KIT:');
    console.log(beforeKit);
    console.log('\n📍 AFTER KIT:');
    console.log(afterKit);
    
    // Try to find the exact JSON structure
    console.log('\n🔍 SEARCHING FOR JSON STRUCTURE...');
    
    // Look for different quote patterns
    const patterns = [
      /{"product":{"id":\d+,"name":"KIT DE SURVIE AUTO 35 EN 1"/,
      /\\"product\\":{\\"id\\":\d+,\\"name\\":\\"KIT DE SURVIE AUTO 35 EN 1/,
      /\"product\":\{\"id\":\d+,\"name\":\"KIT DE SURVIE AUTO 35 EN 1/,
      /product.*?KIT DE SURVIE AUTO 35 EN 1/i
    ];
    
    patterns.forEach((pattern, index) => {
      const match = html.match(pattern);
      if (match) {
        console.log(`✅ Pattern ${index + 1} MATCHES!`);
        console.log(`Match: ${match[0]}`);
        console.log(`Full context: ${html.substring(match.index - 50, match.index + 200)}`);
      } else {
        console.log(`❌ Pattern ${index + 1} no match`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyPattern();