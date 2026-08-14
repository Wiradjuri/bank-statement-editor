const path = require('path');
const mammoth = require('mammoth');
const fs = require('fs').promises;

/**
 * DOCX Parser for Document Layout Preservation
 */
class DocxParser {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = options;
  }

  /**
   * Extract text runs from DOCX for text element creation
   */
  async extractRuns(textItems) {
    const runs = [];
    
    textItems.forEach(item => {
      if (item.text) {
        runs.push({
          text: item.text,
          style: item.style,
          children: item.children || []
        });
      }
    });

    // Group consecutive same-style runs
    if (runs.length === 0) return [];
    
    const grouped = [];
    let currentGroup = { ...runs[0], position: 0 };
    
    for (let i = 1; i < runs.length; i++) {
      if (runs[i].style === currentGroup.style) {
        currentGroup.text += runs[i].text;
        currentGroup.position += runs[i].text.length;
      } else {
        grouped.push(currentGroup);
        currentGroup = { ...runs[i], position: 0 };
      }
    }
    grouped.push(currentGroup);
    
    return grouped.map((run, idx) => ({
      id: `run-${idx}`,
      text: run.text,
      style: run.style,
      startIndex: run.position,
      endIndex: run.position + run.text.length,
      position: {
        index: idx
      }
    }));
  }

  /**
   * Replace text in DOCX preserving formatting
   */
  async replaceText(paragraphId, newText, style = {}) {
    const outputPath = this.filePath.replace(
      path.extname(this.filePath),
      '-modified' + path.extname(this.filePath)
    );
    
    await fs.access(this.filePath);
    const arrayBuffer = await fs.readFile(this.filePath);
    
    // DOCX text replacement is a simplification - full preservation would require docx layer
    // This is a basic implementation that preserves structure
    
    const result = await mammoth.convertToHtml({
      arrayBuffer,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh"
      ]
    });
    
    let html = result.value;
    
    // Replace paragraphs matching search criteria
    if (paragraphId) {
      const htmlLines = html.split('\n');
      const newParagraph = `<p style="${this.styleToString(style)}">${newText}</p>`;
      
      html = htmlLines.join('\n');
    }
    
    // Try to replace in HTML
    const regex = /<p[^>]*>.*?<\/>/g;
    const lines = html.split('\n');
    const modified = lines.map(line => {
      if (regex.test(line)) {
        return `<p style="${this.styleToString(style)}">${newText}</p>`;
      }
      return line;
    });
    
    html = modified.join('\n');
    
    // Convert back to docx - this is approximate
    return {
      success: true,
      html,
      warning: 'DOCX formatting preservation is approximate - consider using more robust library'
    };
  }

  /**
   * Convert style object to CSS string
   */
  styleToString(style) {
    const styles = [];
    if (style.fontSize) styles.push(`font-size: ${style.fontSize}pt`);
    if (style.bold) styles.push('font-weight: bold');
    if (style.italic) styles.push('font-style: italic');
    if (style.color) styles.push(`color: ${style.color}`);
    return styles.join(';');
  }

  /**
   * Parse DOCX document for layout extraction
   */
  async parse() {
    try {
      await fs.access(this.filePath);
      const arrayBuffer = await fs.readFile(this.filePath);
      
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      const messages = result.messages;
      
      // Estimate content based on text length
      const estimatedParagraphs = Math.max(1, Math.floor(text.split(/\n\n+/).length));
      const estimatedWidth = 8960; // DOCX default character width
            
      const layout = {
        type: 'docx',
        pageCount: estimatedParagraphs,
        dimensions: {
          width: estimatedWidth,
          height: estimatedParagraphs * 360 // Rough approximation
        },
        pages: [{
          pageNumber: 1,
          dimensions: {
            width: estimatedWidth,
            height: 3600
          },
          elements: this.buildElementsFromText(text)
        }],
        metadata: {
          createdBy: 'Document Layout Preservation System',
          version: '1.0.0',
          format: 'DOCX',
          wordCount: text.split(/\s+/).length
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

  /**
   * Build elements from plain text
   */
  buildElementsFromText(text) {
    if (!text || text.trim() === '') return [];
    
    const paragraphs = text.split(/(?=\s*\n)/).filter(p => p.trim());
    
    return paragraphs.slice(0, 50).map((para, idx) => {
      // Detect heading styles
      const headerMatch = para.match(/^#{1,6}\s+/);
      const type = headerMatch ? 'heading' : 
                   para.match(/^\d\./) ? 'numbered-list' : 
                   para.startsWith('(') ? 'bullet-point' : 'paragraph';
      
      return {
        id: `element-${idx}`,
        type,
        content: para.trim(),
        position: {
          point: {
            x: 100,
            y: idx * 30 + 50,
            width: estimatedWidth - 200,
            height: 24
          }
        },
        style: {
          fontSize: headerMatch ? 18 : headerMatch ? 16 : 12,
          isBold: false,
          isItalic: false,
          color: '#000000'
        },
        selectionMode: 'text'
      };
    });
  }
}

module.exports = { DocxParser };