// List available Gemini models
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';

// Read API key from .env.local
let API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!API_KEY) {
  try {
    const envContent = readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
    if (match) {
      API_KEY = match[1].trim();
    }
  } catch (err) {
    console.error('Could not read .env.local');
  }
}

console.log('\n🔍 Listing Available Gemini Models...\n');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT FOUND');

if (!API_KEY) {
  console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY not found');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
  try {
    console.log('\n📋 Fetching available models from API...\n');

    // Try to list models - this might not be supported by all API versions
    const models = await genAI.listModels();

    console.log('✅ Available models:');
    console.log(JSON.stringify(models, null, 2));
  } catch (error) {
    console.log('❌ Could not list models via SDK');
    console.log('Error:', error.message);

    // Try direct API call
    console.log('\n🌐 Trying direct API call to list models...\n');
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
      );

      if (!response.ok) {
        console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
        const errorText = await response.text();
        console.log('Response:', errorText);
      } else {
        const data = await response.json();
        console.log('✅ Available models via direct API call:');
        if (data.models && Array.isArray(data.models)) {
          data.models.forEach(model => {
            console.log(`  - ${model.name}`);
            console.log(`    Display Name: ${model.displayName}`);
            console.log(`    Supported Methods: ${model.supportedGenerationMethods?.join(', ')}`);
            console.log('');
          });
        } else {
          console.log(JSON.stringify(data, null, 2));
        }
      }
    } catch (fetchError) {
      console.log('❌ Direct API call failed:', fetchError.message);
    }
  }
}

listModels().catch(console.error);
