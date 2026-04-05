const fs = require('fs');

let html = fs.readFileSync('downloaded_landing.html', 'utf8');

let bodyStart = html.indexOf('<nav'); // start at nav
let bodyEnd = html.indexOf('</footer>') + 9;
let body = html.substring(bodyStart, bodyEnd);

body = body.replace(/class=/g, 'className=');
body = body.replace(/<!--.*?-->/g, '');
body = body.replace(/<img(.*?)>/g, '<img$1 />');
// fix missing closing tags or empty ones
body = body.replace(/<br>/g, '<br />');

let jsx = `import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.tailwindcss.com';
    script.async = true;
    document.head.appendChild(script);

    const configScript = document.createElement('script');
    configScript.innerHTML = \`
      tailwind.config = {
        darkMode: 'class',
        corePlugins: { preflight: false },
        theme: {
          extend: {
            colors: {
              'primary': '#c3f5ff',
              'primary-container': '#00e5ff',
              'on-primary': '#00363d',
              'secondary': '#d8b9ff',
              'tertiary': '#a6ffcd',
              'surface': '#111319',
              'surface-container-highest': '#33343b',
              'surface-container-high': '#282a30',
              'surface-container-low': '#191b22',
              'surface-container-lowest': '#0c0e14',
              'on-surface': '#e2e2eb',
              'on-surface-variant': '#bac9cc',
              'outline-variant': '#3b494c'
            },
            fontFamily: {
              'headline': ['"Space Grotesk"', 'sans-serif'],
              'body': ['"Manrope"', 'sans-serif'],
              'label': ['"Inter"', 'sans-serif'],
              'mono': ['"Fira Code"', 'monospace']
            }
          }
        }
      }
    \`;
    document.head.appendChild(configScript);

    const style = document.createElement('style');
    style.innerHTML = \`
      .glass-panel {
        background: rgba(30, 31, 38, 0.6);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(132, 147, 150, 0.15);
      }
      .text-gradient-primary {
        background: linear-gradient(135deg, #c3f5ff 0%, #00e5ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    \`;
    document.head.appendChild(style);
  }, []);

  return (
    <div className="bg-[#111319] text-[#e2e2eb] font-sans overflow-x-hidden min-h-screen">
      ${body}
    </div>
  );
}
`;

fs.writeFileSync('src/pages/LandingPage.jsx', jsx);
