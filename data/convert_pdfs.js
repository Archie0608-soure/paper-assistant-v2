import { PDFParse } from 'pdf-parse';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inputDir = join(__dirname, 'human_papers/优秀论文');
const outputDir = join(__dirname, 'human_papers/text');

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter(f => f.endsWith('.txt'));
console.log(`Found ${files.length} files to convert`);

let success = 0;
let failed = 0;

for (const file of files) {
  const inputPath = join(inputDir, file);
  const outputName = basename(file, '.txt') + '.txt';
  const outputPath = join(outputDir, outputName);

  try {
    const buf = readFileSync(inputPath);
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    
    // Combine all pages into single text
    const fullText = result.pages.map(p => p.text).join('\n\n---\n\n');
    
    writeFileSync(outputPath, fullText, 'utf8');
    
    const wordCount = fullText.replace(/\s/g, '').length;
    console.log(`✓ ${file} -> ${result.pages.length} pages, ${wordCount} chars`);
    success++;
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone: ${success} converted, ${failed} failed`);
