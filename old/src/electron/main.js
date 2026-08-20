/**
 * Document Layout Preservation System - Main Application
 */

const path = require("path");
const fs = require("fs").promises;
const { app, BrowserWindow, ipcMain } = require("electron");
const { parseDocument, preserveLayout, calculateFps, createFingerprint } = require("../core/layout-measures");
const { PdfParser } = require("../parse/pdf-parser");
const { DocxParser } = require("../parse/docx-parser");
const { ImageParser } = require("../parse/image-parser");

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: "#f5f5f5"
  });

  mainWindow.loadFile("public/index.html");
}

// IPC Handlers
ipcMain.handle("load-document", async (event, { filePath, options }) => {
  try {
    const fileExtension = path.extname(filePath).toLowerCase();
    let layout;
    
    switch (fileExtension) {
      case ".pdf":
        layout = await new PdfParser(filePath, options).parse();
        break;
      case ".docx":
        layout = await new DocxParser(filePath, options).parse();
        break;
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".tiff":
        layout = await new ImageParser(filePath, options).parse();
        break;
      default:
        throw new Error("Unsupported file format");
    }

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
});

ipcMain.handle("select-element", async (event, elementId) => {
  return { success: true, elementId };
});

ipcMain.handle("update-element", async (event, { elementId, newContent }) => {
  return { success: true, elementId };
});

ipcMain.handle("export-document", async (event, { elementIds, outputPath, format }) => {
  return { success: true, outputPath };
});

ipcMain.handle("calculate-fps", async (event, regionData) => {
  return { success: true, fpsInfo: calculateFps(regionData) };
});

ipcMain.handle("apply-layout-preservation", async (event, { originalLayout, changes }) => {
  return { success: true, preservedLayout: preserveLayout(originalLayout, changes) };
});

ipcMain.handle("create-fingerprint", async (event, layout) => {
  return { success: true, fingerprint: createFingerprint(layout) };
});

ipcMain.handle("verify-layout", async (event, { layoutA, layoutB }) => {
  let diffs = [];
  const elementsA = layoutA.elements || [];
  const elementsB = layoutB.elements || [];
  
  elementsA.forEach(elA => {
    const elB = elementsB.find(e => e.id === elA.id);
    if (elB) {
      if (elA.position.point.x !== elB.position.point.x ||
          elA.position.point.y !== elB.position.point.y) {
        diffs.push({ type: "position", severity: "low" });
      }
    } else if (elB === undefined) {
      diffs.push({ type: "missing", severity: "high" });
    }
  });
  
  return {
    isPreserved: diffs.filter(d => d.severity !== "high").length === 0,
    diffs
  };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

module.exports = { app, BrowserWindow };
