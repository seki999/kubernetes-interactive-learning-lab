const fs = require('fs');

const pathTest = 'src/kubernetes/controllers/hpaController.test.ts';
let contentTest = fs.readFileSync(pathTest, 'utf8');

// I replaced `const hpa = createHpa({` with `createHpa({` everywhere to fix an unused variable error. 
// BUT in "多个 metrics 时取建议副本数最大的那个", it WAS used!!!
// `reconcileHpa(hpa)`
// I will just change `reconcileHpa(hpa)` to `reconcileHpa(getResource('HorizontalPodAutoscaler', 'web-hpa', 'default')!)` 

contentTest = contentTest.replace("reconcileHpa(hpa)", "reconcileHpa(getResource('HorizontalPodAutoscaler', 'web-hpa', 'default')!)");

fs.writeFileSync(pathTest, contentTest);
