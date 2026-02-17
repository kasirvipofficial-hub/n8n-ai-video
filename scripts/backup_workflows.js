const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const N8N_HOST = process.env.N8N_HOST || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY; // You must create an API Key in n8n Settings > API
const BACKUP_DIR = path.join(__dirname, '../workflows_backup');

if (!N8N_API_KEY) {
  console.error('Error: N8N_API_KEY is not set in .env file.');
  process.exit(1);
}

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupWorkflows() {
  try {
    console.log(`Fetching workflows from ${N8N_HOST}...`);
    const response = await axios.get(`${N8N_HOST}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      }
    });

    const workflows = response.data.data;
    console.log(`Found ${workflows.length} workflows.`);

    for (const workflow of workflows) {
      // Get full workflow details including nodes and connections
      const fullWorkflowResponse = await axios.get(`${N8N_HOST}/api/v1/workflows/${workflow.id}`, {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        }
      });
      
      const fullWorkflow = fullWorkflowResponse.data;
      const sanitizedName = workflow.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filePath = path.join(BACKUP_DIR, `${sanitizedName}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(fullWorkflow, null, 2));
      console.log(`Saved: ${workflow.name} -> ${filePath}`);
    }

    console.log('Backup completed successfully!');
  } catch (error) {
    console.error('Error backing up workflows:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

backupWorkflows();
