const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const N8N_HOST = process.env.N8N_HOST || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
const BACKUP_DIR = path.join(__dirname, '../workflows_backup');

if (!N8N_API_KEY) {
    console.error('Error: N8N_API_KEY is not set in .env file.');
    process.exit(1);
}

async function restoreWorkflow(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const workflowData = JSON.parse(fileContent);

        if (!workflowData.id) {
            console.error(`Skipping ${path.basename(filePath)}: No ID found in JSON.`);
            return;
        }

        console.log(`Updating workflow: ${workflowData.name} (${workflowData.id})...`);

        // Update existing workflow
        await axios.put(`${N8N_HOST}/api/v1/workflows/${workflowData.id}`, workflowData, {
            headers: {
                'X-N8N-API-KEY': N8N_API_KEY
            }
        });

        console.log(`Successfully updated: ${workflowData.name}`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn(`Workflow ${path.basename(filePath)} not found on server. Creating new...`);
            // Optional based on requirement: Create new if not found?
            // const createRes = await axios.post(`${N8N_HOST}/api/v1/workflows`, workflowData, ...);
            // console.log(`Created new workflow with ID: ${createRes.data.id}`);
        } else {
            console.error(`Error restoring ${path.basename(filePath)}:`, error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
        }
    }
}

async function restoreAll() {
    if (!fs.existsSync(BACKUP_DIR)) {
        console.error('Backup directory not found!');
        return;
    }

    const files = fs.readdirSync(BACKUP_DIR).filter(file => file.endsWith('.json'));

    if (files.length === 0) {
        console.log('No workflow files found to restore.');
        return;
    }

    console.log(`Found ${files.length} workflow files to restore/update.`);

    for (const file of files) {
        await restoreWorkflow(path.join(BACKUP_DIR, file));
    }
}

// Check for arguments (e.g. node scripts/restore_workflows.js my_workflow.json)
const specificFile = process.argv[2];
if (specificFile) {
    const targetPath = path.resolve(process.cwd(), specificFile); // resolve relative to current dir
    // Or verify if it matches a file in BACKUP_DIR
    const backupPath = path.join(BACKUP_DIR, specificFile);

    if (fs.existsSync(targetPath)) {
        restoreWorkflow(targetPath);
    } else if (fs.existsSync(backupPath)) {
        restoreWorkflow(backupPath);
    } else {
        console.error(`File not found: ${specificFile}`);
    }
} else {
    restoreAll();
}
