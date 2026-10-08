import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileLiquidTemplates } from '../compile-liquid-templates';

describe('compile-liquid-templates script', () => {
  let testTempDir: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-liquid-templates-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(testTempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should compile nested .liquid templates keyed by POSIX relative path', () => {
    const templatesDir = path.join(testTempDir, 'templates');
    const outputFile = path.join(testTempDir, 'output.json');
    fs.mkdirSync(path.join(templatesDir, 'emails', 'partials'), { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'root.liquid'), 'Root {{ name }}');
    fs.writeFileSync(path.join(templatesDir, 'emails', 'welcome.liquid'), 'Welcome\n{{ name }}\n');
    fs.writeFileSync(path.join(templatesDir, 'emails', 'partials', 'footer.liquid'), 'Footer');

    compileLiquidTemplates(templatesDir, outputFile);

    expect(JSON.parse(fs.readFileSync(outputFile, 'utf-8'))).toEqual({
      'root.liquid': 'Root {{ name }}',
      'emails/welcome.liquid': 'Welcome\n{{ name }}\n',
      'emails/partials/footer.liquid': 'Footer',
    });
  });

  it('should only include .liquid files', () => {
    const templatesDir = path.join(testTempDir, 'templates');
    const outputFile = path.join(testTempDir, 'output.json');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'template.liquid'), 'Liquid');
    fs.writeFileSync(path.join(templatesDir, 'template.pug'), 'p Pug');
    fs.writeFileSync(path.join(templatesDir, 'readme.md'), '# README');

    compileLiquidTemplates(templatesDir, outputFile);

    expect(Object.keys(JSON.parse(fs.readFileSync(outputFile, 'utf-8')))).toEqual([
      'template.liquid',
    ]);
  });

  it('should write an empty object for an empty directory', () => {
    const outputFile = path.join(testTempDir, 'output.json');

    compileLiquidTemplates(testTempDir, outputFile);

    expect(JSON.parse(fs.readFileSync(outputFile, 'utf-8'))).toEqual({});
  });

  it('should error when the input directory does not exist', () => {
    const outputFile = path.join(testTempDir, 'output.json');

    expect(() => compileLiquidTemplates(path.join(testTempDir, 'missing'), outputFile)).toThrow(
      'does not exist',
    );
    expect(fs.existsSync(outputFile)).toBe(false);
  });

  it('should error when the input is not a directory', () => {
    const notADir = path.join(testTempDir, 'file.txt');
    fs.writeFileSync(notADir, 'content');

    expect(() => compileLiquidTemplates(notADir, path.join(testTempDir, 'out.json'))).toThrow(
      'is not a directory',
    );
  });
});
