const generateId = require('../lib/utils').generateId;

/**
 * UI Controller for Document Layout Preservation System
 */
class LayoutUI {
  constructor() {
    this.elements = new Map();
    this.activeElement = null;
    this.selectedElements = new Set();
  }

  initialize(layout) {
    this.elements.clear();
    this.selectedElements.clear();
    this.activeElement = null;
    
    if (layout.pages) {
      layout.pages.forEach(page => {
        (page.elements || []).forEach(element => {
          this.elements.set(element.id, element);
        });
      });
    }
    
    return this.elements.size;
  }

  findElement(query) {
    const map = this.elements;
    if (typeof query === 'string') {
      return Array.from(map.values()).find(el => String(el.content || '').toLowerCase().includes(query.toLowerCase()));
    }
    if (typeof query === 'number') return Array.from(map.values())[query];
    if (typeof query === 'object' && query.id) return map.get(query.id);
    return null;
  }

  getAllElements() { return Array.from(this.elements.values()); }

  getElementsByType(type) {
    return Array.from(this.elements.values())
      .filter(el => el.type === type)
      .sort((a, b) => (a.position?.point?.y || a.position?.index || 0) - (b.position?.point?.y || b.position?.index || 0));
  }

  getElementsInRegion(region) {
    return Array.from(this.elements.values())
      .filter(el => this.isElementInRegion(el, region));
  }

  isElementInRegion(element, region) {
    const pos = element.position?.point || { x: 0, y: 0, width: 0, height: 0 };
    const inX = pos.x >= region.x && pos.x + (pos.width || 100) <= region.x + region.width;
    const inY = pos.y >= region.y && pos.y + (pos.height || 20) <= region.y + region.height;
    return inX && inY;
  }

  selectElement(elementId) {
    this.selectedElements.add(elementId);
    this.activeElement = elementId;
    return this.selectedElements.size;
  }

  deselectElement(elementId) {
    this.selectedElements.delete(elementId);
    return this.selectedElements.size;
  }

  selectAll() {
    this.selectedElements = new Set(this.elements.keys());
    return this.selectedElements.size;
  }

  deselectAll() {
    this.selectedElements.clear();
    this.activeElement = null;
  }

  getSelectedElements() {
    return Array.from(this.selectedElements).map(id => this.elements.get(id)).filter(el => el !== undefined);
  }

  updateElement(elementId, newContent) {
    const element = this.elements.get(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    element.content = newContent;
    element.lastModified = new Date().toISOString();
    return element;
  }

  deleteSelectedElements() {
    const elementsToDelete = this.getSelectedElements();
    elementsToDelete.forEach(el => {
      this.elements.delete(el.id);
      this.selectedElements.delete(el.id);
    });
    return elementsToDelete.length;
  }

  moveElement(elementId, deltaX, deltaY) {
    const element = this.elements.get(elementId);
    if (!element) throw new Error(`Element not found: ${elementId}`);
    if (element.position?.point) {
      element.position.point.x += deltaX;
      element.position.point.y += deltaY;
    }
    return element;
  }

  batchUpdateProperties(updates) {
    let updatedCount = 0;
    this.selectedElements.forEach(elementId => {
      const element = this.elements.get(elementId);
      if (!element) return;
      if (updates.color) element.style.color = updates.color;
      if (updates.fontSize) element.style.fontSize = updates.fontSize;
      if (updates.bold !== undefined) element.style.bold = updates.bold;
      if (updates.italic !== undefined) element.style.italic = updates.italic;
      updatedCount++;
    });
    return updatedCount;
  }

  createEmptyElement(type = 'text', options = {}) {
    return {
      id: generateId('element'),
      type,
      content: options.content || '',
      position: options.position || { point: { x: 100, y: 100, width: 200, height: 20 } },
      style: options.style || { fontSize: 12, isBold: false, isItalic: false },
      selectionMode: options.selectionMode || 'text',
      lastModified: new Date().toISOString()
    };
  }
}

module.exports = {
  LayoutUI
};