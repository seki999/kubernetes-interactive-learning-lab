const fs = require('fs');

const path = 'src/kubernetes/controllers/hpaController.test.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix the unused 'hpa' globally
content = content.replace(/const hpa = createHpa\(\{/g, "createHpa({");

fs.writeFileSync(path, content);
