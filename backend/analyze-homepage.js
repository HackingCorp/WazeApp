// Analyser en profondeur la homepage E-Market 237
const axios = require('axios');

async function analyzeHomepage() {
  console.log('🔍 Deep analysis of E-Market 237 homepage...\n');

  try {
    const response = await axios.get('https://emarket237.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 30000,
    });

    const html = response.data;
    console.log(`📄 Total HTML length: ${html.length} characters\n`);

    // 1. Next.js patterns analysis
    console.log('1. 🔍 Next.js patterns:');
    const nextPatterns = [
      '__next',
      '__NEXT_DATA__',
      'self.__next_f',
      '_app',
      '_document',
      'buildManifest',
      'Initialisation',
      'Chargement'
    ];

    nextPatterns.forEach(pattern => {
      const count = (html.match(new RegExp(pattern, 'g')) || []).length;
      if (count > 0) {
        console.log(`   ✓ "${pattern}": ${count} occurrences`);
      }
    });

    // 2. Look for product-related data
    console.log('\n2. 🛍️ Product data search:');
    const productPatterns = [
      'product',
      'products',
      'item',
      'items',
      'catalog',
      'catalogue',
      'category',
      'categories',
      'marketplace',
      'shop'
    ];

    productPatterns.forEach(pattern => {
      const regex = new RegExp(`"${pattern}"`, 'gi');
      const matches = html.match(regex) || [];
      if (matches.length > 0) {
        console.log(`   ✓ "${pattern}": ${matches.length} occurrences`);
      }
    });

    // 3. Check for API endpoints or data URLs
    console.log('\n3. 🔗 API endpoints and URLs:');
    const apiPatterns = [
      /api\.emarket237\.com/g,
      /\/api\/[^\s"']*/g,
      /\/products[^\s"']*/g,
      /\/categories[^\s"']*/g,
      /\.json[^\s"']*/g
    ];

    apiPatterns.forEach((pattern, index) => {
      const matches = html.match(pattern) || [];
      if (matches.length > 0) {
        console.log(`   ✓ Pattern ${index + 1}: ${matches.length} matches`);
        matches.slice(0, 5).forEach(match => {
          console.log(`     → ${match}`);
        });
      }
    });

    // 4. Analyze script tags
    console.log('\n4. 📜 Script analysis:');
    const scriptMatches = html.match(/<script[^>]*>.*?<\/script>/gs) || [];
    console.log(`   Found ${scriptMatches.length} script tags`);

    let dataScripts = 0;
    scriptMatches.forEach((script, index) => {
      const hasData = script.includes('data') || 
                      script.includes('product') || 
                      script.includes('category') ||
                      script.includes('api') ||
                      script.includes('fetch') ||
                      script.includes('axios');
      
      if (hasData) {
        dataScripts++;
        console.log(`   📜 Script ${index + 1}: Contains data/API calls (${script.length} chars)`);
        
        // Show sample if small enough
        if (script.length < 500) {
          const sample = script.substring(0, 300).replace(/\s+/g, ' ');
          console.log(`     Sample: ${sample}...`);
        }
      }
    });
    
    console.log(`   Total data scripts: ${dataScripts}`);

    // 5. Look for self.__next_f patterns specifically
    console.log('\n5. 🎯 Next.js data chunks:');
    const nextFPattern = /self\.__next_f\.push\(\[[^\]]+\]\)/g;
    const nextFMatches = html.match(nextFPattern) || [];
    console.log(`   Found ${nextFMatches.length} self.__next_f.push calls`);

    nextFMatches.forEach((match, index) => {
      console.log(`\n   Chunk ${index + 1}:`);
      console.log(`     Length: ${match.length} characters`);
      
      const hasRelevantData = match.includes('product') || 
                             match.includes('category') ||
                             match.includes('item') ||
                             match.includes('data') ||
                             match.includes('api');
      
      if (hasRelevantData) {
        console.log(`     ✅ Contains relevant data!`);
        console.log(`     Sample: ${match.substring(0, 200)}...`);
      } else {
        console.log(`     ⚪ No relevant data`);
      }
    });

    // 6. Check for dynamic loading patterns
    console.log('\n6. 🔄 Dynamic loading patterns:');
    const loadingPatterns = [
      'loading',
      'Loading',
      'Chargement',
      'Initialisation',
      'fetch(',
      'axios(',
      'useEffect',
      'useState',
      'componentDidMount'
    ];

    loadingPatterns.forEach(pattern => {
      const count = (html.match(new RegExp(pattern, 'g')) || []).length;
      if (count > 0) {
        console.log(`   ✓ "${pattern}": ${count} occurrences`);
      }
    });

    // 7. Try to find any hidden JSON data
    console.log('\n7. 🔍 Hidden JSON data:');
    const jsonPattern = /\{[^{}]*"[^"]*":\s*["'\[{][^}]*\}/g;
    const jsonMatches = html.match(jsonPattern) || [];
    console.log(`   Found ${jsonMatches.length} JSON-like objects`);

    let relevantJson = 0;
    jsonMatches.forEach((match, index) => {
      if (match.includes('product') || match.includes('category') || match.includes('name') || match.includes('title')) {
        relevantJson++;
        if (relevantJson <= 3) { // Show first 3
          console.log(`   📋 JSON ${index + 1}: ${match.substring(0, 100)}...`);
        }
      }
    });
    
    console.log(`   Relevant JSON objects: ${relevantJson}`);

    // 8. Summary and recommendations
    console.log('\n8. 📋 ANALYSIS SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const isFullNextJS = nextFMatches.length > 0 && html.includes('Initialisation');
    const hasAPIReferences = html.includes('api.emarket237.com') || html.includes('/api/');
    const isDynamicallyLoaded = html.includes('Loading') || html.includes('Chargement');
    
    console.log(`🔍 Next.js with SSR/CSR: ${isFullNextJS ? 'YES' : 'NO'}`);
    console.log(`🔗 API references found: ${hasAPIReferences ? 'YES' : 'NO'}`);
    console.log(`🔄 Dynamic content loading: ${isDynamicallyLoaded ? 'YES' : 'NO'}`);
    
    console.log('\n💡 RECOMMENDATIONS:');
    if (isFullNextJS && isDynamicallyLoaded) {
      console.log('✅ This is a fully client-side rendered Next.js app');
      console.log('✅ Need to either:');
      console.log('   1. Use Puppeteer to wait for content to load');
      console.log('   2. Find the API endpoints and call them directly');
      console.log('   3. Wait for hydration and re-scrape');
    }
    
    if (hasAPIReferences) {
      console.log('✅ API endpoints detected - could make direct API calls');
    }
    
    if (html.includes('Initialisation')) {
      console.log('✅ Page shows loading state - content loads dynamically');
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

analyzeHomepage();