const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const path = require('path');
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const { DECK_CLIENT_ID, DECK_SECRET } = process.env;

const DECK_ENV = process.env.DECK_ENV;

// Utility: API call to Deck
const deckApi = axios.create({
  baseURL: `${DECK_ENV}/api/v1`,
  headers: {
    'x-deck-client-ID': process.env.DECK_CLIENT_ID,
    'x-deck-secret': process.env.DECK_SECRET,
    'Content-Type': 'application/json'
  }
});

// 1. Create link token for user
app.get('/api/link-token', async (req, res) => {
  try {
    const response = await deckApi.post('/link/token/create', {
      user: { client_user_id: "user-001" },
      products: ['bill'],
      client_name: 'My App',
      country_codes: ['US'],
      language: 'en'
    });

    res.json({ link_token: response.data.link_token });
    console.log('Link token created:', response.data.link_token);
  } catch (err) {
    console.error('Link token error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});


// 2. Exchange public_token for access_token
app.post('/api/token-exchange', async (req, res) => {
  try {
    const { public_token } = req.body;
    const response = await deckApi.post('/connection/public_token/exchange', {
      public_token
    });
    res.json(response.data); // Contains access_token and item_id
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});


// 3. Fetch bill data
app.post('/api/bill/submit', async (req, res) => {
  const { access_token, item_id } = req.body;
  const fetchAccounts = async (access_token) => {
    const jobSubmit = await deckApi.post(
      '/jobs/submit',
      {
        job_code: 'GetAccounts',
        input: { access_token }
      },
    );

    return jobSubmit.data.job_id;
  };
  const job_id= await fetchAccounts(access_token);
  async function pollJobStatus(access_token, job_id) {
  while (true) {
    const res = await axios.get(
      'https://sandbox.deck.co/api/v1/jobs/status',
      {
        headers: {
          'x-deck-client-id': process.env.DECK_CLIENT_ID,
          'x-deck-secret': process.env.DECK_SECRET,
        },
        params: { job_id }
      }
    );

    const job = res.data;

    if (job.status === 'success') {
      return job.result.accounts; // contains account_id, biller_name, etc.
    }

    if (job.status === 'error') {
      throw new Error(`Job failed: ${job.message}`);
    }

    console.log('⏳ Waiting for job to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 seconds
  }
}
const accounts = await pollJobStatus(access_token, job_id);
const {account_id}=accounts;
  (async () => {
    try {
      const response = await deckApi.post(
        '/jobs/submit',
        {
          job_code: 'FetchBill',
          input: {
            access_token: access_token,
            account_id: account_id,
          }
        }
      );
      res.json(response.data);
      console.log('✅ Job submitted successfully:', response.data);
    } catch (error) {
      console.error('❌ Job submission failed:', error.response?.data || error.message);
    }
  })();
});



app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
