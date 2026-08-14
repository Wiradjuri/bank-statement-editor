const { deepClone, generateId } = require('../lib/utils');

/**
 * Preserver for Document Layout Preservation
 */
class LayoutPreserver {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistorySize = 50;
  }

  /**
   * Create a copy of the layout for editing
   */
  createDraft(layout) {
    return {
      ...deepClone(layout),
      draftId: generateId('draft'),
      createdAt: new Date().toISOString(),
      modified: false
    };
  }

  /**
   * Restore a draft
   */
  restoreDraft(draft, originalLayout) {
    return {
      ...deepClone(originalLayout),
      elements: [...draft.elements],
      modified: true,
      unrecoverableChanges: false
    };
  }

  /**
   * Apply a change to layout elements
   */
  applyChange(layout, change) {
    const updatedLayout = {
      ...layout,
      elements: layout.elements.map(el => {
        if (el.id === change.elementId) {
          return {
            ...el,
            content: change.newContent,
            lastModified: new Date().toISOString()
          };
        }
        return el;
      })
    };
    
    return updatedLayout;
  }

  /**
   * Create a list of changes from an edit operation
   */
  createChanges(oldContent, newContent, selection) {
    return [{
      elementId: selection.elementId,
      oldContent,
      newContent,
      timestamp: new Date().toISOString()
    }];
  }

  /**
   * Undo last operation
   */
  undo(lastOperation) {
    if (!lastOperation) return null;
    
    const { oldContent, newContent, elementId } = lastOperation;
    
    const reversedChange = {
      elementId,
      oldContent: newContent,
      newContent: oldContent,
      timestamp: new Date().toISOString()
    };
    
    return reversedChange;
  }

  /**
   * Redo an operation
   */
  redo(lastOperation) {
    return {
      ...lastOperation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Apply multiple transformations to layout
   */
  applyMultipleTransformations(layout, transformations) {
    let result = layout;
    
    transformations.forEach(transformation => {
      if (transformation.type === 'replace') {
        result = this.replaceText(result, transformation);
      } else if (transformation.type === 'transform') {
        result = this.transformContent(result, transformation);
      }
    });
    
    return result;
  }

  /**
   * Replace text in layout
   */
  replaceText(layout, { elementId, oldText, newText, preserveFormatting = true }) {
    const updatedElements = layout.elements.map(el => {
      if (el.id === elementId) {
        if (preserveFormatting) {
          return {
            ...el,
            content: newText,
            lastModified: new Date().toISOString()
          };
        } else {
          return {
            ...el,
            content: newText,
            type: 'custom',
            lastModified: new Date().toISOString()
          };
        }
      }
      return el;
    });
    
    return {
      ...layout,
      elements: updatedElements
    };
  }

  /**
   * Transform content based on pattern matching
   */
  transformContent(layout, { pattern, replacement, elementId = null }) {
    const updatedElements = layout.elements.map(el => {
      const id = elementId || el.id;
      const content = el.content || '';
      
      if (pattern && pattern.test(content)) {
        return {
          ...el,
          content: content.replace(pattern, replacement),
          lastModified: new Date().toISOString(),
          transformed: true
        };
      }
      
      return el;
    });
    
    return {
      ...layout,
      elements: updatedElements
    };
  }

  /**
   * Merge two layouts
   */
  mergeLayouts(primaryLayout, secondaryLayout, options = {}) {
    const merged = {
      ...primaryLayout,
      pages: []
    };
    
    const mergeMethod = options.mergeMethod || 'concat';
    
    if (mergeMethod === 'concat') {
      const allPages = new Map();
      
      (primaryLayout.pages || []).forEach(page => {
        allPages.set(`${page.pageNumber}`, page);
      });
      
      (secondaryLayout.pages || []).forEach(page => {
        const key = `${page.pageNumber};${page.dimensions.width};${page.dimensions.height}`;
        if (!allPages.has(page.pageNumber)) {
          allPages.set(page.pageNumber, page);
        }
      });
      
      merged.pages = Array.from(allPages.values()).sort((a, b) => a.pageNumber - b.pageNumber);
    } else if (mergeMethod === 'primary') {
      merged.pages = [...primaryLayout.pages || []];
    }
    
    return merged;
  }

  /**
   * Export layout for further processing
   */
  prepareForExport(layout, format = 'json') {
    if (format === 'json') {
      return {
        ...layout,
        exportTime: new Date().toISOString(),
        version: layout.metadata?.version || '1.0.0'
      };
    }
    
    return layout;
  }

  /**
   * Validate layout integrity
   */
  validateLayout(layout) {
    const issues = [];
    
    if (!layout) {
      issues.push('Layout is null or undefined');
    }
    
    if (!layout.type) {
      issues.push('Missing layout type');
    }
    
    if (!layout.pages || !Array.isArray(layout.pages)) {
      issues.push('Layout must have a pages array');
    }
    
    layout.pages.forEach((page, idx) => {
      if (!page.pageNumber) {
        issues.push(`Page ${idx + 1} must have a page number`);
      }
      
      if (!page.elements || !Array.isArray(page.elements)) {
        issues.push(`Page ${idx + 1} must have an elements array`);
      }
      
      page.elements.forEach((el, elIdx) => {
        if (!el.id) {
          issues.push(`Element ${idx + 1}, ${elIdx + 1} must have an ID`);
        }
      });
    });
    
    return {
      isValid: issues.length === 0,
      issues,
      warnings: []
    };
  }
}

module.exports = {
  LayoutPreserver
};