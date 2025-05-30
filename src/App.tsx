// src/App.tsx
import React from 'react';
import { Box } from '@mui/material';
import { EditorProvider } from './context/EditorContext';
import { FileExplorer } from './components/FileExplorer';
import { CodeEditor } from './components/CodeEditor';

const App: React.FC = () => {
  return (
    <EditorProvider>
      <Box sx={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar: File Explorer */}
        <FileExplorer />
        {/* Main Content: Code Editor */}
        <Box sx={{ flex: 1 }}>
          <CodeEditor />
        </Box>
      </Box>
    </EditorProvider>
  );
};

export default App