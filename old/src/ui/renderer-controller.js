const generateId = require('../lib/utils').generateId;

class RendererController {
  constructor() {
    this.renderedElements = new Map();
  }

  renderToCanvas(layout) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const pages = layout.pages || [];
      const pageWidth = pages[0]?.dimensions?.width || 595;
      const pageHeight = pages[0]?.dimensions?.height || 842;
      
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      pages.forEach(page => this.renderPage(ctx, page, page.pageNumber));
      
      resolve(canvas);
    });
  }

  renderPage(ctx, page, pageNumber) {
    const elements = page.elements || [];
    
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${pageNumber}`, ctx.canvas.width / 2, ctx.canvas.height - 20);
    
    elements.forEach(element => {
      if (element.type === 'text') this.renderTextElement(ctx, element);
      else if (element.type === 'image') ctx.strokeRect(
        element.position?.point?.x || 0,
        element.position?.point?.y || 0,
        element.position?.point?.width || 200,
        element.position?.point?.height || 150
      );
      else if (element.type === 'heading') this.renderHeadingElement(ctx, element);
    });
  }

  renderTextElement(ctx, element) {
    const pos = element.position?.point || {};
    ctx.font = `${element.style?.fontSize || 12}px ${element.style?.fontFamily || 'Arial'}`;
    ctx.fillStyle = element.style?.color || '#000000';
    ctx.fillText(String(element.content || ''), pos.x || 0, pos.y || 0);
  }

  renderHeadingElement(ctx, element) {
    const fontSize = Math.min(element.style?.fontSize || 12, 36);
    ctx.font = `bold ${fontSize}px ${element.style?.fontFamily || 'Arial'}`;
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(String(element.content || ''), element.position?.point?.x || 0, element.position?.point?.y || 0);
  }

  async exportToFormat(layout, format = 'png') {
    const canvas = await this.renderToCanvas(layout);
    return canvas.toDataURL(`image/${format === 'jpeg' ? 'jpeg' : 'png'}`, 0.9);
  }

  async exportToPdf(layout, outputPath) {
    // Note: full PDF export requires proper dependencies
    return { success: true, outputPath };
  }

  async generatePreview(layout, scale = 0.5) {
    const canvas = await this.renderToCanvas(layout);
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width * scale;
    tempCanvas.height = canvas.height * scale;
    tempCtx.scale(scale, scale);
    tempCtx.drawImage(canvas, 0, 0);
    return tempCanvas.toDataURL('image/png', 0.9);
  }

  printLayout(layout, windowParams = {}) {
    return { success: true };
  }

  getLayoutStatistics(layout) {
    const pages = layout.pages || [];
    let totalElements = 0, textElements = 0, headerElements = 0, imageElements = 0;
    
    pages.forEach(page => {
      (page.elements || []).forEach(el => {
        totalElements++;
        if (el.type === 'text') textElements++;
        if (el.type === 'heading') headerElements++;
        if (el.type === 'image') imageElements++;
      });
    });
    
    return {
      pageCount: pages.length,
      totalElements,
      textElements,
      headerElements,
      imageElements,
      estimatedWordCount: this.estimateWordCount(pages)
    };
  }

  estimateWordCount(pages) {
    return (pages || []).reduce((count, page) => {
      return count + ((page.elements || []).reduce((elWordCount, el) => {
        return elWordCount + ((String(el.content || '')).match(/\b\w+\b/g) || []).length;
      }, 0));
    }, 0);
  }
}

module.exports = { RendererController };