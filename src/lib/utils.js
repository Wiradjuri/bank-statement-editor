/**
 * Utility functions for Document Layout Preservation System
 */

/**
 * Sanitize HTML content
 */
function sanitizeHtml(html) {
  if (!html) return '';
  
  const dompurify = require('dompurify');
  const { JSDOM } = require('jsdom');
  
  const window = new JSDOM('').window;
  global.window = window;
  global.document = window.document;
  
  const dom = dompurify(window);
  const sanitized = dompurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div']
  });
  
  delete global.window;
  delete global.document;
  
  return sanitized;
}

/**
 * Truncate text for preview
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

/**
 * Measure text width
 */
function measureTextWidth(text, fontSize = 12, fontFamily = 'Arial') {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format date
 */
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toISOString();
}

/**
 * Generate unique ID
 */
function generateId(prefix = 'element') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Calculate similarity between two layouts
 */
function calculateLayoutSimilarity(layoutA, layoutB) {
  const elementsA = layoutA.pages?.[0]?.elements || [];
  const elementsB = layoutB.pages?.[0]?.elements || [];
  
  let matchingElements = 0;
  let totalElements = Math.max(elementsA.length, elementsB.length);
  
  elementsA.forEach(elA => {
    const elB = elementsB.find(e => e.id === elA.id);
    if (elB) {
      // Check if elements match
      const positionsMatch = elA.position?.point?.x === elB.position?.point?.x &&
                            elA.position?.point?.y === elB.position?.point?.y;
      const typeMatch = elA.type === elB.type;
      
      if (positionsMatch && typeMatch) matchingElements++;
    }
  });
  
  return matchingElements / totalElements;
}

/**
 * Find text position in content for edit operations
 */
function findTextPosition(content, searchText, options = {}) {
  const regex = new RegExp(`(${searchText})`, options.caseSensitive ? 'g' : 'gi');
  const matches = [...content.matchAll(regex)];
  
  if (matches.length === 0) {
    return null;
  }
  
  // Find first occurrence
  const match = matches[0];
  return {
    start: match.index,
    end: match.index + searchText.length,
    matchedText: match[0],
    allMatches: matches.map(m => ({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0]
    }))
  };
}

/**
 * Batch process items with concurrency control
 */
async function batchProcess(items, processFn, concurrency = 5) {
  const results = [];
  const queue = [...items];
  
  const run = async () => {
    const item = queue.shift();
    if (!item) return;
    
    try {
      results.push(await processFn(item));
    } catch (error) {
      results.push({ success: false, error: error.message, item });
    }
    
    return run();
  };
  
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, concurrency); i++) {
    workers.push(run());
  }
  
  await Promise.all(workers);
  return results;
}

/**
 * Save layout to storage
 */
function saveLayout(layout, label) {
  const layouts = parseLayouts();
  const newLayout = {
    id: generateId('layout'),
    name: label || `Layout ${layouts.length + 1}`,
    data: deepClone(layout),
    createdAt: formatDate(),
    updatedAt: formatDate()
  };
  
  layouts.push(newLayout);
  localStorage.setItem('documentLayouts', JSON.stringify(layouts));
  return newLayout;
}

/**
 * Load all layouts from storage
 */
function parseLayouts() {
  try {
    if (typeof localStorage !== 'undefined') {
      const data = localStorage.getItem('documentLayouts');
      return data ? JSON.parse(data) : [];
    }
    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Render simple table HTML
 */
function renderTable(headers, rows) {
  const headerRow = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  const bodyRow = rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
  
  return `<table border="1" style="border-collapse: collapse; width: 100%;">
    ${headerRow}${bodyRow}
  </table>`;
}

module.exports = {
  sanitizeHtml,
  truncateText,
  measureTextWidth,
  debounce,
  formatDate,
  generateId,
  deepClone,
  calculateLayoutSimilarity,
  findTextPosition,
  batchProcess,
  saveLayout,
  parseLayouts,
  renderTable
};