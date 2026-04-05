const fs = require('fs');
const file = 'c:/bms-hack/Dexter-bmscehack/web/src/pages/Calibration.jsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/style=\{\{\s*display:\s*"grid",\s*gridTemplateColumns:\s*"330px\s+1fr",\s*gap:\s*12\s*\}\}/g, 'className="panel-layout"');

fs.writeFileSync(file, c);

const indexFile = 'c:/bms-hack/Dexter-bmscehack/web/src/index.css';
let idx = fs.readFileSync(indexFile, 'utf8');
if (!idx.includes('.panel-layout')) {
  idx += '\n\n.panel-layout {\n  display: grid;\n  grid-template-columns: 330px 1fr;\n  gap: 12px;\n  align-items: start;\n}\n@media (max-width: 900px) {\n  .panel-layout {\n    grid-template-columns: 1fr;\n  }\n}';
  fs.writeFileSync(indexFile, idx);
}

const infFile = 'c:/bms-hack/Dexter-bmscehack/web/src/pages/Inference.jsx';
let inf = fs.readFileSync(infFile, 'utf8');
inf = inf.replace(/style=\{\{\s*display:\s*"grid",\s*gridTemplateColumns:\s*"330px\s+1fr",\s*gap:\s*20\s*\}\}/g, 'className="panel-layout"');
fs.writeFileSync(infFile, inf);
