// src/utils/templates.ts
import { v4 as uuid } from 'uuid';
import type { FileNode } from '../types/FileNode';
import { getDefaultValue } from './defaultValues';

export type TemplateType = 'blank' | 'react' | 'express' | 'flutter';

export function getTemplateNodes(template: TemplateType): FileNode[] {
  switch (template) {
    case 'react':
      return [
        {
          id: uuid(),
          name: 'package.json',
          type: 'file',
          content: `{
  "name": "my-react-app",
  "version": "0.1.0",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}`,
        },
        {
          id: uuid(),
          name: 'public',
          type: 'folder',
          children: [
            {
              id: uuid(),
              name: 'index.html',
              type: 'file',
              content: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>React App</title></head>
  <body><div id="root"></div></body>
</html>`,
            },
          ],
        },
        {
          id: uuid(),
          name: 'src',
          type: 'folder',
          children: [
            {
              id: uuid(),
              name: 'index.jsx',
              type: 'file',
              content: getDefaultValue('javascriptreact'),
            },
            {
              id: uuid(),
              name: 'App.jsx',
              type: 'file',
              content: `import React from "react";

export default function App() {
  return <h1>Hello, React!</h1>;
}
`,
            },
          ],
        },
      ];

    case 'express':
      return [
        {
          id: uuid(),
          name: 'package.json',
          type: 'file',
          content: `{
  "name": "my-express-app",
  "version": "0.1.0",
  "dependencies": {
    "express": "^4.18.0"
  }
}`,
        },
        {
          id: uuid(),
          name: 'server.js',
          type: 'file',
          content: getDefaultValue('express'),
        },
      ];

    case 'flutter':
      return [
        {
          id: uuid(),
          name: 'pubspec.yaml',
          type: 'file',
          content: `name: my_flutter_app
description: A new Flutter project.`,
        },
        {
          id: uuid(),
          name: 'lib',
          type: 'folder',
          children: [
            {
              id: uuid(),
              name: 'main.dart',
              type: 'file',
              content: `void main() {
  print('Hello, Flutter!');
}
`,
            },
          ],
        },
      ];

    case 'blank':
    default:
      return [];
  }
}
