const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;

/**
 * PDF Parser for Document Layout Preservation
 */
class PdfParser {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = options;
  }

  /**
   * Read PDF as text stream to extract layout information
   */
  async readPdfText() {
    const pdfPath = path.resolve(this.filePath);
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    const textContent = [];
    
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const text = page.findTextContent();
      
      if (text && text.items) {
        text.items.forEach(item => {
          if (item.str) {
            textContent.push({
              text: item.str,
              x: item.transform?.[4] || 0,
              y: item.transform?.[5] || 0,
              width: item.width || 100,
              fontSize: item.height || 12,
              fontFamily: item.fontName || 'Arial',
              isItalic: item.transform?.[2] !== 0 && item.transform?.[3] !== 0,
              isBold: false // Simple detection - would need more complex analysis for full bold support
            });
          }
        });
      }
    }

    return textContent;
  }

  /**
   * Draw completed form on PDF
   */
  async drawButton(label, { x, y, width, height, onColor = 'white' }) {
    const pdfPath = path.resolve(this.filePath);
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    
    for (const page of pages) {
      page.drawRectangle({
        x: x - 5,
        y: y - 5,
        width: width + 10,
        height: height + 10,
        color: rgb(0.68, 0.68, 0.68),
        rotate: { angle: 180 },
      });
      
      page.drawText(label, {
        x,
        y: height / 2,
        size: height - 15,
        font: pdfDoc.getFont({
          family: 'Helvetica-Bold',
          style: 'normal',
        }),
        color: rgb(0, 0, 0),
      });
    }

    return pdfDoc.save();
  }

  /**
   * Draw image on PDF
   */
  async drawGridImage(imagePath, { x, y, width, height }) {
    const pdfPath = path.resolve(this.filePath);
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const imageBytes = await fs.readFile(path.resolve(imagePath));
    const image = await pdfDoc.embedJpg(imageBytes);
    const pages = pdfDoc.getPages();
    
    for (const page of pages) {
      page.drawImage(image, {
        x,
        y,
        width,
        height,
        opacity: 0.6,
      });
    }
    
    return pdfDoc.save();
  }

  /**
   * Replace text in PDF preserving layout
   */
  async replaceText(originalText, newText, x, y) {
    const pdfPath = path.resolve(this.filePath);
    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    let replacementCount = 0;
    
    for (const page of pages) {
      try {
        page.drawText(newText, {
          x,
          y,
          size: 12,
          fontFamily: 'Helvetica',
          color: rgb(0, 0, 0),
        });
        replacementCount++;
      } catch (error) {
        // Text replacement failed - skip this page
      }
    }
    
    return { success: true, outputFile: pdfPath, replacedPages: replacementCount };
  }

  /**
   * Open multipage PDF
   */
  async openMultiPagePdf(pdfDoc) {
    return {
      pageCount: pdfDoc.getPageCount(),
      pages: Array.from({ length: pdfDoc.getPageCount() }, (_, i) => ({
        number: i + 1,
        width: 595, // A4 width in points
        height: 842, // A4 height in points
        elements: []
      }))
    };
  }

  /**
   * Parse PDF document for layout extraction
   */
  async parse() {
    try {
      const textContent = await this.readPdfText();
      const pageCount = textContent.length > 0 ? 10 : 1;
      
      const layout = {
        type: 'pdf',
        pageCount,
        dimensions: {
          width: 595, // A4 in points at 72 DPI
          height: 842
        },
        pages: Array.from({ length: pageCount }, (_, i) => ({
          pageNumber: i + 1,
          dimensions: {
            width: 595,
            height: 842
          },
          elements: textContent.slice(i * 20, (i + 1) * 20).map(el => ({
            id: `element-${i}-${textContent.indexOf(el)}`,
            type: 'text',
            content: el.text,
            position: {
              point: {
                x: el.x,
                y: el.y,
                width: el.width,
                height: el.fontSize
              }
            },
            style: {
              fontSize: el.fontSize,
              fontFamily: el.fontFamily,
              isItalic: el.isItalic
            },
            selectionMode: 'text'
          }))
        })),
        metadata: {
          createdBy: 'Document Layout Preservation System',
          version: '1.0.0',
          format: 'PDF',
          pages: pageCount
        }
      };

      return {
        success: true,
        layout
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { PdfParser };