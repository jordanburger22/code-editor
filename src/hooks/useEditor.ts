import { useContext } from 'react';
import { EditorContext } from '../context/EditorContext';
import type { FileNode } from '../types/FileNode';

export const useEditor = () => {
  const { state, dispatch } = useContext(EditorContext);

  return {
    fileTree: state.fileTree,
    selectedFile: state.selectedFile,
    fileContent: state.fileContent,
    language: state.language,
    openFiles: state.openFiles,
    activeFile: state.activeFile,
    lastHtmlFile: state.lastHtmlFile,
    showPreview: state.showPreview,
    addNode: (parentId: string, node: FileNode) =>
      dispatch({ type: 'ADD_NODE', payload: { parentId, node } }),
    renameNode: (id: string, newName: string) =>
      dispatch({ type: 'RENAME_NODE', payload: { id, newName } }),
    deleteNode: (id: string) => dispatch({ type: 'DELETE_NODE', payload: { id } }),
    openFile: (node: FileNode) => dispatch({ type: 'OPEN_FILE', payload: node }),
    setActiveFile: (node: FileNode) => dispatch({ type: 'SET_ACTIVE_FILE', payload: node }),
    closeFile: (node: FileNode) => dispatch({ type: 'CLOSE_FILE', payload: node }),
    updateContent: (content: string) => dispatch({ type: 'UPDATE_CONTENT', payload: content }),
    saveFile: (fileId: string) => dispatch({ type: 'SAVE_FILE', payload: fileId }),
    setShowPreview: (value: boolean) => dispatch({ type: 'SET_SHOW_PREVIEW', payload: value }),
  };
};