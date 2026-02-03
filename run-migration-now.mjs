import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log('🔗 Connecting to Supabase PostgreSQL...\n');

try {
  await client.connect();
  console.log('✅ Connected successfully!\n');

  const sql = readFileSync('./supabase-final-fix.sql', 'utf8');
  
  console.log('🚀 Executing migration SQL...\n');
  
  await client.query(sql);
  
  console.log('✅ Migration SQL executed!\n');
  console.log('📊 Verifying data...\n');
  
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM spots) as spots,
      (SELECT COUNT(*) FROM airbears) as airbears,
      (SELECT COUNT(*) FROM bodega_items) as bodega_items
  `);
  
  console.log('Final Counts:');
  console.log('  Spots:', counts.rows[0].spots);
  console.log('  AirBears:', counts.rows[0].airbears);
  console.log('  Bodega Items:', counts.rows[0].bodega_items);
  
  if (counts.rows[0].airbears >= 10 && counts.rows[0].bodega_items >= 12) {
    console.log('\n🎉 SUCCESS! All data inserted correctly!\n');
  } else {
    console.log('\n⚠️  Some data may be missing. Check logs above.\n');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('\nStack:', error.stack);
  process.exit(1);
} finally {
  await client.end();
  console.log('🔌 Connection closed.');
}
