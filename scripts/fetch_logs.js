const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const N8N_HOST = process.env.N8N_HOST || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
    console.error('Error: N8N_API_KEY is not set in .env file.');
    process.exit(1);
}

async function fetchLogs(limit = 5) {
    try {
        console.log(`Fetching last ${limit} failed executions from ${N8N_HOST}...`);

        // Fetch executions, filtering for errors if possible, or just recent ones
        // n8n API filter usage might vary by version, simpler to fetch recent and filter in JS
        const response = await axios.get(`${N8N_HOST}/api/v1/executions`, {
            headers: { 'X-N8N-API-KEY': N8N_API_KEY },
            params: {
                limit: 20, // get more to filter locally
                status: 'error' // Try to filter by status if supported
            }
        });

        const executions = response.data.data;
        const failedExecutions = executions.filter(exec => exec.finished === true && exec.mode !== 'manual'); // Filter manually if needed

        if (failedExecutions.length === 0) {
            console.log('No recent failed executions found.');
            return;
        }

        console.log(`Found ${failedExecutions.length} recent error(s):`);

        for (const exec of failedExecutions.slice(0, limit)) {
            console.log(`\n--------------------------------------------------`);
            console.log(`Execution ID: ${exec.id}`);
            console.log(`Workflow: ${exec.workflowId}`);
            console.log(`Started: ${exec.startedAt}`);
            console.log(`Duration: ${(new Date(exec.stoppedAt) - new Date(exec.startedAt)) / 1000}s`);

            // Fetch details for the specific execution to get the error message
            try {
                const detailResponse = await axios.get(`${N8N_HOST}/api/v1/executions/${exec.id}`, {
                    headers: { 'X-N8N-API-KEY': N8N_API_KEY }
                });
                const details = detailResponse.data;

                // Traverse to find the error node
                if (details.data && details.data.resultData && details.data.resultData.runData) {
                    Object.keys(details.data.resultData.runData).forEach(nodeName => {
                        const nodeRuns = details.data.resultData.runData[nodeName];
                        nodeRuns.forEach(run => {
                            if (run.error) {
                                console.log(`❌ Error in Node: "${nodeName}"`);
                                console.log(`   Message: ${run.error.message}`);
                                if (run.error.description) console.log(`   Description: ${run.error.description}`);
                                // console.log(`   Stack: ${run.error.stack}`); // Optional: show stack trace
                            }
                        });
                    });
                }
            } catch (err) {
                console.error(`Could not fetch details for ${exec.id}: ${err.message}`);
            }
        }
    } catch (error) {
        console.error('Error fetching logs:', error.message);
    }
}

// Allow passing limit as argument
const limitArg = process.argv[2] ? parseInt(process.argv[2]) : 5;
fetchLogs(limitArg);
