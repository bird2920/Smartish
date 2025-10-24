#!/usr/bin/env node

/**
 * Firebase Configuration Validator
 * Run: node validate-firebase.js
 */

import { readFileSync } from 'fs';

console.log('🔍 Validating Firebase Configuration...\n');

// Read index.html
let html;
try {
  html = readFileSync('./index.html', 'utf-8');
} catch (err) {
  console.error('❌ Error: Could not read index.html');
  process.exit(1);
}

// Extract config more robustly
let config;
try {
  // Find the start of the config
  const configStart = html.indexOf('window.__firebase_config = JSON.stringify({');
  if (configStart === -1) {
    throw new Error('Could not find window.__firebase_config = JSON.stringify({');
  }
  
  // Find matching closing brace
  let start = configStart + 'window.__firebase_config = JSON.stringify('.length;
  let braceCount = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }
  }
  
  if (end === -1) {
    throw new Error('Could not find closing brace for config object');
  }
  
  const configStr = html.substring(start, end);
  
  // Fix unquoted keys (JavaScript object → JSON) and remove trailing commas
  // Use a more precise regex that doesn't match colons inside strings
  const jsonStr = configStr
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Quote keys (only after { or ,)
    .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
  
  config = JSON.parse(jsonStr);
  
} catch (err) {
  console.error('❌ Error: Could not parse Firebase config from index.html');
  console.error(`   ${err.message}`);
  console.error('\n💡 Make sure your config looks like this:');
  console.error('   window.__firebase_config = JSON.stringify({');
  console.error('     apiKey: "AIza...",');
  console.error('     authDomain: "project.firebaseapp.com",');
  console.error('     ...');
  console.error('   });\n');
  process.exit(1);
}

// Validate required fields
const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missing = required.filter(key => !config[key] || config[key].startsWith('YOUR_'));

if (missing.length > 0) {
  console.error('❌ Missing or placeholder values in Firebase config:\n');
  missing.forEach(key => {
    const value = config[key] || '(not set)';
    console.error(`   ${key}: ${value}`);
  });
  console.error('\n📖 Get your real config from: https://console.firebase.google.com');
  console.error('   Project Settings > Your apps > Web app > Config\n');
  process.exit(1);
}

// Check for realistic values
const checks = {
  apiKey: /^AIza[0-9A-Za-z-_]{35}$/,
  authDomain: /\.firebaseapp\.com$/,
  projectId: /^[a-z0-9-]+$/,
  messagingSenderId: /^\d+$/,
  appId: /^1:\d+:web:[0-9a-f]+$/,
};

const warnings = [];
Object.entries(checks).forEach(([key, pattern]) => {
  if (config[key] && !pattern.test(config[key])) {
    warnings.push(`   ${key}: "${config[key]}" - unusual format`);
  }
});

if (warnings.length > 0) {
  console.log('⚠️  Some values look unusual (but might still work):\n');
  warnings.forEach(w => console.log(w));
  console.log('\n   Double-check these in Firebase Console if you have issues.\n');
}

// Success!
console.log('✅ Firebase config looks good!\n');
console.log('📋 Configuration found:');
console.log(`   Project: ${config.projectId}`);
console.log(`   Auth Domain: ${config.authDomain}`);
console.log(`   API Key: ${config.apiKey.substring(0, 12)}...`);

console.log('\n✅ Next steps to complete setup:');
console.log('   1. Enable Firestore in Firebase Console (Build > Firestore Database)');
console.log('   2. Enable Anonymous Auth (Build > Authentication > Anonymous)');
console.log('   3. Deploy security rules from firestore.rules file');
console.log('   4. Run: npm run dev');
console.log('\n🎮 Then open http://localhost:5173 to play!\n');
