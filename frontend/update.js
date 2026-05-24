const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace fetch patterns
content = content.replace(/fetch\(`\$\{API_BASE_URL\}\/api\/([^`]+)`,\s*{[^}]+headers:[^}]+}\)/g, 'API.get(\'/$1\')');
content = content.replace(/await response\.json\(\)/g, 'response.data');

fs.writeFileSync(filePath, content);
console.log('Updated!');