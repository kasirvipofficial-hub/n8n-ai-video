const https = require('https');

const PROJECT_ID = 'eyzrcazuehzfsrlnasun';
const PROJECT_URL = `https://${PROJECT_ID}.supabase.co`;
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5enJjYXp1ZWh6ZnNybG5hc3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTI5NjcsImV4cCI6MjA4NjcyODk2N30.MvZrMlOWVYsdfb6S7LJvMzliICLFazD9AddsfA0dlLU';

const tables = ['users', 'projects', 'jobs', 'assets'];

async function fetchTable(table) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${PROJECT_ID}.supabase.co`,
      path: `/rest/v1/${table}?select=*&limit=5`,
      method: 'GET',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject('Error parsing JSON');
          }
        } else {
          reject(`Error ${res.statusCode}: ${data}`);
        }
      });
    });

    req.on('error', (e) => {
      reject(e.message);
    });
    req.end();
  });
}

async function checkAll() {
  console.log('Checking Supabase Connection...\n');
  for (const table of tables) {
    try {
      console.log(`--- Table: ${table} ---`);
      const data = await fetchTable(table);
      if (data.length === 0) {
        console.log('No records found (Empty).');
      } else {
        console.log(`Found ${data.length} records. Showing first 2:`);
        console.log(JSON.stringify(data.slice(0, 2), null, 2));
      }
    } catch (error) {
      console.error(`Failed to fetch ${table}:`, error);
    }
    console.log('\n');
  }
}

checkAll();
