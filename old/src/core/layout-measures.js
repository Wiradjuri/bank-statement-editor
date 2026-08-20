/**
 * Core Layout Preservation Engine
 */

const path = require("path");
const fs = require("fs").promises;
const { PDFDocument, rgb } = require("pdf-lib");

class LayoutPreservationEngine {
  constructor() {
    this.layoutMap = new Map();
    this.fingerprintCache = new Map();
  }

  /**
   * Simple document fingerprint for fast layout comparison
   */
  createFingerprint(layout) {
    const fp = {
      regions: [],
      elementIds: new Set(),
      pageInfo: [],
      elementTypes: {}
    };
    
    (layout.pages || []).forEach((page, idx) => {
      fp.pageInfo.push({
        pageNum: page.pageNumber,
        width: page.dimensions.width,
        height: page.dimensions.height,
        elementCount: page.elements.length
      });
      
      page.elements.forEach(el => {
        fp.elementIds.add(el.id);
        const type = el.type || "other";
        fp.elementTypes[type] = (fp.elementTypes[type] || 0) + 1;
      });
    });
    
    return JSON.stringify(fp);
  }

  /**
   * Calculate First Paragraph Search (FPS) regions for bank statements
   */
  calculateFps(regionData) {
    const fpsInfo = {
      accountNumber: null,
      accountName: null,
      statementPeriod: null,
      bankName: null,
      balance: null,
      date: null
    };

    const text = regionData.text || "";
    
    // Pattern matching for account number (9-10 digits)
    const accountMatch = text.match(/(d{9,10})/);
    if (accountMatch) fpsInfo.accountNumber = accountMatch[1];

    // Pattern matching for statement period
    const periodMatch = text.match(/(d{1,2}[/.-]d{1,2}[/.-]d{2,4})/g);
    if (periodMatch) fpsInfo.statementPeriod = periodMatch.join(", ");

    // Pattern matching for account name
    const nameMatch = text.match(/(?:account|acct)[:\s ]+([A-Za-z\s]+?)(?:number|acct.\d)/i);
    // Pattern matching for bank name
    const bankMatch = text.match(/(?:bank|financial[^[:space:]]*)(?:[:s])?([A-Zs]+)/i);
    if (bankMatch) fpsInfo.bankName = bankMatch[1].trim();

    return fpsInfo;
  }

  /**
   * Apply layout preservation to modified document
   */
  preserveLayout(originalLayout, changes) {
    const preserved = { ...originalLayout };
    preserved.elements = originalLayout.elements.map(originalEl => {
      const change = changes.find(c => c.elementId === originalEl.id);
      
      if (change) {
        // Create a clone of the element preserving original formatting
        return {
          ...originalEl,
          content: change.newContent || originalEl.content,
          lastModified: new Date().toISOString()
        };
      }
      return originalEl;
    });
    
    return preserved;
  }

  /**
   * Build a layout map for fast element lookup
   */
  buildLayoutMap(layout) {
    this.layoutMap.clear();
    
    (layout.pages || []).forEach(page => {
      (page.elements || []).forEach(el => {
        this.layoutMap.set(el.id, {
          ...el,
          pageInfo: page.pageNumber,
          pageRef: page
        });
      });
    });
    
    return this.layoutMap;
  }

  /**
   * Get element by ID from layout map
   */
  getElement(elementId) {
    return this.layoutMap.get(elementId);
  }

  /**
   * Batch update elements by selection pattern
   */
  batchUpdateElements(layout, pattern, replacementFunction) {
    const updatedElements = (layout.elements || []).map((el, idx) => {
      if (pattern.test(el.content || "")) {
        const query = pattern.exec(el.content || "");
        const newContent = replacementFunction(el.content, query, idx);
        return {
          ...el,
          content: newContent
        };
      }
      return el;
    });
    
    return { ...layout, elements: updatedElements };
  }

  /**
   * Render PDF document with modified content
   */
  async renderPdfPreservingLayout(originalPdfPath, pdfPath, modifications) {
    try {
      const pdfDoc = await PDFDocument.load(await fs.readFile(originalPdfPath));
      
      modifications.forEach(mod => {
        const page = pdfDoc.getPage(mod.pageIndex);
        
        // Find and modify text
        page.drawText(mod.newContent, {
          x: mod.x,
          y: mod.y,
          size: mod.size || 12,
          font: pdfDoc.getFont(mod.fontName),
          color: rgb(0, 0, 0)
        });
      });
      
      await pdfDoc.save();
      await fs.writeFile(pdfPath, await pdfDoc.save());
      
      return { success: true, outputPath: pdfPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Parse and detect document structure
 */
async function parseDocument(filepath, options = {}) {
  const extension = path.extname(filepath).toLowerCase();
  
  switch (extension) {
    case ".pdf":
      return {
        type: "pdf",
        pages: [],
        elements: []
      };
    case ".docx":
      return {
        type: "docx",
        pages: [],
        elements: []
      };
    case ".png":
      return {
        type: "image",
        pages: [],
        elements: []
      };
    default:
      throw new Error("Unsupported file format");
  }
}

// Create singleton instance
const layoutEngine = new LayoutPreservationEngine();

module.exports = {
  LayoutPreservationEngine,
  parseDocument,
  preserveLayout: layoutEngine.preserveLayout.bind(layoutEngine),
  calculateFps: layoutEngine.calculateFps.bind(layoutEngine),
  createFingerprint: layoutEngine.createFingerprint.bind(layoutEngine),
  layoutEngine
};
