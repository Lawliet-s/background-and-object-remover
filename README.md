# Background Remover - AI Powered

A modern, professional background remover web application that runs entirely in the browser. No backend, no API keys, no uploads to external servers — complete privacy.

## Features

- **AI-Powered**: Uses BiRefNet segmentation model via Transformers.js (ONNX Runtime)
- **100% Client-Side**: All processing happens in your browser
- **Preserve Original Quality**: Downloads maintain original resolution (up to 4K+)
- **Drag & Drop**: Intuitive file upload
- **Before/After Slider**: Interactive comparison
- **Background Editor**: Preset colors + custom color picker
- **Download Options**: Transparent PNG or JPG with custom background
- **Dark/Light Mode**: Theme toggle with persistent preference
- **Keyboard Shortcuts**: Ctrl+O (upload), Ctrl+S (download), Delete (reset)
- **Copy to Clipboard**: Quick copy support
- **Recent Images**: Local storage for recently processed images
- **No Backend Required**: Fully static, deployable to Vercel

## Supported Formats

- PNG, JPG, JPEG, WEBP
- Max file size: 10MB

## Getting Started

### Local Development

Simply serve the directory with any static file server:

```bash
# Using Python
python3 -m http.server 5173

# Using Node.js (npx)
npx serve .
```

Then open `http://localhost:5173` in your browser.

### Deployment

Deploy to Vercel with zero configuration:

```bash
npm i -g vercel
vercel --prod
```

Or connect your Git repository to Vercel for automatic deployments.

## How It Works

1. Upload an image via drag-and-drop or file picker
2. Click "Remove Background"
3. The AI model (BiRefNet) processes the image locally
4. Preview the result with the interactive before/after slider
5. Change the background color or keep it transparent
6. Download as PNG (transparent) or JPG (with background color)

## Technology Stack

- **HTML5 / CSS3** — Modern, responsive UI with glassmorphism design
- **Vanilla JavaScript (ES Modules)** — Modular architecture
- **Canvas API** — Image processing and compositing
- **Transformers.js** — Browser-native machine learning runtime
- **BiRefNet** — High-resolution dichotomous image segmentation model
- **ONNX Runtime Web** — WebGPU / WASM inference backend

## Project Structure

```
background-remover/
├── index.html          # Main entry point
├── css/
│   └── style.css       # All styles (dark/light themes, responsive)
├── js/
│   ├── app.js          # Application orchestrator
│   ├── upload.js       # File upload and drag-drop handling
│   ├── remove.js       # Transformers.js model integration
│   ├── editor.js       # Preview, comparison slider, downloads
│   └── storage.js      # LocalStorage management
├── assets/
│   └── icons/          # Icon assets
├── vercel.json         # Vercel deployment configuration
└── README.md           # Documentation
```

## Browser Support

- Chrome 113+ (WebGPU support recommended)
- Firefox 120+
- Edge 113+
- Safari 17+

## License

MIT
