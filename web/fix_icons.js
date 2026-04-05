const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, 'src', 'pages');
const pages = ['Location.jsx', 'Calibration.jsx', 'Inference.jsx', 'Visualization.jsx', 'Welcome.jsx'];

const emojiMap = {
  '📂': '<FolderOpen size={18} className="mr-2" />',
  '🎬': '<Video size={18} className="mr-2" />',
  '📍': '<MapPin size={18} className="mr-2" />',
  '➕': '<Plus size={16} />',
  '🎞': '<Film size={18} className="mr-2" />',
  '🎥': '<Video size={18} className="mr-2" />',
  '🎯': '<Target size={18} className="mr-2" />',
  '🖼️': '<Image size={18} className="mr-2" />',
  '↻': '<RotateCw size={14} className="mr-2" />',
  '⚡': '<Zap size={18} className="mr-2" />',
  '📡': '<Activity size={18} className="mr-2" />',
  '⬇️': '<ArrowDown size={14} />',
  '⬆️': '<ArrowUp size={14} />',
  '⬆': '<ArrowUp size={14} className="mr-2" />',
  '✓': '<Check size={12} className="ml-2" />',
};

// Unique imports needed for Lucide
const allImportsNeeded = new Set(['FolderOpen', 'Video', 'MapPin', 'Plus', 'Film', 'Target', 'Image', 'RotateCw', 'Zap', 'Activity', 'ArrowDown', 'ArrowUp', 'Check']);

pages.forEach(page => {
  const file = path.join(PAGES_DIR, page);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace emojis
  Object.entries(emojiMap).forEach(([emoji, replacement]) => {
    if (content.includes(emoji)) {
      // Create a global regex for the emoji
      const regex = new RegExp(emoji, 'gu');
      content = content.replace(regex, replacement);
      changed = true;
    }
  });

  if (changed) {
    // Check if lucide-react is already imported
    if (!content.includes('lucide-react')) {
      const importStr = `import { ${Array.from(allImportsNeeded).join(', ')} } from 'lucide-react';\n`;
      // Find the last import statement or beginning of file
      const match = content.match(/^import.*?;/m);
      if (match) {
        content = content.replace(/^import.*?;/m, (m) => m + '\n' + importStr);
      } else {
        content = importStr + content;
      }
    } else {
       // if imported, try to make sure all icons we need are there - but it's easier to just do a blanket replacement of the lucide import if it exists.
       // For safety, let's just append the missing icons to the file if it doesn't compile we will fix it.
       // Actually a simpler way: just insert our block of imports
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${page}`);
  }
});
