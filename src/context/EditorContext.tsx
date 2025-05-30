import React, { createContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { FileNode } from '../types/FileNode';
import { getDefaultValue, getLanguageFromFile } from '../utils/defaultValues';

type State = {
  fileTree: FileNode;
  selectedFile: FileNode | null;
  fileContent: string;
  language: string;
  openFiles: { node: FileNode; dirty: boolean }[];
  activeFile: FileNode | null;
  lastHtmlFile: FileNode | null;
  showPreview: boolean;
};

type Action =
  | { type: 'SELECT_FILE'; payload: FileNode }
  | { type: 'UPDATE_CONTENT'; payload: string }
  | { type: 'ADD_NODE'; payload: { parentId: string; node: FileNode } }
  | { type: 'RENAME_NODE'; payload: { id: string; newName: string } }
  | { type: 'DELETE_NODE'; payload: { id: string } }
  | { type: 'OPEN_FILE'; payload: FileNode }
  | { type: 'SET_ACTIVE_FILE'; payload: FileNode }
  | { type: 'CLOSE_FILE'; payload: FileNode }
  | { type: 'SAVE_FILE'; payload: string }
  | { type: 'SET_SHOW_PREVIEW'; payload: boolean };

const findNodeById = (node: FileNode, id: string): FileNode | null => {
  if (node.id === id) {
    return { ...node };
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
};

const updateNodeContent = (tree: FileNode, id: string, content: string): FileNode => {
  if (tree.id === id) {
    return { ...tree, content };
  }
  if (tree.children) {
    return {
      ...tree,
      children: tree.children.map(child => updateNodeContent(child, id, content)),
    };
  }
  return tree;
};

// Assign fullPath without nested development prefixes
const assignFullPaths = (node: FileNode, base: string = ''): FileNode => {
  const path = base && node.name !== 'development' ? `${base}/${node.name}` : node.name;
  let fullPath = node.name === 'development' ? 'development' : `development/${path}`;
  fullPath = fullPath.replace(/^(development\/)+project\/development\//, 'development/');
  fullPath = fullPath.replace(/^(development\/)+/, 'development/');
  console.log('Assigning fullPath:', { name: node.name, base, fullPath });
  return {
    ...node,
    fullPath,
    children: node.children?.map(child => assignFullPaths(child, fullPath === 'development' ? '' : fullPath)),
  };
};

const initialState: State = (() => {
  let fileTree: FileNode;
  let openFileIds: string[] = [];
  let activeFileId: string | null = null;

  const defaultTree: FileNode = {
    id: 'root',
    name: 'project',
    type: 'folder',
    fullPath: 'development',
    children: [
      {
        id: 'development-folder',
        name: 'development',
        type: 'folder',
        fullPath: 'development',
        children: [
          {
            id: 'index-html',
            name: 'index.html',
            type: 'file',
            fullPath: 'development/index.html',
            content: `<!DOCTYPE html>
<html>
<head>
    <link href="styles.css" rel="stylesheet">
</head>
<body>
    <h1>Welcome</h1>
</body>
</html>`,
          },
          {
            id: 'styles-css',
            name: 'styles.css',
            type: 'file',
            fullPath: 'development/styles.css',
            content: `body {
    background-color: white;
}
h1 {
    color: black;
}`,
          },
        ],
      },
    ],
  };

  try {
    const savedFileTree = localStorage.getItem('fileTree');
    let parsedTree: FileNode;

    if (savedFileTree) {
      parsedTree = JSON.parse(savedFileTree);
      if (
        parsedTree &&
        typeof parsedTree === 'object' &&
        'id' in parsedTree &&
        'name' in parsedTree &&
        'type' in parsedTree &&
        (!parsedTree.children || Array.isArray(parsedTree.children)) &&
        !parsedTree.fullPath?.includes('development/project/development')
      ) {
        fileTree = assignFullPaths(parsedTree);
        console.log('Parsed fileTree:', {
          id: fileTree.id,
          name: fileTree.name,
          fullPath: fileTree.fullPath,
          children: fileTree.children?.map(c => ({ id: c.id, name: c.name, fullPath: c.fullPath })),
        });
      } else {
        console.warn('Invalid or corrupted fileTree structure in localStorage, using default');
        localStorage.removeItem('fileTree');
        fileTree = assignFullPaths(defaultTree);
      }
    } else {
      fileTree = assignFullPaths(defaultTree);
    }

    const savedOpenFileIds = localStorage.getItem('openFiles');
    if (savedOpenFileIds) {
      const parsedIds = JSON.parse(savedOpenFileIds);
      if (Array.isArray(parsedIds) && parsedIds.every(id => typeof id === 'string')) {
        openFileIds = parsedIds;
      } else {
        console.warn('Invalid openFileIds in localStorage, resetting');
        localStorage.removeItem('openFiles');
      }
    }

    const savedActiveFileId = localStorage.getItem('activeFile');
    if (savedActiveFileId) {
      const parsedId = JSON.parse(savedActiveFileId);
      if (typeof parsedId === 'string') {
        activeFileId = parsedId;
      } else if (parsedId !== null) {
        console.warn('Invalid activeFileId in localStorage, resetting');
        localStorage.removeItem('activeFile');
      }
    }
  } catch (e) {
    console.error('Failed to parse localStorage:', e);
    localStorage.removeItem('fileTree');
    localStorage.removeItem('openFiles');
    localStorage.removeItem('activeFile');
    fileTree = assignFullPaths(defaultTree);
  }

  const openFiles: { node: FileNode; dirty: boolean }[] = openFileIds
    .map(id => {
      const node = findNodeById(fileTree, id);
      return node ? { node, dirty: false } : null;
    })
    .filter((item): item is { node: FileNode; dirty: boolean } => item !== null);

  const activeFile = activeFileId
    ? findNodeById(fileTree, activeFileId)
    : openFiles.length > 0
      ? openFiles[openFiles.length - 1].node
      : null;

  const lastHtmlFile = activeFile?.name.endsWith('.html') ? activeFile : null;

  let showPreview = false;
  try {
    const savedShowPreview = localStorage.getItem('showPreview');
    if (savedShowPreview) {
      showPreview = JSON.parse(savedShowPreview);
    }
  } catch (e) {
    console.error('Failed to parse showPreview from localStorage:', e);
  }

  console.log('Initial state:', {
    fileTree: fileTree.children?.map(n => ({
      id: n.id,
      name: n.name,
      fullPath: n.fullPath,
      content: n.content,
      children: n.children?.map(c => ({ id: c.id, name: c.name, fullPath: c.fullPath, content: c.content })),
    })),
    openFiles: openFiles.map(f => ({ id: f.node.id, name: f.node.name, fullPath: f.node.fullPath, content: f.node.content, dirty: f.dirty })),
    activeFile: activeFile ? { id: activeFile.id, name: activeFile.name, fullPath: activeFile.fullPath, content: activeFile.content } : null,
    lastHtmlFile: lastHtmlFile ? { id: lastHtmlFile.id, name: lastHtmlFile.name, fullPath: lastHtmlFile.fullPath } : null,
    showPreview,
  });

  return {
    fileTree,
    selectedFile: null,
    fileContent: activeFile?.content ?? '',
    language: activeFile ? getLanguageFromFile(activeFile.name) : 'javascript',
    openFiles,
    activeFile,
    lastHtmlFile,
    showPreview,
  };
})();

function reducer(state: State, action: Action): State {
  const syncOpenFiles = (newTree: FileNode): { node: FileNode; dirty: boolean }[] => {
    return state.openFiles
      .map(f => {
        const updatedNode = findNodeById(newTree, f.node.id);
        return updatedNode ? { node: updatedNode, dirty: f.dirty } : null;
      })
      .filter((item): item is { node: FileNode; dirty: boolean } => item !== null);
  };

  function update(node: FileNode): FileNode | null {
    if (action.type === 'ADD_NODE' && node.id === action.payload.parentId) {
      const newNode = assignFullPaths(action.payload.node, node.fullPath);
      return {
        ...node,
        children: [...(node.children || []), newNode],
      };
    }
    if (action.type === 'RENAME_NODE' && node.id === action.payload.id) {
      const parentPath = node.fullPath.substring(0, node.fullPath.lastIndexOf('/'));
      const newFullPath = `${parentPath}/${action.payload.newName}`;
      return { ...node, name: action.payload.newName, fullPath: newFullPath };
    }
    if (action.type === 'DELETE_NODE' && node.id === action.payload.id) {
      return null;
    }
    if (node.children) {
      const updatedChildren = node.children
        .map(update)
        .filter((n): n is FileNode => n !== null);
      return { ...node, children: updatedChildren };
    }
    return node;
  }

  switch (action.type) {
    case 'SELECT_FILE': {
      const file = action.payload;
      const lang = getLanguageFromFile(file.name);
      return {
        ...state,
        selectedFile: file,
        fileContent: file.content ?? getDefaultValue(lang),
        language: lang,
      };
    }
    case 'UPDATE_CONTENT': {
      if (!state.activeFile) return state;
      console.log('Updating content:', { file: state.activeFile.name, content: action.payload });
      return {
        ...state,
        fileContent: action.payload,
        activeFile: { ...state.activeFile, content: action.payload },
        openFiles: state.openFiles.map(f =>
          f.node.id === state.activeFile!.id ? { ...f, dirty: true } : f
        ),
        selectedFile: state.selectedFile?.id === state.activeFile.id
          ? { ...state.selectedFile, content: action.payload }
          : state.selectedFile,
      };
    }
    case 'SAVE_FILE': {
      if (!state.activeFile || state.activeFile.id !== action.payload) return state;
      const newTree = updateNodeContent(state.fileTree, action.payload, state.fileContent);
      const newOpenFiles = syncOpenFiles(newTree);
      return {
        ...state,
        fileTree: newTree,
        openFiles: newOpenFiles.map(f =>
          f.node.id === action.payload ? { ...f, dirty: false } : f
        ),
      };
    }
    case 'ADD_NODE':
    case 'RENAME_NODE':
    case 'DELETE_NODE': {
      const newTree = update(state.fileTree);
      const newOpenFiles = syncOpenFiles(newTree ?? state.fileTree);
      return {
        ...state,
        fileTree: newTree ?? state.fileTree,
        openFiles: action.type === 'RENAME_NODE'
          ? newOpenFiles.map(f =>
            f.node.id === action.payload.id
              ? { ...f, node: { ...f.node, name: action.payload.newName } }
              : f
          )
          : action.type === 'DELETE_NODE'
            ? newOpenFiles.filter(f => f.node.id !== action.payload.id)
            : newOpenFiles,
        activeFile: action.type === 'RENAME_NODE' && state.activeFile?.id === action.payload.id
          ? { ...state.activeFile, name: action.payload.newName }
          : action.type === 'DELETE_NODE' && state.activeFile?.id === action.payload.id
            ? newOpenFiles.length > 0
              ? newOpenFiles[newOpenFiles.length - 1].node
              : null
            : state.activeFile,
        selectedFile: action.type === 'RENAME_NODE' && state.selectedFile?.id === action.payload.id
          ? { ...state.selectedFile, name: action.payload.newName }
          : action.type === 'DELETE_NODE' && state.selectedFile?.id === action.payload.id
            ? null
            : state.selectedFile,
        lastHtmlFile: action.type === 'DELETE_NODE' && state.lastHtmlFile?.id === action.payload.id
          ? null
          : state.lastHtmlFile,
      };
    }
    case 'OPEN_FILE': {
      if (action.payload.type !== 'file') return state;
      const file = action.payload;
      const lang = getLanguageFromFile(file.name);
      console.log('Opening file:', { id: file.id, name: file.name, fullPath: file.fullPath });
      return {
        ...state,
        openFiles: state.openFiles.some(f => f.node.id === file.id)
          ? state.openFiles
          : [...state.openFiles, { node: file, dirty: false }],
        activeFile: file,
        fileContent: file.content ?? getDefaultValue(lang),
        language: lang,
        selectedFile: file,
        lastHtmlFile: file.name.endsWith('.html') ? file : state.lastHtmlFile,
      };
    }
    case 'SET_ACTIVE_FILE': {
      const file = action.payload;
      const lang = getLanguageFromFile(file.name);
      console.log('Setting active file:', { id: file.id, name: file.name, fullPath: file.fullPath });
      return {
        ...state,
        activeFile: file,
        fileContent: file.content ?? getDefaultValue(lang),
        language: lang,
        selectedFile: file,
        lastHtmlFile: file.name.endsWith('.html') ? file : state.lastHtmlFile,
      };
    }
    case 'CLOSE_FILE': {
      const file = action.payload;
      const newOpenFiles = state.openFiles.filter(f => f.node.id !== file.id);
      const newActiveFile = state.activeFile?.id === file.id
        ? newOpenFiles.length > 0
          ? newOpenFiles[newOpenFiles.length - 1].node
          : null
        : state.activeFile;
      const lang = newActiveFile ? getLanguageFromFile(newActiveFile.name) : 'javascript';
      return {
        ...state,
        openFiles: newOpenFiles,
        activeFile: newActiveFile,
        fileContent: newActiveFile?.content ?? getDefaultValue(lang),
        language: lang,
        selectedFile: newActiveFile,
        lastHtmlFile: state.lastHtmlFile?.id === file.id ? null : state.lastHtmlFile,
      };
    }
    case 'SET_SHOW_PREVIEW': {
      console.log('Setting showPreview:', action.payload);
      return {
        ...state,
        showPreview: action.payload,
      };
    }
    default:
      return state;
  }
}

export const EditorContext = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
}>({ state: initialState, dispatch: () => null });

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      localStorage.setItem('fileTree', JSON.stringify(state.fileTree));
      localStorage.setItem('openFiles', JSON.stringify(state.openFiles.map(f => f.node.id)));
      localStorage.setItem('activeFile', JSON.stringify(state.activeFile?.id || null));
      localStorage.setItem('showPreview', JSON.stringify(state.showPreview));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [state.fileTree, state.openFiles, state.activeFile, state.showPreview]);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
};