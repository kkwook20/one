// frontend/src/components/modals/ProjectModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  Folder, FolderPlus, X, Trash2, Edit2, Check, AlertCircle,
  ChevronRight, ChevronDown, File, FileText, FileCode,
  FileJson, Image, Film, FolderOpen, Copy, Download
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { CodeEditor } from '../CodeEditor';


interface Project {
  id: string;
  name: string;
  path: string;
  created: string;
  modified: string;
  settings: {
    description?: string;
    author?: string;
    version?: string;
    tags?: string[];
  };
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileNode[];
}

interface ProjectModalProps {
  onClose: () => void;
  onProjectCreated?: (project: Project) => void;
  onProjectDeleted?: (projectId: string) => void;
}

// File content viewer modal
const FileViewer: React.FC<{
  file: FileNode;
  projectId: string;
  onClose: () => void;
}> = ({ file, projectId, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadFileContent = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getFileContent(projectId, file.path);
        setContent(response.data.content || '');
      } catch (error) {
        console.error('Failed to load file content:', error);
        setError('Failed to load file content');
      } finally {
        setLoading(false);
      }
    };
    
    loadFileContent();
  }, [file.path, projectId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const languageMap: { [key: string]: string } = {
      'py': 'python',
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'md': 'markdown',
      'txt': 'text',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'java': 'java',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'r': 'r',
      'lua': 'lua',
      'dart': 'dart',
      'vue': 'vue',
      'dockerfile': 'docker',
      'Dockerfile': 'docker',
      'makefile': 'makefile',
      'Makefile': 'makefile',
      'ini': 'ini',
      'toml': 'toml',
      'env': 'bash',
      'gitignore': 'git',
      'log': 'log',
    };
    return languageMap[ext] || languageMap[filename] || 'text';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg w-[90%] max-w-4xl h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4" />
            <h3 className="font-semibold">{file.name}</h3>
            <span className="text-sm text-gray-500">
              {file.path}
            </span>
            {file.size && (
              <span className="text-xs text-gray-400">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-sm hover:bg-gray-100 rounded flex items-center gap-1"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1 text-sm hover:bg-gray-100 rounded flex items-center gap-1"
              title="Download file"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button onClick={onClose} className="hover:bg-gray-100 p-1 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500">{error}</div>
            </div>
          ) : (
            <div className="h-full">
              <CodeEditor
                value={content}
                onChange={() => {}} // Read-only, no need to handle changes
                language={getLanguage(file.name)}
                readOnly={true}
                theme="dark"
                height="100%"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// File tree component
const FileTree: React.FC<{
  node: FileNode;
  level?: number;
  projectId: string;
  onFileClick: (file: FileNode) => void;
}> = ({ node, level = 0, projectId, onFileClick }) => {
  const [expanded, setExpanded] = useState(false);

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['py', 'js', 'ts', 'jsx', 'tsx'].includes(ext)) return <FileCode className="w-4 h-4 text-blue-500" />;
    if (['json', 'yaml', 'yml'].includes(ext)) return <FileJson className="w-4 h-4 text-green-500" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return <Image className="w-4 h-4 text-purple-500" />;
    if (['mp4', 'avi', 'mov', 'webm'].includes(ext)) return <Film className="w-4 h-4 text-pink-500" />;
    if (['txt', 'md', 'log'].includes(ext)) return <FileText className="w-4 h-4 text-gray-500" />;
    return <File className="w-4 h-4 text-gray-400" />;
  };

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded);
    } else {
      onFileClick(node);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-gray-100 cursor-pointer rounded"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={handleClick}
      >
        {node.type === 'directory' ? (
          <>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {expanded ? <FolderOpen className="w-4 h-4 text-yellow-600" /> : <Folder className="w-4 h-4 text-yellow-600" />}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="text-sm ml-1">{node.name}</span>
        {node.type === 'file' && node.size && (
          <span className="text-xs text-gray-400 ml-auto">
            {(node.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
      
      {node.type === 'directory' && expanded && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTree
              key={`${child.path}-${index}`}
              node={child}
              level={level + 1}
              projectId={projectId}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ProjectModal: React.FC<ProjectModalProps> = ({ 
  onClose, 
  onProjectCreated,
  onProjectDeleted 
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create project form state
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectAuthor, setProjectAuthor] = useState('');
  const [projectTags, setProjectTags] = useState('');
  
  // Edit state
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  
  // File explorer state
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectFiles, setProjectFiles] = useState<{ [projectId: string]: FileNode[] }>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<{ file: FileNode; projectId: string } | null>(null);

  useEffect(() => {
    loadProjects();
    loadDefaultPath();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getProjects();
      setProjects(response.data || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadDefaultPath = async () => {
    try {
      const response = await apiClient.getDefaultProjectPath();
      setProjectPath(response.data.path || './projects');
    } catch (error) {
      // Use default if API fails
      setProjectPath('./projects');
    }
  };

  const loadProjectFiles = async (projectId: string) => {
    try {
      setLoadingFiles(prev => new Set(prev).add(projectId));
      const response = await apiClient.getProjectFiles(projectId);
      setProjectFiles(prev => ({
        ...prev,
        [projectId]: response.data.files || []
      }));
    } catch (error) {
      console.error('Failed to load project files:', error);
      setError('Failed to load project files');
    } finally {
      setLoadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const toggleProjectExpand = async (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
      // Load files if not already loaded
      if (!projectFiles[projectId]) {
        await loadProjectFiles(projectId);
      }
    }
    setExpandedProjects(newExpanded);
  };

  const validateProjectName = (name: string): boolean => {
    // Project name validation
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(name) && name.length > 0 && name.length <= 50;
  };

  const handleCreateProject = async () => {
    // Validation
    if (!validateProjectName(projectName)) {
      setError('Project name must contain only letters, numbers, hyphens, and underscores');
      return;
    }

    if (!projectPath) {
      setError('Project path is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const projectData = {
        name: projectName,
        path: projectPath,
        settings: {
          description: projectDescription,
          author: projectAuthor,
          version: '1.0.0',
          tags: projectTags.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      };

      const response = await apiClient.createProject(projectData);
      
      if (response.data) {
        // Store project info in localStorage for quick access
        const project = response.data;
        
        // Save full project data
        localStorage.setItem(`project_${project.id}`, JSON.stringify(project));
        
        // Also save individual fields for backward compatibility
        localStorage.setItem(`project_${project.id}_path`, project.path);
        localStorage.setItem(`project_${project.id}_name`, project.name);
        
        // Save to projects list
        const existingProjects = JSON.parse(localStorage.getItem('projects') || '[]');
        const updatedProjects = [...existingProjects, project];
        localStorage.setItem('projects', JSON.stringify(updatedProjects));
        
        // Reload projects list
        await loadProjects();
        
        // Clear form
        setProjectName('');
        setProjectDescription('');
        setProjectAuthor('');
        setProjectTags('');
        
        // Switch to manage tab
        setActiveTab('manage');
        
        // Notify parent
        if (onProjectCreated) {
          onProjectCreated(project);
        }
        
        // Show success message
        setError(null);
      }
    } catch (error: any) {
      console.error('Failed to create project:', error);
      setError(error.response?.data?.detail || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await apiClient.deleteProject(projectId);
      
      // Remove from localStorage
      localStorage.removeItem(`project_${projectId}`);
      localStorage.removeItem(`project_${projectId}_path`);
      localStorage.removeItem(`project_${projectId}_name`);
      
      // Remove from projects list in localStorage
      const existingProjects = JSON.parse(localStorage.getItem('projects') || '[]');
      const updatedProjects = existingProjects.filter((p: Project) => p.id !== projectId);
      localStorage.setItem('projects', JSON.stringify(updatedProjects));
      
      // Remove from expanded projects
      const newExpanded = new Set(expandedProjects);
      newExpanded.delete(projectId);
      setExpandedProjects(newExpanded);
      
      // Remove from project files
      const newProjectFiles = { ...projectFiles };
      delete newProjectFiles[projectId];
      setProjectFiles(newProjectFiles);
      
      // Reload projects
      await loadProjects();
      
      // Notify parent
      if (onProjectDeleted) {
        onProjectDeleted(projectId);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      setError('Failed to delete project');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project.id);
    setEditForm({
      name: project.name,
      settings: { ...project.settings }
    });
  };

  const handleSaveEdit = async (projectId: string) => {
    try {
      setLoading(true);
      await apiClient.updateProject(projectId, editForm);
      
      // Update localStorage
      if (editForm.name) {
        localStorage.setItem(`project_${projectId}_name`, editForm.name);
      }
      
      // Update full project data in localStorage
      const projectData = localStorage.getItem(`project_${projectId}`);
      if (projectData) {
        const project = JSON.parse(projectData);
        const updatedProject = {
          ...project,
          ...editForm,
          modified: new Date().toISOString()
        };
        localStorage.setItem(`project_${projectId}`, JSON.stringify(updatedProject));
        
        // Update projects list in localStorage
        const existingProjects = JSON.parse(localStorage.getItem('projects') || '[]');
        const updatedProjects = existingProjects.map((p: Project) => 
          p.id === projectId ? updatedProject : p
        );
        localStorage.setItem('projects', JSON.stringify(updatedProjects));
      }
      
      // Reload projects
      await loadProjects();
      setEditingProject(null);
    } catch (error) {
      console.error('Failed to update project:', error);
      setError('Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingProject(null);
    setEditForm({});
  };

  const handleFileClick = (file: FileNode, projectId: string) => {
    setSelectedFile({ file, projectId });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-[900px] max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FolderPlus className="w-5 h-5" />
              Project Management
            </h2>
            <button onClick={onClose} className="text-2xl hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-2 font-medium transition-all ${
                activeTab === 'create' 
                  ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Create New Project
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2 font-medium transition-all ${
                activeTab === 'manage' 
                  ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Manage Projects ({projects.length})
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {activeTab === 'create' ? (
              // Create Project Tab
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="my-awesome-project"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Only letters, numbers, hyphens, and underscores allowed
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Path *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectPath}
                      onChange={(e) => setProjectPath(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="./projects"
                    />
                    <button
                      onClick={() => {
                        // In a real app, this would open a directory picker
                        alert('Directory picker would open here');
                      }}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      Browse...
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Full path will be: {projectPath}/{projectName || 'project-name'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Brief description of your project..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={projectAuthor}
                    onChange={(e) => setProjectAuthor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Your name or team name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={projectTags}
                    onChange={(e) => setProjectTags(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="animation, 3d, short-film (comma separated)"
                  />
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleCreateProject}
                    disabled={loading || !projectName || !projectPath}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      loading || !projectName || !projectPath
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-500 text-white hover:bg-indigo-600'
                    }`}
                  >
                    <FolderPlus className="w-4 h-4" />
                    {loading ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </div>
            ) : (
              // Manage Projects Tab
              <div className="space-y-4">
                {loading && projects.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading projects...
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No projects yet</p>
                    <p className="text-sm mt-1">Create your first project to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <div className="p-4 hover:bg-gray-50">
                          {editingProject === project.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-2 py-1 border rounded focus:outline-none focus:border-indigo-500"
                              />
                              <textarea
                                value={editForm.settings?.description || ''}
                                onChange={(e) => setEditForm({
                                  ...editForm,
                                  settings: { ...editForm.settings, description: e.target.value }
                                })}
                                className="w-full px-2 py-1 border rounded focus:outline-none focus:border-indigo-500"
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEdit(project.id)}
                                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <>
                              <div className="flex justify-between items-start">
                                <div 
                                  className="flex-1 cursor-pointer"
                                  onClick={() => toggleProjectExpand(project.id)}
                                >
                                  <h3 className="font-semibold text-lg flex items-center gap-2">
                                    {expandedProjects.has(project.id) ? 
                                      <ChevronDown className="w-4 h-4" /> : 
                                      <ChevronRight className="w-4 h-4" />
                                    }
                                    <Folder className="w-4 h-4 text-indigo-500" />
                                    {project.name}
                                  </h3>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {project.path}/{project.name}
                                  </p>
                                  {project.settings.description && (
                                    <p className="text-sm text-gray-700 mt-2">
                                      {project.settings.description}
                                    </p>
                                  )}
                                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                    <span>Created: {new Date(project.created).toLocaleDateString()}</span>
                                    <span>Modified: {new Date(project.modified).toLocaleDateString()}</span>
                                    {project.settings.author && (
                                      <span>Author: {project.settings.author}</span>
                                    )}
                                  </div>
                                  {project.settings.tags && project.settings.tags.length > 0 && (
                                    <div className="flex gap-1 mt-2">
                                      {project.settings.tags.map((tag, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 ml-4">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditProject(project);
                                    }}
                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    title="Edit project"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project.id);
                                    }}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete project"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        
                        {/* File Explorer */}
                        {expandedProjects.has(project.id) && !editingProject && (
                          <div className="border-t bg-gray-50 p-4">
                            {loadingFiles.has(project.id) ? (
                              <div className="text-sm text-gray-500 text-center py-4">
                                Loading files...
                              </div>
                            ) : projectFiles[project.id] && projectFiles[project.id].length > 0 ? (
                              <div className="max-h-64 overflow-y-auto">
                                {projectFiles[project.id].map((file, index) => (
                                  <FileTree
                                    key={`${file.path}-${index}`}
                                    node={file}
                                    projectId={project.id}
                                    onFileClick={(file) => handleFileClick(file, project.id)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 text-center py-4">
                                No files found in this project
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* File Viewer Modal */}
      {selectedFile && (
        <FileViewer
          file={selectedFile.file}
          projectId={selectedFile.projectId}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </>
  );
};