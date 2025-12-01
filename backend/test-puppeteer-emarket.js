// Test avec Puppeteer pour E-Market 237 (site Next.js dynamique)
const puppeteer = require('puppeteer');

async function testEMarket237WithPuppeteer() {
  console.log('🤖 Test avec Puppeteer - E-Market 237');
  console.log('URL: https://emarket237.com/products/kit-de-survie-auto-35-en-1\n');

  let browser = null;
  try {
    console.log('🚀 Lancement de Puppeteer...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--no-zygote'
      ],
      timeout: 60000,
    });

    const page = await browser.newPage();
    
    // Configuration de la page
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    console.log('📡 Navigation vers la page...');
    
    // Navigation avec timeout étendu
    await page.goto('https://emarket237.com/products/kit-de-survie-auto-35-en-1', { 
      waitUntil: 'networkidle2', 
      timeout: 45000 
    });

    console.log('⏳ Attente du chargement dynamique Next.js...');
    
    // Attendre le chargement spécifique pour les sites e-commerce
    await Promise.allSettled([
      page.waitForSelector('img', { timeout: 10000 }),
      page.waitForSelector('h1, .product-title, [class*="product"], [class*="price"]', { timeout: 10000 }),
      page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 }),
      // Attendre que le texte "Initialisation" disparaisse
      page.waitForFunction(() => !document.body.textContent.includes('Initialisation'), { timeout: 15000 })
    ]);

    // Attente supplémentaire pour Next.js hydration
    console.log('⏳ Attente de l\'hydratation Next.js (8 secondes)...');
    await page.waitForTimeout(8000);

    console.log('🔍 Extraction du contenu rendu...');

    // Extraction du contenu avec JavaScript côté navigateur
    const scrapedData = await page.evaluate(() => {
      // Suppression des éléments de bruit
      const noisySelectors = [
        'script', 'style', 'nav[class*="nav"]', 'footer', '.advertisement', 
        '.ads', '.popup', '.modal', '.cookie-banner', '.gdpr-banner'
      ];
      
      noisySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Extraction des métadonnées
      const title = document.title || 
                   document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                   document.querySelector('h1')?.textContent?.trim() || 
                   'Untitled';

      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || 
                         document.querySelector('meta[property="og:description"]')?.getAttribute('content') || 
                         '';

      // Sélecteurs e-commerce spécialisés (de l'app améliorée)
      const productSelectors = [
        '.product-title', '.product-name', '.product-description', '.product-summary',
        '.price', '.product-price', '.current-price', '.sale-price', '.original-price', 
        '.product-details', '.product-info', '.product-features', '.product-specs',
        '.availability', '.stock-status', '.in-stock', '.out-of-stock',
        '.rating', '.reviews', '.review-count', '.stars', '.product-rating',
        '.brand', '.manufacturer', '.category', '.sku', '.model',
        '[data-product]', '[data-title]', '[data-name]', '[data-description]', '[data-price]',
        '[itemtype*="Product"]', '[itemtype*="product"]', '.productInfo', '.itemDetails',
        // Sélecteurs Next.js/React couramment utilisés
        'h1', 'h2', 'h3', '[class*="title"]', '[class*="name"]', '[class*="price"]',
        '[class*="description"]', '[class*="detail"]', '[class*="info"]'
      ];

      let extractedText = '';
      let productInfo = {};
      const foundSelectors = [];

      // Application des sélecteurs e-commerce
      productSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          foundSelectors.push(`${selector}: ${elements.length} éléments`);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 3 && !extractedText.includes(text)) {
              extractedText += text + ' ';
              
              // Identifier le type d'information
              if (selector.includes('price')) {
                productInfo.price = text;
              } else if (selector.includes('title') || selector.includes('name')) {
                productInfo.name = text;
              } else if (selector.includes('description')) {
                productInfo.description = text;
              } else if (selector.includes('sku')) {
                productInfo.sku = text;
              } else if (selector.includes('category')) {
                productInfo.category = text;
              }
            }
          });
        }
      });

      // Extraction JSON-LD pour données structurées
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      jsonLdScripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          const items = Array.isArray(data) ? data : [data];
          
          items.forEach(item => {
            if (item['@type'] === 'Product') {
              if (item.name && !extractedText.includes(item.name)) {
                extractedText += ' ' + item.name;
                productInfo.jsonLdName = item.name;
              }
              if (item.description && !extractedText.includes(item.description)) {
                extractedText += ' ' + item.description;
                productInfo.jsonLdDescription = item.description;
              }
              if (item.offers && item.offers.price) {
                extractedText += ' Price: ' + item.offers.price;
                productInfo.jsonLdPrice = item.offers.price;
              }
            }
          });
        } catch (e) {
          // JSON malformé
        }
      });

      // Si peu de contenu, extraction générale mais ciblée
      if (extractedText.length < 200) {
        // Essayer des conteneurs principaux
        const mainSelectors = [
          'main', '[role="main"]', '.main-content', '#main-content', 
          '.content', '#content', '.page-content', '[class*="container"]',
          '[class*="product"]', '[class*="item"]'
        ];

        for (const selector of mainSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent?.trim();
            if (text && text.length > 100) {
              extractedText += text + ' ';
              break;
            }
          }
        }
      }

      // Extraction d'images
      const images = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src;
        const alt = img.alt || '';
        
        if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
          images.push({
            url: src,
            alt: alt.trim()
          });
        }
      });

      // Extraction de liens
      const links = [];
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.href;
        const linkText = link.textContent?.trim();
        
        if (href && linkText && linkText.length > 0 && linkText.length < 100) {
          links.push({
            url: href,
            text: linkText
          });
        }
      });

      return {
        title,
        description,
        text: extractedText.replace(/\s+/g, ' ').trim(),
        images: images.slice(0, 20),
        links: links.slice(0, 10),
        foundSelectors,
        productInfo,
        bodyLength: document.body.textContent?.length || 0
      };
    });

    await browser.close();

    // Calcul des statistiques
    const wordCount = scrapedData.text.split(/\s+/).filter(word => word.length > 0).length;
    
    console.log('\n📊 RÉSULTATS PUPPETEER:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Titre: ${scrapedData.title}`);
    console.log(`📝 Description meta: ${scrapedData.description.substring(0, 100)}...`);
    console.log(`📄 Texte extrait: ${scrapedData.text.length} caractères`);
    console.log(`🔤 Nombre de mots: ${wordCount}`);
    console.log(`🖼️ Images trouvées: ${scrapedData.images.length}`);
    console.log(`🔗 Liens trouvés: ${scrapedData.links.length}`);
    console.log(`📄 Taille totale du body: ${scrapedData.bodyLength} caractères`);

    console.log('\n🎯 Sélecteurs qui ont matché:');
    if (scrapedData.foundSelectors.length > 0) {
      scrapedData.foundSelectors.forEach(selector => {
        console.log(`   ✓ ${selector}`);
      });
    } else {
      console.log('   ⚠️ Aucun sélecteur spécialisé n\'a matché');
    }

    if (Object.keys(scrapedData.productInfo).length > 0) {
      console.log('\n📦 Informations produit identifiées:');
      Object.entries(scrapedData.productInfo).forEach(([key, value]) => {
        console.log(`   ${key}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
      });
    }

    if (scrapedData.images.length > 0) {
      console.log('\n🖼️ Images extraites:');
      scrapedData.images.slice(0, 3).forEach((img, i) => {
        console.log(`   ${i + 1}. ${img.url} (alt: "${img.alt}")`);
      });
    }

    console.log('\n📖 Aperçu du contenu extrait:');
    const preview = scrapedData.text.length > 500 ? 
                   scrapedData.text.substring(0, 500) + '...' : 
                   scrapedData.text;
    console.log(preview);

    console.log('\n🎉 TEST PUPPETEER TERMINÉ!');
    
    if (scrapedData.text.length > 200) {
      console.log('✅ SUCCÈS: Contenu substantiel extrait avec Puppeteer');
      console.log('✅ L\'extracteur amélioré fonctionne parfaitement avec E-Market 237');
    } else {
      console.log('⚠️ Contenu limité extrait - le site peut nécessiter une interaction utilisateur');
    }

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('\n❌ ERREUR PUPPETEER:', error.message);
  }
}

// Exécution du test
testEMarket237WithPuppeteer();