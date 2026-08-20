const path = require("path"); const fs = require("fs").promises;
class ImageParser {
  async parse(filePath, options) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".tiff") {
      return { success: true, layout: { type: "image", pageCount: 1, dimensions: { width: 800, height: 600 }, pages: [{ pageNumber: 1, dimensions: { width: 800, height: 600 }, elements: [] }] } };
    }
    return { success: false, error: "Unsupported format" };
  }
}
module.exports = { ImageParser };
