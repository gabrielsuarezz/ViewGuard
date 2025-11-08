// Test script to verify Gemini API and find working models
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';

// Read API key from .env.local
let API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

// If not in env, try reading from .env.local
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

console.log('\n🔍 Testing Gemini API Connection...\n');
console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT FOUND');

if (!API_KEY) {
  console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY not found in .env.local');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Test different model names
const modelsToTest = [
  'gemini-pro',                    // Text-only model
  'gemini-1.5-pro',                // Latest Pro model
  'gemini-1.5-flash',              // Latest Flash model
  'gemini-pro-vision',             // Old vision model
  'gemini-1.5-flash-latest',       // Flash with -latest suffix
  'gemini-1.5-pro-latest',         // Pro with -latest suffix
];

async function testModel(modelName) {
  try {
    console.log(`\n📝 Testing: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Test with simple text prompt
    const result = await model.generateContent('Say "Hello, this model works!"');
    const response = await result.response;
    const text = response.text();

    console.log(`✅ ${modelName} WORKS!`);
    console.log(`   Response: ${text.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} FAILED`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testVisionModel(modelName) {
  try {
    console.log(`\n🖼️  Testing vision capability: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Create a simple 1x1 red pixel image in base64
    const redPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const result = await model.generateContent([
      'What color is this image?',
      {
        inlineData: {
          mimeType: 'image/png',
          data: redPixel,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    console.log(`✅ ${modelName} SUPPORTS VISION!`);
    console.log(`   Response: ${text.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} vision test failed`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('STEP 1: Testing Text Models');
  console.log('========================================');

  const workingModels = [];

  for (const modelName of modelsToTest) {
    const works = await testModel(modelName);
    if (works) {
      workingModels.push(modelName);
    }
    // Wait a bit to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n========================================');
  console.log('STEP 2: Testing Vision Capabilities');
  console.log('========================================');

  const visionModels = [];

  for (const modelName of workingModels) {
    const supportsVision = await testVisionModel(modelName);
    if (supportsVision) {
      visionModels.push(modelName);
    }
    // Wait a bit to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n========================================');
  console.log('RESULTS SUMMARY');
  console.log('========================================');
  console.log('\n✅ Working text models:', workingModels.length > 0 ? workingModels.join(', ') : 'NONE');
  console.log('✅ Vision-capable models:', visionModels.length > 0 ? visionModels.join(', ') : 'NONE');

  if (visionModels.length > 0) {
    console.log('\n🎯 RECOMMENDED MODEL FOR VIGILANTEAI:');
    console.log(`   Use: "${visionModels[0]}"`);
    console.log('\n📝 Update app/realtime-stream/actions.ts:');
    console.log(`   const model = genAI.getGenerativeModel({ model: "${visionModels[0]}" });`);
  } else {
    console.log('\n❌ No vision models found. Check your API key or try again later.');
  }

  console.log('\n========================================\n');
}

main().catch(console.error);
