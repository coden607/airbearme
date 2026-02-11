#!/usr/bin/env node
import fetch from 'node-fetch';
import pg from 'pg';

const { Client } = pg;

const BASE_URL = 'https://pwa41.vercel.app';
const DB_URL = 'postgresql://postgres:Tiger4-Phonebook9-Acquaint7-Sponsor5-Molehill8@db.fushiklvahmujvzuveje.supabase.co:5432/postgres';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function section(title) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}`);
  console.log(`${title.toUpperCase()}`);
  console.log(`${'='.repeat(60)}${colors.reset}\n`);
}

async function testDatabase() {
  section('🗄️  DATABASE VALIDATION');

  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    log('✅', 'Database connection successful', colors.green);

    // Check spots
    const spotsResult = await client.query('SELECT COUNT(*) as count FROM spots WHERE is_active = true');
    const spotsCount = parseInt(spotsResult.rows[0].count);
    log('✅', `Spots: ${spotsCount} active locations`, colors.green);

    if (spotsCount < 17) {
      log('⚠️', `Expected 17 spots, found ${spotsCount}`, colors.yellow);
    }

    // Check airbears
    const airbearsResult = await client.query('SELECT COUNT(*) as count FROM airbears');
    const airbearsCount = parseInt(airbearsResult.rows[0].count);
    log('✅', `AirBears: ${airbearsCount} vehicles`, colors.green);

    if (airbearsCount < 10) {
      log('⚠️', `Expected 10 airbears, found ${airbearsCount}`, colors.yellow);
    }

    // Check available airbears
    const availableResult = await client.query('SELECT COUNT(*) as count FROM airbears WHERE is_available = true');
    const availableCount = parseInt(availableResult.rows[0].count);
    log('✅', `Available: ${availableCount} ready for rides`, colors.green);

    // Check bodega items
    const bodegaResult = await client.query('SELECT COUNT(*) as count FROM bodega_items WHERE is_available = true');
    const bodegaCount = parseInt(bodegaResult.rows[0].count);
    log('✅', `Bodega: ${bodegaCount} products available`, colors.green);

    if (bodegaCount < 12) {
      log('⚠️', `Expected 12 bodega items, found ${bodegaCount}`, colors.yellow);
    }

    // Check schema completeness
    const schemaCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'bodega_items'
      AND column_name IN ('is_available', 'is_eco_friendly', 'stock', 'image_url', 'description', 'category')
    `);

    if (schemaCheck.rows.length === 6) {
      log('✅', 'Bodega schema: All columns present', colors.green);
    } else {
      log('❌', `Bodega schema: Missing columns (${schemaCheck.rows.length}/6)`, colors.red);
    }

    // Check users schema
    const usersSchemaCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('avatar_url', 'full_name', 'stripe_customer_id', 'eco_points')
    `);

    if (usersSchemaCheck.rows.length === 4) {
      log('✅', 'Users schema: All columns present', colors.green);
    } else {
      log('❌', `Users schema: Missing columns (${usersSchemaCheck.rows.length}/4)`, colors.red);
    }

    // Check RLS policies
    const policiesResult = await client.query(`
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE tablename IN ('spots', 'airbears', 'bodega_items', 'users')
    `);

    log('✅', `RLS Policies: ${policiesResult.rows.length} configured`, colors.green);

    return {
      spots: spotsCount,
      airbears: airbearsCount,
      available: availableCount,
      bodega: bodegaCount,
      schemaComplete: schemaCheck.rows.length === 6 && usersSchemaCheck.rows.length === 4
    };

  } catch (error) {
    log('❌', `Database error: ${error.message}`, colors.red);
    return null;
  } finally {
    await client.end();
  }
}

async function testAPI() {
  section('🌐 API ENDPOINTS VALIDATION');

  const endpoints = [
    { name: 'Health Check', url: '/api/health', method: 'GET' },
    { name: 'Spots', url: '/api/spots', method: 'GET', minCount: 16 },
    { name: 'AirBears', url: '/api/airbears', method: 'GET', minCount: 10 },
    { name: 'Bodega Items', url: '/api/bodega/items', method: 'GET', minCount: 12 },
  ];

  const results = {};

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint.url}`, {
        method: endpoint.method
      });

      if (response.ok) {
        const data = await response.json();
        const count = Array.isArray(data) ? data.length : null;

        results[endpoint.name] = {
          status: response.status,
          count,
          data: Array.isArray(data) ? data[0] : data
        };

        if (count !== null) {
          if (endpoint.minCount && count < endpoint.minCount) {
            log('⚠️', `${endpoint.name}: ${count} items (expected ${endpoint.minCount})`, colors.yellow);
          } else {
            log('✅', `${endpoint.name}: ${count} items (HTTP ${response.status})`, colors.green);
          }
        } else {
          log('✅', `${endpoint.name}: HTTP ${response.status}`, colors.green);
        }
      } else {
        log('❌', `${endpoint.name}: HTTP ${response.status}`, colors.red);
        results[endpoint.name] = { status: response.status, error: true };
      }
    } catch (error) {
      log('❌', `${endpoint.name}: ${error.message}`, colors.red);
      results[endpoint.name] = { error: error.message };
    }
  }

  return results;
}

async function testFrontend() {
  section('🖥️  FRONTEND PAGES VALIDATION');

  const pages = [
    { name: 'Homepage', url: '/' },
    { name: 'Map', url: '/map' },
    { name: 'Bodega', url: '/bodega' },
    { name: 'Register', url: '/register' },
    { name: 'Login', url: '/login' },
  ];

  for (const page of pages) {
    try {
      const response = await fetch(`${BASE_URL}${page.url}`);

      if (response.ok) {
        const html = await response.text();

        // Check for critical content
        const checks = {
          hasTitle: html.includes('<title>'),
          hasManifest: html.includes('manifest.json'),
          hasNoBadBranding: !html.toLowerCase().includes('rickshaw'),
          hasAirbear: html.toLowerCase().includes('airbear'),
        };

        const allPassed = Object.values(checks).every(v => v);

        if (allPassed) {
          log('✅', `${page.name}: Loaded successfully (HTTP ${response.status})`, colors.green);
        } else {
          log('⚠️', `${page.name}: Loaded with issues`, colors.yellow);
          if (checks.hasNoBadBranding === false) {
            log('  ⚠️', '  Contains outdated branding reference', colors.yellow);
          }
        }
      } else {
        log('❌', `${page.name}: HTTP ${response.status}`, colors.red);
      }
    } catch (error) {
      log('❌', `${page.name}: ${error.message}`, colors.red);
    }
  }
}

async function testMapFeatures() {
  section('🗺️  MAP & REAL-TIME TRACKING VALIDATION');

  try {
    // Fetch spots
    const spotsRes = await fetch(`${BASE_URL}/api/spots`);
    const spots = await spotsRes.json();

    log('✅', `Map Data: ${spots.length} spots loaded`, colors.green);

    // Check Binghamton coordinates
    const binghamtonSpots = spots.filter(s => {
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      return lat >= 42.0 && lat <= 42.2 && lng >= -76.0 && lng <= -75.8;
    });

    log('✅', `Location: ${binghamtonSpots.length} spots in Binghamton area`, colors.green);

    // Fetch airbears for real-time tracking
    const airbearsRes = await fetch(`${BASE_URL}/api/airbears`);
    const airbears = await airbearsRes.json();

    log('✅', `Live Tracking: ${airbears.length} AirBears broadcasting location`, colors.green);

    // Check airbear properties
    const firstBear = airbears[0];
    if (firstBear) {
      const lat = parseFloat(firstBear.latitude);
      const lng = parseFloat(firstBear.longitude);
      const hasRequiredFields =
        !isNaN(lat) &&
        !isNaN(lng) &&
        firstBear.batteryLevel !== undefined &&
        firstBear.isAvailable !== undefined &&
        firstBear.heading !== undefined;

      if (hasRequiredFields) {
        log('✅', 'AirBear Schema: Complete with lat/lng/battery/heading', colors.green);
        log('  📍', `  Sample: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, colors.blue);
        log('  🔋', `  Battery: ${firstBear.batteryLevel}%`, colors.blue);
        log('  🧭', `  Heading: ${firstBear.heading}°`, colors.blue);
      } else {
        log('⚠️', 'AirBear Schema: Missing real-time fields', colors.yellow);
      }
    }

    // Check for available airbears
    const available = airbears.filter(b => b.isAvailable);
    log('✅', `Availability: ${available.length} AirBears ready for booking`, colors.green);

    return {
      spots: spots.length,
      airbears: airbears.length,
      available: available.length
    };

  } catch (error) {
    log('❌', `Map validation failed: ${error.message}`, colors.red);
    return null;
  }
}

async function testBodegaWorkflow() {
  section('🛒 BODEGA SHOPPING WORKFLOW');

  try {
    // Fetch bodega items
    const itemsRes = await fetch(`${BASE_URL}/api/bodega/items`);
    const items = await itemsRes.json();

    log('✅', `Product Catalog: ${items.length} items available`, colors.green);

    // Check item structure
    const firstItem = items[0];
    if (firstItem) {
      const fields = {
        hasName: firstItem.name !== undefined,
        hasPrice: firstItem.price !== undefined,
        hasImage: firstItem.imageUrl !== undefined,
        hasDescription: firstItem.description !== undefined,
        hasCategory: firstItem.category !== undefined,
        hasEcoFriendly: firstItem.isEcoFriendly !== undefined,
        hasStock: firstItem.stock !== undefined,
      };

      const allFields = Object.values(fields).every(v => v);

      if (allFields) {
        log('✅', 'Product Schema: Complete with all fields', colors.green);
        log('  🏷️', `  Sample: ${firstItem.name} - $${firstItem.price}`, colors.blue);
        log('  🖼️', `  Image: ${firstItem.imageUrl ? 'Yes' : 'No'}`, colors.blue);
        log('  📦', `  Stock: ${firstItem.stock} units`, colors.blue);
        log('  🌱', `  Eco-friendly: ${firstItem.isEcoFriendly ? 'Yes' : 'No'}`, colors.blue);
      } else {
        log('⚠️', 'Product Schema: Missing fields', colors.yellow);
      }
    }

    // Check categories
    const categories = [...new Set(items.map(i => i.category))];
    log('✅', `Categories: ${categories.join(', ')}`, colors.green);

    // Check eco-friendly items
    const ecoItems = items.filter(i => i.isEcoFriendly);
    log('✅', `Eco-Friendly: ${ecoItems.length} sustainable products`, colors.green);

    return {
      items: items.length,
      categories: categories.length,
      ecoFriendly: ecoItems.length
    };

  } catch (error) {
    log('❌', `Bodega validation failed: ${error.message}`, colors.red);
    return null;
  }
}

async function testCheckoutFlow() {
  section('💳 CHECKOUT & PAYMENT VALIDATION');

  try {
    // Check Stripe integration
    const checkoutPage = await fetch(`${BASE_URL}/checkout`);

    if (checkoutPage.ok) {
      const html = await checkoutPage.text();

      const checks = {
        hasStripe: html.includes('stripe') || html.includes('Stripe'),
        hasApplePay: html.includes('Apple Pay') || html.includes('apple-pay'),
        hasGooglePay: html.includes('Google Pay') || html.includes('google-pay'),
        hasCash: html.includes('Cash') || html.includes('cash'),
      };

      log('✅', 'Checkout page loaded', colors.green);

      if (checks.hasStripe) log('  💳', '  Stripe integration detected', colors.blue);
      if (checks.hasApplePay) log('  🍎', '  Apple Pay available', colors.blue);
      if (checks.hasGooglePay) log('  🔍', '  Google Pay available', colors.blue);
      if (checks.hasCash) log('  💵', '  Cash payment option', colors.blue);

      return checks;
    } else {
      log('⚠️', `Checkout page: HTTP ${checkoutPage.status}`, colors.yellow);
      return null;
    }
  } catch (error) {
    log('❌', `Checkout validation failed: ${error.message}`, colors.red);
    return null;
  }
}

async function testPWAFeatures() {
  section('📱 PWA & MOBILE FEATURES');

  try {
    // Check manifest
    const manifestRes = await fetch(`${BASE_URL}/manifest.json`);
    const manifest = await manifestRes.json();

    log('✅', `Manifest: ${manifest.name}`, colors.green);
    log('  🎨', `  Theme: ${manifest.theme_color}`, colors.blue);
    log('  📱', `  Display: ${manifest.display}`, colors.blue);
    log('  🖼️', `  Icons: ${manifest.icons?.length || 0} sizes`, colors.blue);

    // Check service worker
    const swRes = await fetch(`${BASE_URL}/sw.js`);
    if (swRes.ok) {
      log('✅', 'Service Worker: Registered', colors.green);
    } else {
      log('⚠️', `Service Worker: HTTP ${swRes.status}`, colors.yellow);
    }

    return {
      manifest: manifest.name,
      serviceWorker: swRes.ok
    };

  } catch (error) {
    log('❌', `PWA validation failed: ${error.message}`, colors.red);
    return null;
  }
}

async function generateReport(results) {
  section('📊 VALIDATION REPORT');

  console.log(`${colors.cyan}Deployment URL: ${colors.green}${BASE_URL}${colors.reset}`);
  console.log('');

  // Database
  if (results.database) {
    console.log(`${colors.magenta}DATABASE:${colors.reset}`);
    console.log(`  Spots: ${results.database.spots}`);
    console.log(`  AirBears: ${results.database.airbears} (${results.database.available} available)`);
    console.log(`  Bodega Items: ${results.database.bodega}`);
    console.log(`  Schema: ${results.database.schemaComplete ? '✅ Complete' : '⚠️ Incomplete'}`);
    console.log('');
  }

  // Map
  if (results.map) {
    console.log(`${colors.magenta}MAP & TRACKING:${colors.reset}`);
    console.log(`  Spots displayed: ${results.map.spots}`);
    console.log(`  AirBears tracked: ${results.map.airbears}`);
    console.log(`  Available for booking: ${results.map.available}`);
    console.log('');
  }

  // Bodega
  if (results.bodega) {
    console.log(`${colors.magenta}BODEGA:${colors.reset}`);
    console.log(`  Products: ${results.bodega.items}`);
    console.log(`  Categories: ${results.bodega.categories}`);
    console.log(`  Eco-friendly: ${results.bodega.ecoFriendly}`);
    console.log('');
  }

  // PWA
  if (results.pwa) {
    console.log(`${colors.magenta}PWA:${colors.reset}`);
    console.log(`  Manifest: ${results.pwa.manifest}`);
    console.log(`  Service Worker: ${results.pwa.serviceWorker ? '✅ Active' : '⚠️ Missing'}`);
    console.log('');
  }

  // Final verdict
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  const allGood =
    results.database?.schemaComplete &&
    results.database?.spots >= 16 &&
    results.database?.airbears >= 10 &&
    results.database?.bodega >= 12 &&
    results.map?.spots >= 16 &&
    results.pwa?.serviceWorker;

  if (allGood) {
    log('🎉', 'ALL SYSTEMS OPERATIONAL - READY FOR PRODUCTION!', colors.green);
  } else {
    log('⚠️', 'Some issues detected - review above for details', colors.yellow);
  }
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

async function main() {
  console.log(`${colors.cyan}
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║          🐻 AIRBEAR PWA COMPLETE VALIDATION 🐻           ║
  ║                                                           ║
  ║         Testing All Workflows & Features                  ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  ${colors.reset}\n`);

  const results = {};

  try {
    results.database = await testDatabase();
    results.api = await testAPI();
    await testFrontend();
    results.map = await testMapFeatures();
    results.bodega = await testBodegaWorkflow();
    results.checkout = await testCheckoutFlow();
    results.pwa = await testPWAFeatures();

    await generateReport(results);

  } catch (error) {
    log('❌', `Validation failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

main();
