#!/usr/bin/env node

// Simple script to create placeholder icons for the extension
// Run: node create-icons.js

const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

// Create a simple SVG template
function createSVG(size) {
  const padding = Math.floor(size * 0.2);
  const fontSize = Math.floor(size * 0.5);
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.floor(size * 0.2)}" fill="url(#grad)"/>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">C</text>
</svg>`;
}

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create SVG files for each size
sizes.forEach(size => {
  const svg = createSVG(size);
  const filename = path.join(iconsDir, `icon-${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created: ${filename}`);
});

console.log('\nSVG icons created in icons/ directory.');
console.log('To convert to PNG, use an online converter or:');
console.log('  - Figma: Import SVGs and export as PNG');
console.log('  - Command line: npx svg2png icons/icon-*.svg');
console.log('  - Online: https://convertio.co/svg-png/');
