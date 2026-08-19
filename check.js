const fs = require('fs');
const content = fs.readFileSync('src/Views/pwa/index.html', 'utf8');
const regex = /on[a-z]+\s*=\s*"([^\("]+)/gi;
const matches = new Set();
let match;
while ((match = regex.exec(content)) !== null) {
  matches.add(match[1]);
}
console.log(Array.from(matches).sort());
