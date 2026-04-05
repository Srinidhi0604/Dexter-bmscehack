const fs = require('fs');
const file = 'c:/bms-hack/Dexter-bmscehack/web/src/pages/Calibration.jsx';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/gridTemplateColumns:\s*"330px 1fr"/g, 'display: "flex", flexWrap: "wrap", alignItems: "stretch" /* was grid */');
// But the right column needs to stretch. Usually it's `flex: 1, minWidth: 400`. 
// Because the left col has "card", we can just target the global CSS.
fs.writeFileSync(file, c);
console.log("Updated!");
