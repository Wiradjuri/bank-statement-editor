// Unit Tests for Document Layout Preservation Systems

const assert = require('assert');
const path = require('path');

console.log('='.repeat(50));
console.log('RUNNING UNIT TESTS');
console.log('='.repeat(50));

// Test 1: Utils Module
console.log('\n--- Testing Utils Module ---');
try {
  const utils = require('./src/lib/utils');
  assert.ok(typeof utils.generateId === 'function', 'generateId should be a function');
  assert.ok(utils.generateId().startsWith('element'), 'generateId should start with "element"');
  assert.ok(utils.generateId('custom-').startsWith('custom-'), 'generateId should respect prefix');
  assert.strictEqual(typeof utils.deepClone === 'function', true, 'deepClone should be a function');
  console.log('[utils] generateId, deepClone: PASSED');
} catch (e) {
  console.log('[utils] FAILED:', e.message);
}

// Test 2: Core Layout Preserver
console.log('\n--- Testing Core Layout Preserver ---');
try {
  const layoutPreserver = require('./src/preserver/layout-preserver');
  assert.ok(typeof layoutPreserver.LayoutPreserver === 'function', 'LayoutPreserver should be a function');
  
  const preserver = new layoutPreserver.LayoutPreserver();
  assert.strictEqual(preserver.maxHistorySize, 50, 'maxHistorySize should be 50');
  
  const layout = {
    type: 'pdf',
    pages: [
      {
        pageNumber: 1,
        dimensions: { width: 800, height: 600 },
        elements: [
          { id: 'el-1', type: 'text', content: 'Test', position: { point: { x: 10, y: 10 } } }
        ]
      }
    ]
  };
  
  const change = { elementId: 'el-1', newContent: 'Modified', type: 'content' };
  const result = preserver.processChange(layout, change);
  assert.ok(result.success, 'processChange should succeed');
  console.log('[layout-preserver] processChange: PASSED');
} catch (e) {
  console.log('[layout-preserver] FAILED:', e.message);
}

// Test 3: Layout Cache
console.log('\n--- Testing Layout Cache ---');
try {
  const LayoutCache = require('./src/preserver/layout-cache');
  const cache = new LayoutCache(10);
  
  assert.strictEqual(typeof cache.get === 'function', 'get should be a function');
  assert.strictEqual(typeof cache.set === 'function', 'set should be a function');
  assert.strictEqual(typeof cache.clear === 'function', 'clear should be a function');
  
  cache.set('key1', { data: 'value1' });
  const value = cache.get('key1');
  assert.ok(value !== null, 'get should return value');
  
  const size = cache.size();
  assert.ok(size > 0, 'size should be greater than 0');
  
  console.log('[layout-cache] get, set, clear, size: PASSED');
} catch (e) {
  console.log('[layout-cache] FAILED:', e.message);
}

// Test 4: PDF Parser
console.log('\n--- Testing PDF Parser ---');
try {
  const pdfParser = require('./src/parse/pdf-parser');
  assert.ok(typeof pdfParser.PdfParser === 'function', 'PdfParser should be a function');
  
  const parser = new pdfParser.PdfParser('/dummy/path.pdf');
  console.log('[pdf-parser] constructor: PASSED');
} catch (e) {
  console.log('[pdf-parser] FAILED:', e.message);
}

// Test 5: DOCX Parser
console.log('\n--- Testing DOCX Parser ---');
try {
  const docxParser = require('./src/parse/docx-parser');
  assert.ok(typeof docxParser.DocxParser === 'function', 'DocxParser should be a function');
  
  const parser = new docxParser.DocxParser('/dummy/path.docx');
  console.log('[docx-parser] constructor: PASSED');
} catch (e) {
  console.log('[docx-parser] FAILED:', e.message);
}

// Test 6: Image Parser
console.log('\n--- Testing Image Parser ---');
try {
  const imageParser = require('./src/parse/image-parser');
  assert.ok(typeof imageParser.ImageParser === 'function', 'ImageParser should be a function');
  
  const parser = new imageParser.ImageParser('/dummy/path.png');
  console.log('[image-parser] constructor: PASSED');
} catch (e) {
  console.log('[image-parser] FAILED:', e.message);
}

// Test 7: Layout UI
console.log('\n--- Testing Layout UI ---');
try {
  const layoutUI = require('./src/ui/layout-ui');
  assert.ok(typeof layoutUI.LayoutUI === 'function', 'LayoutUI should be a function');
  
  // Test instantiation without throwing
  const ui = new layoutUI.LayoutUI();
  console.log('[layout-ui] constructor: PASSED');
} catch (e) {
  console.log('[layout-ui] FAILED:', e.message);
}

// Test 8: Renderer Controller
console.log('\n--- Testing Renderer Controller ---');
try {
  const rendererController = require('./src/ui/renderer-controller');
  assert.ok(typeof rendererController.RendererController === 'function', 'RendererController should be a function');
  
  // Test instantiation without throwing
  const controller = new rendererController.RendererController();
  console.log('[renderer-controller] constructor: PASSED');
} catch (e) {
  console.log('[renderer-controller] FAILED:', e.message);
}

// Test 9: Main Electron Entry Point
console.log('\n--- Testing Main Electron Entry Point ---');
try {
  const mainEntry = require('./src/electron/main');
  assert.ok(typeof mainEntry.createWindow === 'function', 'createWindow should be a function');
  console.log('[electron-main] module loading: PASSED');
} catch (e) {
  console.log('[electron-main] FAILED:', e.message);
}

console.log('\n' + '='.repeat(50));
console.log('ALL TESTS COMPLETED');
console.log('='.repeat(50));