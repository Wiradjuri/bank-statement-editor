# Document Layout Preservation System

A cross-platform desktop application built with Electron and TypeScript that preserves the layout of documents—particularly bank statements and financial documents—while allowing for content editing, layout analysis, and export functionality.

## Features

- **Multi-Format Document Parsing**: Supports PDF, DOCX, and image files
- **Layout Preservation**: Extracts and maintains document structure including text hierarchy, font sizes, colors, and positioning
- **Bank Statement Analysis**: Built-in functionality for extracting statement information such as:
  - Account numbers
  - Statement periods
  - Bank names
  - Account balances
- **Editor Interface**: Visual interface for selecting, editing, and manipulating document elements
- **Layout Fingerprinting**: Automatically detect changes in document structure
- **Export Capabilities**: Export documents in various formats

## Project Structure

```
bank-statement-editor/
├── src/
│   ├── core/                # Core layout preservation engine
│   │   └── layout-measures.js
│   ├── electron/            # Electron main process
│   │   └── main.js
│   ├── parse/               # Document format parsers
│   │   ├── pdf-parser.js
│   │   ├── docx-parser.js
│   │   └── image-parser.js
│   ├── preserver/           # Layout preservation utilities
│   │   ├── layout-preserver.js
│   │   └── layout-cache.js
│   ├── ui/                  # UI components
│   │   ├── layout-ui.js
│   │   └── renderer-controller.js
│   └── lib/                 # Utility functions
│       └── utils.js
├── public/                  # Static assets and HTML
│   └── index.html
├── test/                    # Unit tests
│   └── unit-tests.js
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Usage

1. Launch the application
2. Click "Open" to load a new document (PDF, DOCX, or image files are supported)
3. Use the sidebar to manage document elements:
   - View document information (file name, page count)
   - Select elements for editing
   - Open elements in the editor
4. Click on elements in the document view to select them
5. Edit content, style, or properties as needed
6. Export the document when finished

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Compile TypeScript and launch Electron in development mode |
| `npm run build` | Compile TypeScript and build the application for distribution |
| `npm test` | Run unit tests |

## Dependencies

### Core Dependencies
- `electron` - Desktop application framework
- `pdf-lib` - PDF manipulation and reading
- `dompurify` - HTML sanitization
- `mammoth` - DOCX document parsing
- `sharp` - Image processing
- `typescript` - Language support and compilation

## License

ISC

## Author

Brad Murray
bmuzza1992@gmail.com