import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { DataNode, EventDataNode } from 'rc-tree/lib/interface';
import Tree from 'rc-tree';
import 'rc-tree/assets/index.css';
import {
    Box,
    IconButton,
    Menu,
    MenuItem,
    Typography,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    InputLabel,
    Select,
    Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { v4 as uuid } from 'uuid';

import { useEditor } from '../hooks/useEditor';
import type { FileNode } from '../types/FileNode';

type TemplateOption = 'blank' | 'react' | 'express' | 'flutter';

export const FileExplorer: React.FC = () => {
    const { fileTree, addNode, renameNode, deleteNode, openFile, activeFile } = useEditor();
    const [hovering, setHovering] = useState(false);
    const [menuState, setMenuState] = useState<{ mouseX: number; mouseY: number; node: EventDataNode<DataNode> } | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption>('blank');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when inline editing
    useEffect(() => {
        if (editingKey && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingKey]);

    // Inline edit handlers
    const handleEditConfirm = useCallback(() => {
        if (editingKey && editingText.trim()) {
            renameNode(editingKey, editingText.trim());
        }
        setEditingKey(null);
    }, [editingKey, editingText, renameNode]);

    const handleEditCancel = useCallback(() => {
        setEditingKey(null);
    }, []);

    // Recursive find by id
    const findById = useCallback((nodes: FileNode[] = [], id: string): FileNode | undefined => {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const found = findById(n.children, id);
                if (found) return found;
            }
        }
    }, []);

    // Convert to DataNode with inline editing and active file highlighting
    const convert = useCallback(
        (node: FileNode): DataNode => {
            const isEditing = node.id === editingKey;
            const isActive = node.id === activeFile?.id;
            return {
                key: node.id,
                title: isEditing ? (
                    <TextField
                        inputRef={inputRef}
                        value={editingText}
                        size="small"
                        variant="standard"
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={handleEditConfirm}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditConfirm();
                            if (e.key === 'Escape') handleEditCancel();
                        }
                        }
                        fullWidth
                    />
                ) : (
                    <Tooltip title={node.fullPath} placement="right">
                        <Box
                            onDoubleClick={() => {
                                setEditingKey(node.id);
                                setEditingText(node.name);
                            }}
                            sx={{
                                width: '100%',
                                fontWeight: isActive ? 'bold' : 'normal',
                                color: isActive ? '#90caf9' : '#d4d4d4',
                            }}
                        >
                            {node.name}
                        </Box>
                    </Tooltip>
                ),
                isLeaf: node.type === 'file',
                children: node.children?.map(convert),
            };
        },
        [editingKey, editingText, handleEditConfirm, handleEditCancel, activeFile]
    );

    // Prepare treeData from development folder
    const treeData = useMemo<DataNode[]>(() => {
        const dev = fileTree.children?.find((n) => n.id === 'development-folder');
        if (dev) {
            console.log('FileExplorer treeData:', {
                id: dev.id,
                name: dev.name,
                fullPath: dev.fullPath,
                children: dev.children?.map(c => ({ id: c.id, name: c.name, fullPath: c.fullPath })),
            });
            return [convert(dev)];
        }
        return [];
    }, [fileTree, convert]);

    // Context menu handlers
    const handleRightClick = (event: React.MouseEvent, node: EventDataNode<DataNode>) => {
        event.preventDefault();
        setMenuState({ mouseX: event.clientX, mouseY: event.clientY, node });
    };

    const handleCloseMenu = () => setMenuState(null);

    // New file/folder trigger
    const handleNew = useCallback(
        (kind: 'file' | 'folder') => {
            handleCloseMenu();
            if (kind === 'folder') {
                setNewFolderName('');
                setSelectedTemplate('blank');
                setTemplateOpen(true);
            } else {
                const parentId = menuState?.node.key as string || 'development-folder';
                const parentNode = findById(fileTree.children, parentId);
                if (parentNode?.type === 'file') {
                    alert('Cannot add file inside a file');
                    return;
                }
                const name = window.prompt('Enter file name');
                if (!name?.trim()) return;
                const fullPath = parentNode?.fullPath
                    ? `${parentNode.fullPath}/${name.trim()}`
                    : `development/${name.trim()}`;
                console.log('Adding new file:', { parentId, name: name.trim(), fullPath });
                addNode(parentId, { id: uuid(), name: name.trim(), type: 'file', content: '', fullPath });
            }
        },
        [menuState, addNode, fileTree.children, findById]
    );

    // Create folder from template
    const handleCreateFolder = useCallback(() => {
        const parentId = menuState?.node.key as string || 'development-folder';
        const parentNode = findById(fileTree.children, parentId);
        if (parentNode?.type === 'file') {
            alert('Cannot add folder inside a file');
            return;
        }
        const id = uuid();
        const parentPath = parentNode?.fullPath || 'development';
        const folderNode: FileNode = {
            id,
            name: newFolderName.trim(),
            type: 'folder',
            fullPath: `${parentPath}/${newFolderName.trim()}`,
            children: [],
        };
        console.log('Creating folder:', { parentId, name: newFolderName.trim(), fullPath: folderNode.fullPath });
        switch (selectedTemplate) {
            case 'react':
                folderNode.children = [
                    {
                        id: uuid(),
                        name: 'package.json',
                        type: 'file',
                        fullPath: `${folderNode.fullPath}/package.json`,
                        content: JSON.stringify(
                            {
                                name: newFolderName.trim(),
                                scripts: { dev: 'vite' },
                                dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                                devDependencies: { vite: '^4.0.0' },
                            },
                            null,
                            2
                        ),
                    },
                    {
                        id: uuid(),
                        name: 'vite.config.js',
                        type: 'file',
                        fullPath: `${folderNode.fullPath}/vite.config.js`,
                        content: `import { defineConfig } from 'vite'
export default defineConfig({ root: './src', server: { port: 3000 } })`,
                    },
                    {
                        id: uuid(),
                        name: 'src',
                        type: 'folder',
                        fullPath: `${folderNode.fullPath}/src`,
                        children: [
                            {
                                id: uuid(),
                                name: 'index.html',
                                type: 'file',
                                fullPath: `${folderNode.fullPath}/src/index.html`,
                                content: `<!DOCTYPE html>
<html><body>
  <div id="root"></div>
  <script type="module" src="./main.jsx"></script>
</body></html>`,
                            },
                            {
                                id: uuid(),
                                name: 'main.jsx',
                                type: 'file',
                                fullPath: `${folderNode.fullPath}/src/main.jsx`,
                                content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './style.css'
ReactDOM.createRoot(document.getElementById('root')).render(<App />)`,
                            },
                            {
                                id: uuid(),
                                name: 'App.jsx',
                                type: 'file',
                                fullPath: `${folderNode.fullPath}/src/App.jsx`,
                                content: `export default function App() {
  return <h1>Hello, React!</h1>
}`,
                            },
                            {
                                id: uuid(),
                                name: 'style.css',
                                type: 'file',
                                fullPath: `${folderNode.fullPath}/src/style.css`,
                                content: '',
                            },
                        ],
                    },
                ];
                break;
            case 'express':
                folderNode.children = [
                    {
                        id: uuid(),
                        name: 'server.js',
                        type: 'file',
                        fullPath: `${folderNode.fullPath}/server.js`,
                        content: '',
                    },
                ];
                break;
            case 'flutter':
                folderNode.children = [
                    {
                        id: uuid(),
                        name: 'main.dart',
                        type: 'file',
                        fullPath: `${folderNode.fullPath}/main.dart`,
                        content: '',
                    },
                ];
                break;
            default:
                // blank
                break;
        }
        addNode(parentId, folderNode);
        setTemplateOpen(false);
    }, [menuState, newFolderName, selectedTemplate, addNode, fileTree.children, findById]);

    // Rename & delete handlers
    const handleRenameMenu = useCallback(() => {
        if (!menuState) return;
        const nodeId = menuState.node.key as string;
        const node = findById(fileTree.children, nodeId)!;
        setEditingKey(nodeId);
        setEditingText(node.name);
        handleCloseMenu();
    }, [menuState, fileTree.children, findById]);

    const handleDelete = useCallback(() => {
        if (!menuState) return;
        const nodeId = menuState.node.key as string;
        handleCloseMenu();
        if (window.confirm('Delete this item?')) deleteNode(nodeId);
    }, [menuState, deleteNode]);

    // Select file to open
    const handleSelect = useCallback(
        (keys: string[]) => {
            if (keys.length === 0) {
                console.log('No file selected');
                return;
            }
            const id = keys[0];
            const node = findById(fileTree.children, id);
            if (!node) {
                console.error('File not found for id:', id);
                return;
            }
            if (node.type === 'file') {
                console.log('Selecting file:', { id: node.id, name: node.name, fullPath: node.fullPath });
                openFile(node);
            }
        },
        [openFile, fileTree.children, findById]
    );

    return (
        <Box
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            sx={{
                width: collapsed ? '60px' : '320px',
                minWidth: collapsed ? '60px' : '320px',
                flexShrink: 0,
                height: '100vh',
                bgcolor: '#1e1e1e',
                color: '#d4d4d4',
                borderRight: '1px solid #333',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.2s',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1, minHeight: 40 }}>
                <IconButton size="small" onClick={() => setCollapsed(!collapsed)} sx={{ color: '#d4d4d4' }}>
                    {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
                </IconButton>
                {!collapsed && (
                    <>
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>
                            Explorer
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton
                                size="small"
                                onClick={() => handleNew('file')}
                                sx={{ visibility: hovering ? 'visible' : 'hidden', color: '#d4d4d4' }}
                            >
                                <AddIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                                size="small"
                                onClick={() => handleNew('folder')}
                                sx={{ visibility: hovering ? 'visible' : 'hidden', color: '#d4d4d4' }}
                            >
                                <CreateNewFolderIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </>
                )}
            </Box>
            {!collapsed && (
                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <Tree
                        treeData={treeData}
                        showIcon
                        defaultExpandAll
                        onRightClick={(info) => handleRightClick(info.event as any, info.node)}
                        onSelect={(keys) => handleSelect(keys as string[])}
                        icon={({ isLeaf, expanded }) =>
                            isLeaf ? (
                                <DescriptionIcon fontSize="small" />
                            ) : expanded ? (
                                <FolderOpenIcon fontSize="small" />
                            ) : (
                                <FolderIcon fontSize="small" />
                            )
                        }
                        style={{ width: '100%', background: 'transparent' }}
                    />
                </Box>
            )}
            {!collapsed && (
                <Menu
                    open={!!menuState}
                    onClose={handleCloseMenu}
                    anchorReference="anchorPosition"
                    anchorPosition={menuState ? { top: menuState.mouseY, left: menuState.mouseX } : undefined}
                >
                    <MenuItem onClick={() => handleNew('file')}>New File</MenuItem>
                    <MenuItem onClick={() => handleNew('folder')}>New Folder</MenuItem>
                    <MenuItem onClick={handleRenameMenu}>Rename</MenuItem>
                    <MenuItem onClick={handleDelete}>Delete</MenuItem>
                </Menu>
            )}
            <Dialog open={templateOpen} onClose={() => setTemplateOpen(false)}>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Folder Name"
                        fullWidth
                        margin="dense"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                    />
                    <FormControl fullWidth margin="dense">
                        <InputLabel>Template</InputLabel>
                        <Select
                            value={selectedTemplate}
                            label="Template"
                            onChange={(e) => setSelectedTemplate(e.target.value as TemplateOption)}
                        >
                            <MenuItem value="blank">Blank</MenuItem>
                            <MenuItem value="react">React</MenuItem>
                            <MenuItem value="express">Express</MenuItem>
                            <MenuItem value="flutter">Flutter</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTemplateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};