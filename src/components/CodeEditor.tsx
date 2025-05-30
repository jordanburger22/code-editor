import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import esbuild from 'esbuild-wasm';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { Box, IconButton, CircularProgress, Typography, TextField } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TerminalIcon from '@mui/icons-material/Terminal';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { styled } from '@mui/material/styles';
import { useEditor } from '../hooks/useEditor';
import { TabBar } from './TabBar';
import type { FileNode } from '../types/FileNode';
import { unpkgPathPlugin, unpkgFetchPlugin } from '../plugins/esbuildPlugins';

// Initialize esbuild-wasm once
esbuild.initialize({ wasmURL, worker: true });

const StyledPanelResizeHandle = styled(PanelResizeHandle)({
  width: '8px',
  backgroundColor: '#333',
  cursor: 'col-resize',
  transition: 'background-color 0.2s',
  '&:hover': {
    backgroundColor: '#555',
  },
});

const VerticalResizeHandle = styled(PanelResizeHandle)({
  height: '8px',
  backgroundColor: '#333',
  cursor: 'row-resize',
  transition: 'background-color 0.2s',
  '&:hover': {
    backgroundColor: '#555',
  },
});

const BrowserNavbar = styled(Box)(({ theme }) => ({
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  background: 'linear-gradient(to bottom, #3c3c3c, #2c2c2c)',
  borderBottom: '1px solid #1a1a1a',
  padding: '0 8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
}));

const AddressBar = styled(TextField)(({ theme }) => ({
  flex: 1,
  margin: '0 8px',
  '& .MuiInputBase-root': {
    backgroundColor: '#1e1e1e',
    borderRadius: '16px',
    height: '28px',
    padding: '0 12px',
    fontSize: '14px',
    color: '#fff',
  },
  '& .MuiInputBase-input': {
    padding: '0',
    textAlign: 'center',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: '#444',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: '#666',
  },
}));

const TerminalPanel = styled(Box)({
  backgroundColor: '#1e1e1e',
  color: '#fff',
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '14px',
  padding: '8px',
  overflowY: 'auto',
  flex: 1,
  '& .log': { color: '#fff' },
  '& .info': { color: '#2196f3' },
  '& .debug': { color: '#9e9e9e' },
  '& .warn': { color: '#ffeb3b' },
  '& .error': { color: '#f44336' },
});

// Resolve relative paths (e.g., "styles.css" or "script.js" relative to "development/project-1/index.html")
const resolvePath = (basePath: string, relativePath: string): string => {
  const normalize = (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '');
  const base = normalize(basePath);
  const resolved = relativePath.startsWith('./')
    ? `${base}/${relativePath.slice(2)}`
    : `${base}/${relativePath}`;
  return resolved;
};

const throttle = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    lastArgs = args;
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      if (timeout) clearTimeout(timeout);
      timeout = null;
      lastCall = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        lastCall = Date.now();
        if (lastArgs) func(...lastArgs);
      }, remaining);
    }
  };
};

const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

type ConsoleMessage = {
  type: 'log' | 'info' | 'debug' | 'warn' | 'error';
  message: string;
  file: string;
  line: number;
};

export const CodeEditor: React.FC = () => {
  const { fileTree, fileContent, language, updateContent, activeFile, saveFile, lastHtmlFile, showPreview, setShowPreview } = useEditor();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isBundling, setIsBundling] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const styleIdRef = useRef<string>('dynamic-style');
  const lastRenderedHtmlRef = useRef<string | null>(null);
  const assetUrlMapRef = useRef<Map<string, string>>(new Map()); // Map file paths to Blob URLs
  const activeScriptRef = useRef<string | null>(null); // Store active script file path

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco
  ) => {
    editorRef.current = editor;
    editor.focus();
  };

  const collectFiles = useCallback((): { folderFiles: Map<string, string>, allFiles: Map<string, string> } => {
    const folderFiles = new Map<string, string>();
    const allFiles = new Map<string, string>();
    let folderPath = '';

    if (lastHtmlFile?.fullPath) {
      folderPath = lastHtmlFile.fullPath.substring(0, lastHtmlFile.fullPath.lastIndexOf('/'));
    } else if (activeFile?.name.endsWith('.html') && activeFile.fullPath) {
      folderPath = activeFile.fullPath.substring(0, activeFile.fullPath.lastIndexOf('/'));
    }

    const traverse = (node: FileNode, base: string) => {
      const path = node.fullPath || (base ? `${base}/${node.name}` : `development/${node.name}`);
      if (node.type === 'file') {
        allFiles.set(path, node.content ?? '');
        if (folderPath && path.startsWith(folderPath + '/')) {
          folderFiles.set(path, node.content ?? '');
        }
      } else {
        node.children?.forEach(child => traverse(child, path));
      }
    };

    const dev = fileTree.children?.find(n => n.id === 'development-folder');
    if (dev) {
      dev.children?.forEach(child => traverse(child, ''));
    }
    return { folderFiles, allFiles };
  }, [fileTree, activeFile, lastHtmlFile]);

  const updateIframeStyles = useCallback((cssContent: string) => {
    if (!iframeRef.current || !iframeRef.current.contentDocument) return;

    const doc = iframeRef.current.contentDocument;
    let styleElement = doc.getElementById(styleIdRef.current) as HTMLStyleElement;

    if (!styleElement) {
      styleElement = doc.createElement('style');
      styleElement.id = styleIdRef.current;
      doc.head.appendChild(styleElement);
    }

    styleElement.textContent = cssContent;
  }, []);

  const getConsoleOverrideScript = () => `
    <script>
      (function() {
        const originalConsole = window.console;
        const newConsole = {
          log: (...args) => {
            const stack = new Error().stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for console.log: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 1; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            try {
              window.parent.postMessage({ type: 'console', method: 'log', args, line }, '*');
            } catch (e) {
              originalConsole.error('Failed to postMessage for console.log:', e);
            }
            originalConsole.log(...args);
          },
          info: (...args) => {
            const stack = new Error().stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for console.info: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 1; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            try {
              window.parent.postMessage({ type: 'console', method: 'info', args, line }, '*');
            } catch (e) {
              originalConsole.error('Failed to postMessage for console.info:', e);
            }
            originalConsole.info(...args);
          },
          debug: (...args) => {
            const stack = new Error().stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for console.debug: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 1; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            try {
              window.parent.postMessage({ type: 'console', method: 'debug', args, line }, '*');
            } catch (e) {
              originalConsole.error('Failed to postMessage for console.debug:', e);
            }
            originalConsole.debug(...args);
          },
          warn: (...args) => {
            const stack = new Error().stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for console.warn: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 1; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            try {
              window.parent.postMessage({ type: 'console', method: 'warn', args, line }, '*');
            } catch (e) {
              originalConsole.error('Failed to postMessage for console.warn:', e);
            }
            originalConsole.warn(...args);
          },
          error: (...args) => {
            const stack = new Error().stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for console.error: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 1; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            try {
              window.parent.postMessage({ type: 'console', method: 'error', args, line }, '*');
            } catch (e) {
              originalConsole.error('Failed to postMessage for console.error:', e);
            }
            originalConsole.error(...args);
          },
        };
        Object.defineProperty(window, 'console', {
          value: newConsole,
          writable: false,
          configurable: false,
        });
        window.addEventListener('error', (event) => {
          try {
            const stack = event.error?.stack || '';
            try {
              window.parent.postMessage({ type: 'debug', message: 'Stack trace for error: ' + stack }, '*');
            } catch (e) {}
            const lines = stack.split('\\n');
            let line = 0;
            for (let i = 0; i < lines.length; i++) {
              try {
                window.parent.postMessage({ type: 'debug', message: 'Processing error line ' + i + ': ' + lines[i] }, '*');
              } catch (e) {}
              if (lines[i].includes('about:srcdoc')) continue;
              const trimmedLine = lines[i].trim();
              if (trimmedLine.includes('blob:')) {
                const match = trimmedLine.match(/blob:.*:(\\d+):\\d+\\s*$/);
                try {
                  window.parent.postMessage({ type: 'debug', message: 'Match result for error line ' + i + ': ' + (match ? JSON.stringify(match) : 'null') }, '*');
                } catch (e) {}
                if (match) {
                  line = parseInt(match[1], 10);
                  break;
                }
              }
            }
            window.parent.postMessage({
              type: 'error',
              message: event.message,
              stack,
              line,
            }, '*');
          } catch (e) {
            originalConsole.error('Failed to postMessage for error:', e);
          }
        });
      })();
    </script>
  `;

  const getActiveScriptFile = useCallback((htmlContent: string, htmlDir: string, allFiles: Map<string, string>): string | null => {
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = scriptRegex.exec(htmlContent))) {
      const src = match[1];
      const jsPath = resolvePath(htmlDir, src);
      if (allFiles.has(jsPath)) {
        return jsPath;
      }
      const fallbackJsPath = `${htmlDir}/${src.replace(/^\.\//, '')}`;
      if (allFiles.has(fallbackJsPath)) {
        return fallbackJsPath;
      }
    }
    return null;
  }, []);

  const handleConsoleMessage = useCallback((event: MessageEvent) => {
    if (event.data.type === 'test') {
      // Ignore test message
    } else if (event.data.type === 'debug') {
      console.log('Debug:', event.data.message);
    } else if (event.data.type === 'console') {
      const { method, args, line } = event.data;
      const message = args.map((arg: any) => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
      const file = activeScriptRef.current ? activeScriptRef.current.split('/').pop() || 'unknown' : 'unknown';
      setConsoleMessages(prev => {
        const newMessages = [
          ...prev,
          {
            type: method as ConsoleMessage['type'],
            message,
            file,
            line,
          },
        ];
        console.log('consoleMessages:', newMessages);
        return newMessages;
      });
    } else if (event.data.type === 'error') {
      const { message, stack, line } = event.data;
      const file = activeScriptRef.current ? activeScriptRef.current.split('/').pop() || 'unknown' : 'unknown';
      setConsoleMessages(prev => {
        const newMessages = [
          ...prev,
          {
            type: 'error',
            message: `Error: ${message}${stack ? `\n${stack}` : ''}`,
            file,
            line,
          },
        ];
        console.log('consoleMessages:', newMessages);
        return newMessages;
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleConsoleMessage);
    return () => window.removeEventListener('message', handleConsoleMessage);
  }, [handleConsoleMessage]);

  const bundleAndPreview = useCallback(async (forNewTab: boolean = false) => {
    if (!iframeRef.current && !forNewTab) {
      console.warn('iframeRef.current is null, skipping preview update');
      return;
    }
    setIsBundling(true);
    try {
      const { folderFiles, allFiles } = collectFiles();
      console.log('Debug: allFiles keys:', Array.from(allFiles.keys()));
      let htmlDoc = '';
      let htmlEntry: string | undefined;
      const assetUrls: { [key: string]: string } = {};

      // Clear assetUrlMapRef for new preview
      assetUrlMapRef.current.clear();

      if (allFiles.has('package.json') && allFiles.has('src/main.jsx') && allFiles.has('src/index.html')) {
        console.log('Debug: Using React bundling path for src/main.jsx');
        try {
          const result = await esbuild.build({
            entryPoints: ['src/main.jsx'],
            bundle: true,
            write: false,
            platform: 'browser',
            format: 'esm',
            plugins: [unpkgPathPlugin(), unpkgFetchPlugin(allFiles)],
            define: { 'process.env.NODE_ENV': '"development"' },
            loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'css' },
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
          });
          const jsBlob = new Blob([result.outputFiles[0].text], { type: 'application/javascript' });
          const jsURL = URL.createObjectURL(jsBlob);
          htmlDoc = allFiles.get('src/index.html') ?? '<!DOCTYPE html><html><body><div id="root"></div></body></html>';
          htmlDoc = htmlDoc.replace(/<script[^>]*src=["'][^"']*["'][^>]*>|<\/script>/gi, '');
          htmlDoc = htmlDoc.replace('</body>', `<script type="module" src="${jsURL}"></script></body>`);
          htmlEntry = 'src/index.html';
          assetUrls['src/main.jsx'] = jsURL;
          assetUrlMapRef.current.set('src/main.jsx', jsURL);
          activeScriptRef.current = 'src/main.jsx';
        } catch (error) {
          console.error('Debug: esbuild React bundling error:', error);
          throw error;
        }
      } else {
        console.log('Debug: Using non-React bundling path');
        if (lastHtmlFile?.fullPath && allFiles.has(lastHtmlFile.fullPath)) {
          htmlEntry = lastHtmlFile.fullPath;
        } else if (activeFile?.name.endsWith('.html') && activeFile.fullPath && allFiles.has(activeFile.fullPath)) {
          htmlEntry = activeFile.fullPath;
        }
        if (!htmlEntry) {
          htmlEntry = Array.from(allFiles.keys()).find(k => k.endsWith('.html'));
        }

        if (htmlEntry) {
          htmlDoc = allFiles.get(htmlEntry)!;
          const htmlDir = htmlEntry!.substring(0, htmlEntry!.lastIndexOf('/'));

          // Set active script file from HTML
          activeScriptRef.current = getActiveScriptFile(htmlDoc, htmlDir, allFiles);

          // Inject console override script before other scripts
          htmlDoc = htmlDoc.replace('<head>', `<head>${getConsoleOverrideScript()}`);

          // Process <link> tags for CSS
          const linkRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
          let cssContents: string[] = [];
          let hasCss = false;

          htmlDoc = htmlDoc.replace(linkRegex, (match, href) => {
            let cssPath = resolvePath(htmlDir, href);
            console.log('Debug: Resolving CSS path:', { href, htmlDir, cssPath });
            if (folderFiles.has(cssPath)) {
              const cssContent = folderFiles.get(cssPath)!;
              cssContents.push(cssContent);
              const cssBlob = new Blob([cssContent], { type: 'text/css' });
              const cssUrl = URL.createObjectURL(cssBlob);
              hasCss = true;
              assetUrls[cssPath] = cssUrl;
              assetUrlMapRef.current.set(cssPath, cssUrl);
              console.log('Debug: CSS Blob URL created:', { cssPath, cssUrl });
              return `<link rel="stylesheet" href="${cssUrl}">`;
            }
            if (allFiles.has(cssPath)) {
              const cssContent = allFiles.get(cssPath)!;
              cssContents.push(cssContent);
              const cssBlob = new Blob([cssContent], { type: 'text/css' });
              const cssUrl = URL.createObjectURL(cssBlob);
              hasCss = true;
              assetUrls[cssPath] = cssUrl;
              assetUrlMapRef.current.set(cssPath, cssUrl);
              console.log('Debug: CSS Blob URL created:', { cssPath, cssUrl });
              return `<link rel="stylesheet" href="${cssUrl}">`;
            }
            const fallbackCssPath = `${htmlDir}/${href.replace(/^\.\//, '')}`;
            console.log('Debug: Trying fallback CSS path:', { fallbackCssPath });
            if (folderFiles.has(fallbackCssPath) || allFiles.has(fallbackCssPath)) {
              const cssContent = folderFiles.get(fallbackCssPath) || allFiles.get(fallbackCssPath)!;
              cssContents.push(cssContent);
              const cssBlob = new Blob([cssContent], { type: 'text/css' });
              const cssUrl = URL.createObjectURL(cssBlob);
              hasCss = true;
              assetUrls[fallbackCssPath] = cssUrl;
              assetUrlMapRef.current.set(fallbackCssPath, cssUrl);
              console.log('Debug: CSS Blob URL created:', { fallbackCssPath, cssUrl });
              return `<link rel="stylesheet" href="${cssUrl}">`;
            }
            console.log('Debug: No CSS file found for:', { href, cssPath, fallbackCssPath });
            return match;
          });

          // Process <script> tags for JavaScript
          const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
          let jsContents: string[] = [];
          let hasJs = false;

          htmlDoc = htmlDoc.replace(scriptRegex, (match, src) => {
            let jsPath = resolvePath(htmlDir, src);
            console.log('Debug: Resolving JS path:', { src, htmlDir, jsPath });
            if (folderFiles.has(jsPath)) {
              const jsContent = folderFiles.get(jsPath)!;
              jsContents.push(jsContent);
              const jsBlob = new Blob([jsContent], { type: 'application/javascript' });
              const jsUrl = URL.createObjectURL(jsBlob);
              hasJs = true;
              assetUrls[jsPath] = jsUrl;
              assetUrlMapRef.current.set(jsPath, jsUrl);
              console.log('Debug: JS Blob URL created:', { jsPath, jsUrl });
              // Add type="module" if the script contains import/export
              const isModule = jsContent.includes('import ') || jsContent.includes('export ');
              return `<script${isModule ? ' type="module"' : ''} src="${jsUrl}"></script>`;
            }
            if (allFiles.has(jsPath)) {
              const jsContent = allFiles.get(jsPath)!;
              jsContents.push(jsContent);
              const jsBlob = new Blob([jsContent], { type: 'application/javascript' });
              const jsUrl = URL.createObjectURL(jsBlob);
              hasJs = true;
              assetUrls[jsPath] = jsUrl;
              assetUrlMapRef.current.set(jsPath, jsUrl);
              console.log('Debug: JS Blob URL created:', { jsPath, jsUrl });
              const isModule = jsContent.includes('import ') || jsContent.includes('export ');
              return `<script${isModule ? ' type="module"' : ''} src="${jsUrl}"></script>`;
            }
            const fallbackJsPath = `${htmlDir}/${src.replace(/^\.\//, '')}`;
            console.log('Debug: Trying fallback JS path:', { fallbackJsPath });
            if (folderFiles.has(fallbackJsPath) || allFiles.has(fallbackJsPath)) {
              const jsContent = folderFiles.get(fallbackJsPath) || allFiles.get(fallbackJsPath)!;
              jsContents.push(jsContent);
              const jsBlob = new Blob([jsContent], { type: 'application/javascript' });
              const jsUrl = URL.createObjectURL(jsBlob);
              hasJs = true;
              assetUrls[fallbackJsPath] = jsUrl;
              assetUrlMapRef.current.set(fallbackJsPath, jsUrl);
              console.log('Debug: JS Blob URL created:', { fallbackJsPath, jsUrl });
              const isModule = jsContent.includes('import ') || jsContent.includes('export ');
              return `<script${isModule ? ' type="module"' : ''} src="${jsUrl}"></script>`;
            }
            console.log('Debug: No JS file found for:', { src, jsPath, fallbackJsPath });
            return match;
          });

          if (!hasCss) {
            htmlDoc = htmlDoc.replace('</head>', `<style id="${styleIdRef.current}"></style></head>`);
            const cssEntry = Array.from(allFiles.keys()).find(k => k.endsWith('.css'));
            if (cssEntry) {
              const cssContent = allFiles.get(cssEntry)!;
              htmlDoc = htmlDoc.replace(`<style id="${styleIdRef.current}"></style>`, `<style id="${styleIdRef.current}">${cssContent}</style>`);
            }
          }
        } else {
          htmlDoc = '<!DOCTYPE html><html><head>' + getConsoleOverrideScript() + '<style id="' + styleIdRef.current + '"></style></head><body><p style="color:#fff;padding:1rem;">No HTML to preview.</p></body></html>';
          activeScriptRef.current = null;
        }
      }

      lastRenderedHtmlRef.current = htmlEntry || null;
      if (forNewTab) {
        const htmlBlob = new Blob([htmlDoc], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        return { htmlUrl, assetUrls };
      } else {
        if (iframeRef.current) {
          setConsoleMessages([]);
          iframeRef.current.srcdoc = htmlDoc;
        } else {
          console.warn('iframeRef.current is null, cannot set srcdoc');
        }
      }
    } catch (error) {
      console.error('esbuild error:', error);
      const errorDoc = `<p style="color:#fff;padding:1rem;">Build error: ${error instanceof Error ? error.message : 'Unknown error'
        }</p>`;
      if (forNewTab) {
        const errorBlob = new Blob([errorDoc], { type: 'text/html' });
        return { htmlUrl: URL.createObjectURL(errorBlob), assetUrls: {} };
      } else {
        if (iframeRef.current) {
          setConsoleMessages([]);
          iframeRef.current.srcdoc = errorDoc;
        } else {
          console.warn('iframeRef.current is null, cannot set srcdoc');
        }
      }
    } finally {
      setIsBundling(false);
    }
    return null;
  }, [collectFiles, activeFile, lastHtmlFile, getActiveScriptFile]);

  const debouncedBundleAndPreview = useCallback(
    debounce(bundleAndPreview, 100),
    [bundleAndPreview]
  );

  const debouncedUpdateIframeStyles = useCallback(
    debounce((cssContent: string) => updateIframeStyles(cssContent), 100),
    [updateIframeStyles]
  );

  const throttledUpdateContent = useCallback(
    throttle((content: string) => {
      updateContent(content);
      if (activeFile) {
        saveFile(activeFile.id);
      }
    }, 50),
    [updateContent, activeFile, saveFile]
  );

  const togglePreview = useCallback(() => {
    setShowPreview(!showPreview);
  }, [setShowPreview, showPreview]);

  const toggleTerminal = useCallback(() => {
    setShowTerminal(prev => !prev);
  }, []);

  const handleRefresh = useCallback(() => {
    debouncedBundleAndPreview();
  }, [debouncedBundleAndPreview]);

  const handleOpenInNewTab = useCallback(async () => {
    const result = await bundleAndPreview(true);
    if (result) {
      const { htmlUrl } = result;
      window.open(htmlUrl, '_blank');
    }
  }, [bundleAndPreview]);

  useEffect(() => {
    if (showPreview && (activeFile?.name.endsWith('.html') || lastHtmlFile)) {
      if (!lastRenderedHtmlRef.current || lastHtmlFile?.fullPath !== lastRenderedHtmlRef.current) {
        debouncedBundleAndPreview();
      }
    }
  }, [showPreview, lastHtmlFile, fileTree, debouncedBundleAndPreview]);

  useEffect(() => {
    if (!showPreview) return;
    if (activeFile?.name.endsWith('.css') && fileContent) {
      debouncedUpdateIframeStyles(fileContent);
    } else if (activeFile?.name.endsWith('.html') && fileContent) {
      debouncedBundleAndPreview();
    }
  }, [showPreview, activeFile, fileContent, debouncedUpdateIframeStyles, debouncedBundleAndPreview, lastHtmlFile]);

  useEffect(() => {
    if ((showPreview || activeFile) && editorRef.current) {
      editorRef.current.layout();
    }
  }, [showPreview, activeFile]);

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <PanelGroup direction="horizontal">
        <Panel id="editor" order={1} defaultSize={showPreview ? 60 : 100} minSize={20}>
          <PanelGroup direction="vertical">
            <Panel id="code-editor" order={1} minSize={20}>
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgb(30, 30, 30)',
                }}
              >
                <Box
                  sx={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'rgb(30, 30, 30)',
                    borderBottom: '1px solid #333',
                    position: 'relative',
                    zIndex: '1000',
                  }}
                >
                  <Box sx={{ flex: '1', overflow: 'hidden' }}>
                    <TabBar />
                  </Box>
                  <IconButton
                    onClick={toggleTerminal}
                    sx={{ color: '#fff', marginRight: '4px' }}
                  >
                    {showTerminal ? <TerminalIcon color="primary" /> : <TerminalIcon />}
                  </IconButton>
                  <IconButton
                    onClick={togglePreview}
                    sx={{ color: '#fff', marginRight: '8px' }}
                  >
                    {showPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </Box>
                {activeFile ? (
                  <Editor
                    height="calc(100% - 40px)"
                    language={language}
                    value={fileContent}
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    onChange={value => value !== undefined && throttledUpdateContent(value)}
                    options={{ automaticLayout: true }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 'calc(100% - 40px)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: 'rgb(30, 30, 30)',
                      color: '#fff',
                    }}
                  >
                    <Typography variant="h6" sx={{ opacity: 0.7 }}>
                      Please choose a file to edit
                    </Typography>
                  </Box>
                )}
              </Box>
            </Panel>
            {showTerminal && (
              <>
                <VerticalResizeHandle />
                <Panel id="terminal" order={2} defaultSize={20} minSize={10}>
                  <TerminalPanel>
                    {consoleMessages.length === 0 && (
                      <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        No console messages
                      </Typography>
                    )}
                    {consoleMessages.map((msg, index) => (
                      <Typography key={index} variant="body2" className={msg.type}>
                        {msg.file}:{msg.line} {msg.message}
                      </Typography>
                    ))}
                  </TerminalPanel>
                </Panel>
              </>
            )}
          </PanelGroup>
        </Panel>
        {showPreview && (
          <>
            <StyledPanelResizeHandle />
            <Panel id="preview" order={2} defaultSize={40} minSize={20}>
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgb(30, 30, 30)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
                data-testid="preview-pane"
              >
                <BrowserNavbar>
                  <IconButton
                    onClick={handleRefresh}
                    sx={{
                      color: '#fff',
                      backgroundColor: '#444',
                      width: '28px',
                      height: '28px',
                      marginRight: '4px',
                      '&:hover': { backgroundColor: '#555' },
                    }}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    onClick={handleOpenInNewTab}
                    sx={{
                      color: '#fff',
                      backgroundColor: '#444',
                      width: '28px',
                      height: '28px',
                      marginRight: '8px',
                      '&:hover': { backgroundColor: '#555' },
                    }}
                  >
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                  <AddressBar
                    value={lastHtmlFile?.fullPath || activeFile?.name.endsWith('.html') ? activeFile?.fullPath : ''}
                    variant="outlined"
                    InputProps={{ readOnly: true }}
                  />
                </BrowserNavbar>
                {isBundling ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                    <CircularProgress size={24} sx={{ color: '#fff' }} />
                  </Box>
                ) : (
                  <iframe
                    ref={iframeRef}
                    style={{ width: '100%', height: 'calc(100% - 40px)', border: 'none' }}
                    title="Preview"
                  />
                )}
              </Box>
            </Panel>
          </>
        )}
      </PanelGroup>
    </Box>
  );
};