import React from 'react';
import { Tabs, Tab, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { FileNode } from '../types/FileNode';
import { useEditor } from '../hooks/useEditor';

export const TabBar: React.FC = () => {
  const { openFiles, activeFile, lastHtmlFile, showPreview, setActiveFile, closeFile } = useEditor();

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    const file = openFiles.find(f => f.node.id === newValue);
    if (file) {
      console.log('Switching to file:', {
        id: file.node.id,
        name: file.node.name,
        content: file.node.content,
        lastHtmlFile: lastHtmlFile ? { id: lastHtmlFile.id, name: lastHtmlFile.name, fullPath: lastHtmlFile.fullPath } : null,
        showPreview,
      });
      setActiveFile(file.node);
    }
  };

  const handleClose = (file: FileNode) => (event: React.MouseEvent) => {
    event.stopPropagation();
    console.log('Closing file:', { id: file.id, name: file.name, fullPath: file.fullPath });
    closeFile(file);
  };

  return (
    <Tabs
      value={activeFile?.id || false}
      onChange={handleChange}
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        minHeight: '40px',
        backgroundColor: 'rgb(30, 30, 30)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {openFiles.map(({ node: file, dirty }) => (
        <Tab
          key={file.id}
          value={file.id}
          label={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{file.name}</span>
              {dirty && <span style={{ color: '#fff', fontSize: '10px' }}>●</span>}
              <IconButton
                size="small"
                onClick={handleClose(file)}
                sx={{ padding: '2px' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </div>
          }
          sx={{
            minHeight: '40px',
            padding: '0 12px',
            textTransform: 'none',
            color: '#fff',
            '&.Mui-selected': {
              backgroundColor: 'rgb(46, 46, 46)',
              color: '#fff',
            },
          }}
        />
      ))}
    </Tabs>
  );
};