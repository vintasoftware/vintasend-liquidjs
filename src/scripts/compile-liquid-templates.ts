#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface LiquidTemplatesMap {
  [key: string]: string;
}

/**
 * Recursively finds all .liquid files in a directory
 */
function findLiquidFiles(
  dir: string,
  baseDir: string,
  files: Map<string, string> = new Map(),
): Map<string, string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findLiquidFiles(fullPath, baseDir, files);
    } else if (entry.isFile() && entry.name.endsWith('.liquid')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      // Keys are POSIX-style paths relative to the base directory, so includes such as
      // {% include "partials/footer.liquid" %} resolve the same way they do on disk.
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.set(relativePath, content);
    }
  }

  return files;
}

/**
 * Main function to compile liquid templates to JSON
 */
export function compileLiquidTemplates(
  inputDir: string = './templates',
  outputFile: string = 'compiled-templates.json',
): void {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Directory "${inputDir}" does not exist.`);
  }

  if (!fs.statSync(inputDir).isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  console.log(`Searching for .liquid files in: ${inputDir}`);

  const liquidFiles = findLiquidFiles(inputDir, inputDir);

  console.log(`Found ${liquidFiles.size} .liquid file(s)`);

  const result: LiquidTemplatesMap = {};
  for (const [filePath, content] of liquidFiles.entries()) {
    result[filePath] = content;
    console.log(`  - ${filePath}`);
  }

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\nSuccessfully compiled templates to: ${outputFile}`);
}

function printHelp(): void {
  console.log('Usage: compile-liquid-templates [input-directory] [output-file]');
  console.log('');
  console.log('Arguments:');
  console.log('  input-directory  Directory containing .liquid templates (default: ./templates)');
  console.log('  output-file      Output JSON file path (default: compiled-templates.json)');
  console.log('');
  console.log('Examples:');
  console.log('  compile-liquid-templates');
  console.log('  compile-liquid-templates ./templates');
  console.log('  compile-liquid-templates ./templates ./compiled-templates.json');
}

export function runCli(args: string[] = process.argv.slice(2)): void {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const [inputDir, outputFile] = args;

  try {
    compileLiquidTemplates(inputDir, outputFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// Compare against the real path so the bin also runs when invoked through the
// node_modules/.bin symlink.
const isExecutedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);

if (isExecutedDirectly) {
  runCli(process.argv.slice(2));
}
