const fs = require('fs');

const jsPath = 'd:/public_html/bais-balad/src/Views/admin/js/admin.js';
const js = fs.readFileSync(jsPath, 'utf8');

const onRegex1 = /\bon[a-z]+="([a-zA-Z0-9_]+)\s*\(/g;
const onRegex2 = /\bon[a-z]+='([a-zA-Z0-9_]+)\s*\(/g;
let match;
const functionsToCheck = new Set();

while ((match = onRegex1.exec(js)) !== null) {
  functionsToCheck.add(match[1]);
}
while ((match = onRegex2.exec(js)) !== null) {
  functionsToCheck.add(match[1]);
}

const missing = [];
for (const fn of functionsToCheck) {
  if (!js.includes('function ' + fn) && !js.includes(fn + ' = ') && !js.includes(fn + ' =')) {
    missing.push(fn);
  }
}

console.log("Functions found in JS-generated HTML:", Array.from(functionsToCheck));
console.log("Missing functions:", missing);
