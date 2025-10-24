import { readFileSync } from 'fs';

const html = readFileSync('./index.html', 'utf-8');
const start = html.indexOf('window.__firebase_config = JSON.stringify(') + 'window.__firebase_config = JSON.stringify('.length;
const searchFrom = html.substring(start, start + 500);
console.log('First 200 chars after JSON.stringify(:\n', searchFrom.substring(0, 200));
