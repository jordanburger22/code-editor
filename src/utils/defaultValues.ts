// src/utils/defaultValues.ts
import type { FileNode } from '../types/FileNode';

export const getDefaultValue = (lang: string): string => {
  switch (lang) {
    case 'html': return '<div></div>';
    case 'javascript': return '// Start coding here';
    case 'css': return '/* Start styling here */\n';
    // …
    default: return '';
  }
};

export const getLanguageFromFile = (fileName: string): string => {
  if (fileName.endsWith('.jsx')) return 'javascriptreact';
  if (fileName.endsWith('.js')) return 'javascript';
  if (fileName.endsWith('.html')) return 'html';
  if (fileName.endsWith('.css')) return 'css';
  return 'plaintext';
};
