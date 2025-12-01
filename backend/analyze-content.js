// Analyser le contenu HTML réel pour comprendre la structure Next.js
const axios = require('axios');

async function analyzeContent() {
  console.log('🔍 Analyzing E-Market 237 content structure...\n');

  try {
    const response = await axios.get('https://emarket237.com/products/kit-de-survie-auto-35-en-1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 30000,
    });

    const html = response.data;
    console.log(`📄 Total HTML length: ${html.length} characters\n`);

    // 1. Look for Next.js patterns
    console.log('1. 🔍 Searching for Next.js patterns:');
    
    const nextPatterns = [
      '__next',
      '__NEXT_DATA__', 
      'self.__next_f',
      '_app',
      '_document'
    ];

    nextPatterns.forEach(pattern => {
      const count = (html.match(new RegExp(pattern, 'g')) || []).length;
      if (count > 0) {
        console.log(`   ✓ "${pattern}": ${count} occurrences`);
      }
    });

    // 2. Look for product data patterns
    console.log('\n2. 🛍️ Searching for product data patterns:');
    
    const productPatterns = [
      'KIT DE SURVIE',
      'kit-de-survie-auto-35-en-1',
      '"name"',
      '"price"',
      '"basePrice"',
      '"salePrice"', 
      '"sku"',
      '"description"',
      'XAF'
    ];

    productPatterns.forEach(pattern => {
      const regex = new RegExp(pattern, 'gi');
      const matches = html.match(regex) || [];
      if (matches.length > 0) {
        console.log(`   ✓ "${pattern}": ${matches.length} occurrences`);
        if (pattern === '"name"' && matches.length < 10) {
          // Show context for name matches
          const nameRegex = /"name":"([^"]+)"/gi;
          let match;
          while ((match = nameRegex.exec(html)) !== null) {
            console.log(`     → Name found: "${match[1]}"`);
          }
        }
      }
    });

    // 3. Analyze script tags
    console.log('\n3. 📜 Analyzing script tags:');
    const scriptMatches = html.match(/<script[^>]*>.*?<\/script>/gs) || [];
    console.log(`   Found ${scriptMatches.length} script tags`);

    let productScripts = 0;
    scriptMatches.forEach((script, index) => {
      if (script.includes('product') || script.includes('KIT') || script.includes('name')) {
        productScripts++;
        console.log(`   📜 Script ${index + 1}: Contains product data (${script.length} chars)`);
        
        // Show a sample of the content
        const sample = script.substring(0, 200).replace(/\s+/g, ' ');
        console.log(`     Sample: ${sample}...`);
      }
    });
    
    console.log(`   Total scripts with product data: ${productScripts}`);

    // 4. Look for self.__next_f.push patterns specifically
    console.log('\n4. 🎯 Analyzing self.__next_f patterns:');
    
    const nextFPattern = /self\.__next_f\.push\(\[[^\]]+\]\)/g;
    const nextFMatches = html.match(nextFPattern) || [];
    console.log(`   Found ${nextFMatches.length} self.__next_f.push calls`);

    // Analyze each push call
    nextFMatches.forEach((match, index) => {
      console.log(`\n   Push call ${index + 1}:`);
      console.log(`     Length: ${match.length} characters`);
      
      // Check if it contains product data
      const hasProductData = match.includes('KIT') || 
                            match.includes('name') || 
                            match.includes('price') ||
                            match.includes('description');
      
      if (hasProductData) {
        console.log(`     ✅ Contains product data!`);
        console.log(`     Sample: ${match.substring(0, 300)}...`);
        
        // Try to extract specific data
        const nameMatch = match.match(/"name":"([^"]+)"/);
        const priceMatch = match.match(/"(?:price|basePrice|salePrice)":"?([0-9.]+)"?/);
        const skuMatch = match.match(/"sku":"([^"]+)"/);
        
        if (nameMatch) console.log(`     🏷️ Name: ${nameMatch[1]}`);
        if (priceMatch) console.log(`     💰 Price: ${priceMatch[1]}`);
        if (skuMatch) console.log(`     🆔 SKU: ${skuMatch[1]}`);
      } else {
        console.log(`     ⚪ No product data`);
      }
    });

    // 5. Try different extraction patterns
    console.log('\n5. 🧪 Testing extraction patterns:');
    
    // Pattern 1: Look for JSON objects with "product" and "name"
    const jsonPattern1 = /\{[^{}]*"name"[^{}]*"KIT[^{}]*\}/gi;
    const jsonMatches1 = html.match(jsonPattern1) || [];
    console.log(`   Pattern 1 (JSON with name+KIT): ${jsonMatches1.length} matches`);
    
    // Pattern 2: Look for escaped JSON in strings
    const jsonPattern2 = /\\?"name\\?":"[^"]*KIT[^"]*"/gi;
    const jsonMatches2 = html.match(jsonPattern2) || [];
    console.log(`   Pattern 2 (Escaped JSON): ${jsonMatches2.length} matches`);
    
    // Pattern 3: Look for any mention of the product
    const productPattern = /KIT\s+DE\s+SURVIE\s+AUTO\s+35\s+EN\s+1/gi;
    const productMatches = html.match(productPattern) || [];
    console.log(`   Pattern 3 (Full product name): ${productMatches.length} matches`);

    if (jsonMatches1.length > 0) {
      console.log(`   ✅ Best match: ${jsonMatches1[0]}`);
    } else if (jsonMatches2.length > 0) {
      console.log(`   ✅ Best match: ${jsonMatches2[0]}`);
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  }
}

analyzeContent();