const fs = require('fs');
const index = fs.readFileSync('src/Views/pwa/index.html', 'utf8');
const app = fs.readFileSync('src/Views/pwa/js/app.js', 'utf8');
const regex = /on[a-z]+\s*=\s*"([^\("]+)/gi;
const matches = new Set();
let match;
while ((match = regex.exec(index)) !== null) {
  matches.add(match[1]);
}
const missing = [];
for (const fn of matches) {
  if (!app.includes(fn)) {
    missing.push(fn);
  }
}
console.log('Missing in app.js:', missing);
