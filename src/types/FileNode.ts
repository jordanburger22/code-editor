// src/types/FileNode.ts
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  fullPath: string; // Added to store paths like "development/project1/index.html"
}