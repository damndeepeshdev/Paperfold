import { useState, useEffect } from 'react';
import {
    Folder as FolderIcon,
    File as FileIcon,
    Upload,
    Home,
    Clock,
    Star,
    Trash2,
    Search,
    LogOut,
    List,
    Cloud,

    ChevronRight,
    X,
    CheckCircle,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronUp,
    RotateCw,
    Plus,
    FolderPlus,
    LayoutGrid,
    Sun,
    Moon,
    Pencil
} from 'lucide-react';
import FileCard, { FileItem } from './FileCard';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
// We will add opener import after we verify package.json
// For now, let's just wait.
import { FileMetadata, Folder } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface UserProfile {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    phone?: string;
}

export default function Dashboard() {
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [folderName, setFolderName] = useState<string>("My Drive");
    const [folders, setFolders] = useState<Folder[]>([]);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [refresh, setRefresh] = useState(0);
    const [currentSection, setCurrentSection] = useState<'drive' | 'recent' | 'starred' | 'trash'>('drive');
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([{ id: null, name: 'My Drive' }]);
    const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [renameItem, setRenameItem] = useState<{ id: string, type: 'file' | 'folder', name: string } | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [itemToDelete, setItemToDelete] = useState<{ id: string, isFolder: boolean, name: string, deleteType: 'soft' | 'hard' } | null>(null);
    const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [storageUsage, setStorageUsage] = useState<string>("0 KB");
    const [isUploadProgressMinimized, setIsUploadProgressMinimized] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        invoke<UserProfile>('get_current_user').then(setUser).catch(console.error);

        // Load theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            setIsDarkMode(true);
        } else {
            document.documentElement.classList.remove('dark');
            setIsDarkMode(false);
        }
    }, []);

    const fetchStorageUsage = async () => {
        try {
            const usage = await invoke<string>('get_storage_usage');
            setStorageUsage(usage);
        } catch (e) {
            console.error("Failed to fetch storage usage", e);
        }
    };

    const fetchFiles = async () => {
        try {
            fetchStorageUsage(); // Update storage stats whenever files are fetched
            if (currentSection === 'trash') {
                console.log("Fetching trash...");
                const data = await invoke<[Folder[], FileMetadata[]]>('fetch_trash');
                setFolders(data[0]);
                setFiles(data[1]);
                setFolders(data[0]);
                setFiles(data[1]);
            } else if (currentSection === 'starred') {
                console.log("Fetching starred items...");
                const data = await invoke<[Folder[], FileMetadata[]]>('fetch_starred');
                setFolders(data[0]);
                setFiles(data[1]);
            } else {
                console.log("Fetching files for folder:", currentFolder);
                const data = await invoke<[Folder[], FileMetadata[]]>('fetch_files', {
                    folder_id: currentFolder,
                    folderId: currentFolder
                });
                setFolders(data[0]);
                setFiles(data[1]);
            }
        } catch (e) {
            console.error("Fetch failed", e);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, [currentFolder, refresh]);

    const handleNavigate = (folderId: string | null, folderName: string) => {
        console.log("Navigating to:", folderId, folderName);
        setCurrentFolder(folderId);
        setFolderName(folderName);
        // If navigating to root (null), reset or handle accordingly? 
        // Actually if folderId is null, it's root.
        if (folderId) {
            setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
        } else {
            // Reset to just Home? Or handle in breadcrumb click.
            // Usually handleNavigate is forward.
        }
    };

    const handleBreadcrumbClick = (index: number) => {
        const item = breadcrumbs[index];
        console.log("Breadcrumb click:", item);
        setCurrentFolder(item.id === 'root' ? null : item.id);
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(newBreadcrumbs);
        setFolderName(item.name === 'Home' ? 'My Cloud' : item.name);
    };

    const [uploadQueue, setUploadQueue] = useState<{ path: string, name: string, status: 'pending' | 'uploading' | 'completed' | 'error', progress: number }[]>([]);

    // Real Progress Listener
    useEffect(() => {
        let unlisten: () => void;
        async function setupListener() {
            unlisten = await listen<{ path: string, progress: number }>('upload-progress', (event) => {
                setUploadQueue(prev => prev.map(item => {
                    if (item.path === event.payload.path && item.status === 'uploading') {
                        return { ...item, progress: event.payload.progress };
                    }
                    return item;
                }));
            });
        }
        setupListener();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        const processQueue = async () => {
            // Concurrency Control: Max 3 parallel files
            const activeuploads = uploadQueue.filter(item => item.status === 'uploading').length;
            if (activeuploads >= 3) return;

            const pendingItemIndex = uploadQueue.findIndex(item => item.status === 'pending');
            if (pendingItemIndex === -1) return;

            const item = uploadQueue[pendingItemIndex];

            // Mark as uploading immediately to prevent duplicate triggers
            setUploadQueue(prev => prev.map((q, i) => i === pendingItemIndex ? { ...q, status: 'uploading', progress: 0 } : q));

            try {
                console.log("Starting upload:", item.path, "Target Folder:", (item as any).targetFolderId);
                // We use the folder that was active WHEN the file was added. 
                // Currently, we just use 'currentFolder' from state, which might have changed since the file was added to queue?
                // The user complained about files appearing in wrong folders.
                // We should probably store the target folder IN the queue item.
                // For now, let's stick to the requested parallel change, but note that `currentFolder` here is risky if user navigates away.
                // BETTER: Use the currentFolder at the time of processing? Or should we have captured it?
                // Standard behavior: Upload to the folder you are IN when it starts? Or when you added it?
                // Usually when you added it. 
                // I'll leave `currentFolder` as is for now but this is a potential bug vector for the visibility issue.

                await invoke('upload_file', {
                    path: item.path,
                    folder_id: (item as any).targetFolderId,
                    folderId: (item as any).targetFolderId
                });

                // Mark as completed
                setUploadQueue(prev => prev.map((q, i) => i === pendingItemIndex ? { ...q, status: 'completed', progress: 100 } : q));
                setRefresh(prev => prev + 1);
            } catch (e) {
                console.error("Upload failed for", item.path, e);
                setUploadQueue(prev => prev.map((q, i) => i === pendingItemIndex ? { ...q, status: 'error', progress: 0 } : q));
                alert(`Failed to upload ${item.name}: ${e}`);
            }
        };

        processQueue();

    }, [uploadQueue]); // Re-run when queue changes

    // Helper Functions
    const formatSize = (bytes?: number | string) => {
        if (bytes === undefined) return '-';
        if (typeof bytes === 'string') return bytes;
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handlePreview = async (item: FileItem) => {
        if (item.type === 'file') {
            try {
                const idNum = parseInt(item.id);
                if (!isNaN(idNum)) {
                    await invoke('preview_file', { messageId: idNum });
                }
            } catch (e) {
                console.error("Preview failed", e);
            }
        }
    };

    const handleTrash = (id: string, isFolder: boolean, name: string) => {
        setItemToDelete({ id, isFolder, name, deleteType: 'soft' });
    };

    const handleToggleStar = async (item: FileItem) => {
        try {
            const isFolder = item.type === 'folder';
            await invoke('toggle_star', { id: item.id, isFolder });

            // Optimistic update
            if (isFolder) {
                setFolders(prev => prev.map(f => f.id === item.id ? { ...f, is_starred: !f.is_starred } : f));
            } else {
                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, is_starred: !f.is_starred } : f));
            }

            // If currently viewing starred items, we might want to remove it from view if unstarred
            // But immediate removal can be jarring. Let's see. 
            // If we unstar in starred view, it should probably disappear.
            if (currentSection === 'starred') {
                if (isFolder) {
                    setFolders(prev => prev.filter(f => f.id !== item.id));
                } else {
                    setFiles(prev => prev.filter(f => f.id !== item.id));
                }
            }
        } catch (e) {
            console.error("Failed to toggle star", e);
        }
    };


    const handleUpload = async () => {
        setIsNewMenuOpen(false);
        try {
            const selected = await open({
                multiple: true, // Enable multiple
                directory: false,
            });

            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                // Add to queue with the CURRENT folder as the target
                const targetFolderId = currentFolder;
                const newItems = paths.map(path => ({
                    path,
                    name: path.split(/[/\\]/).pop() || 'Unknown File',
                    status: 'pending' as const,
                    progress: 0,
                    targetFolderId: targetFolderId // Store it!
                }));
                setUploadQueue(prev => [...prev, ...newItems]);
                // We don't trigger loading here, queue handles it visible logic
            }
        } catch (e) {
            console.error("Upload selection failed", e);
        }
    };

    const openCreateFolderModal = () => {
        setIsNewMenuOpen(false);
        setIsCreateFolderOpen(true);
        setNewFolderName("");
    };

    const handleCreateFolderSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newFolderName.trim()) return;

        try {
            setIsLoading(true);
            setIsCreateFolderOpen(false);
            console.log("Invoking create_folder", { name: newFolderName, parent_id: currentFolder });
            await invoke('create_folder', {
                name: newFolderName,
                parent_id: currentFolder,
                parentId: currentFolder
            });
            console.log("Folder created successfully");
            setRefresh(prev => prev + 1);
        } catch (err) {
            console.error("Create folder failed", err);
            alert("Failed to create folder: " + err);
        } finally {
            setIsLoading(false);
        }
    };



    const handleRename = async (id: string, currentName: string, isFolder: boolean) => {
        const newName = prompt("Rename to:", currentName);
        if (newName && newName !== currentName) {
            try {
                await invoke('rename_item', {
                    id,
                    is_folder: isFolder,
                    isFolder,
                    new_name: newName,
                    newName
                });
                setRefresh(prev => prev + 1);
            } catch (e) {
                console.error("Rename failed", e);
                alert("Rename failed: " + e);
            }
        }
    };

    const handleRestore = async (id: string, isFolder: boolean) => {
        try {
            await invoke('restore_item', { id, is_folder: isFolder, isFolder });
            setRefresh(prev => prev + 1);
        } catch (e) {
            console.error("Restore failed", e);
            alert("Restore failed: " + e);
        }
    };

    const handleEmptyTrash = async () => {
        setIsEmptyTrashOpen(false);
        try {
            setIsLoading(true);
            await invoke('empty_trash');
            setRefresh(prev => prev + 1);
        } catch (e) {
            console.error("Empty trash failed", e);
            alert("Empty trash failed: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteForever = (id: string, isFolder: boolean, name: string = "Item") => {
        setItemToDelete({ id, isFolder, name, deleteType: 'hard' });
    };



    useEffect(() => {
        fetchFiles();
    }, [currentFolder, refresh, currentSection]);



    const handleDownload = async (fileId: string) => {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        try {
            const savePath = await save({
                defaultPath: file.name,
            });

            if (savePath) {
                // Send both cases to be safe against Tauri's argument matching quirks
                await invoke('download_file_core', {
                    file_id: fileId,
                    fileId: fileId,
                    save_path: savePath,
                    savePath: savePath
                });
                alert("Download complete!");
            }
        } catch (e) {
            console.error("Download failed", e);
            alert("Download failed: " + e);
        }
    };

    const handleDelete = (id: string, name: string, isFolder: boolean) => {
        setItemToDelete({ id, isFolder, name, deleteType: 'soft' });
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            setIsLoading(true);
            if (itemToDelete.deleteType === 'hard') {
                await invoke('delete_item_permanently', {
                    id: itemToDelete.id,
                    is_folder: itemToDelete.isFolder,
                    isFolder: itemToDelete.isFolder
                });
            } else {
                await invoke('delete_item', {
                    id: itemToDelete.id,
                    is_folder: itemToDelete.isFolder,
                    isFolder: itemToDelete.isFolder
                });
            }
            setRefresh(prev => prev + 1);
            setItemToDelete(null);
        } catch (e) {
            console.error("Delete failed", e);
            alert("Delete failed: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        // Reload for now as per basic auth flow
        window.location.reload();
    };

    const allItems: FileItem[] = [
        ...folders.map(f => ({ id: f.id, name: f.name, type: 'folder' as const, modified: 'Just now', is_starred: f.is_starred })),
        ...uploadQueue.filter(q => q.status === 'pending' || q.status === 'uploading').map((q, i) => ({
            id: `upload-${i}`,
            name: q.name,
            type: 'file' as const,
            size: q.status === 'uploading' ? 'Uploading...' : 'Queued',
            mimeType: 'application/octet-stream' // placeholder
        })),
        ...files.map(f => ({ id: f.id, name: f.name, type: 'file' as const, size: (f.size / 1024 / 1024).toFixed(2) + ' MB', mimeType: f.mime_type, is_starred: f.is_starred }))
    ];

    function itemsSection(items: FileItem[], title: string) {
        if (items.length === 0) return null;
        return (
            <div className="mb-8">
                <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">{title}</h2>
                <div className={`grid gap-4 ${view === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1'}`}>
                    {items.map(file => (
                        <FileCard
                            key={file.id}
                            item={file}
                            onToggleStar={(item) => handleToggleStar(item)}
                            onNavigate={currentSection === 'trash' ? undefined : (id) => handleNavigate(id, file.name)}
                            onDownload={currentSection === 'trash' ? undefined : handleDownload}
                            onDelete={(id) => currentSection === 'trash'
                                ? handleDeleteForever(id, file.type === 'folder', file.name)
                                : handleDelete(id, file.name, file.type === 'folder')
                            }
                            onRename={currentSection === 'trash' ? undefined : (id) => handleRename(id, file.name, file.type === 'folder')}
                            onRestore={currentSection === 'trash' ? (id) => handleRestore(id, file.type === 'folder') : undefined}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background text-foreground font-sans selection:bg-blue-200">
            {/* Loading Indicator */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-b-lg shadow-lg text-sm font-medium"
                    >
                        Processing...
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className="w-72 bg-card flex flex-col pt-8 pb-6 border-r border-border z-20 transition-colors">
                {/* Logo */}
                <div className="px-8 mb-10 flex items-center gap-3">
                    <Cloud className="w-8 h-8 text-blue-600 dark:text-blue-500 fill-blue-600 dark:fill-blue-500" />
                    <span className="text-2xl font-bold tracking-tight text-foreground">
                        Cloud<span className="text-blue-600 dark:text-blue-500">Drive</span>
                    </span>
                </div>

                {/* Primary Actions */}
                <div className="px-2 mb-6">
                    <div className="relative">
                        <button
                            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] w-full"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="font-semibold text-base">New</span>
                        </button>

                        {/* Dropdown */}
                        <AnimatePresence>
                            {isNewMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsNewMenuOpen(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                        className="absolute top-full left-0 w-full mt-2 bg-popover text-popover-foreground rounded-xl shadow-xl border border-border p-2 z-20"
                                    >
                                        <button onClick={(e) => { e.stopPropagation(); openCreateFolderModal(); }} className="flex items-center gap-3 w-full p-2 hover:bg-muted rounded-lg text-left text-sm font-medium text-popover-foreground transition-colors">
                                            <FolderPlus className="w-4 h-4 text-muted-foreground" />
                                            New Folder
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleUpload(); }} className="flex items-center gap-3 w-full p-2 hover:bg-muted rounded-lg text-left text-sm font-medium text-popover-foreground transition-colors">
                                            <Upload className="w-4 h-4 text-muted-foreground" />
                                            File Upload
                                        </button>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Create Folder Modal */}
                <AnimatePresence>
                    {isCreateFolderOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-card text-card-foreground rounded-2xl shadow-xl p-6 w-96 border border-border"
                            >
                                <h3 className="text-lg font-semibold mb-4 text-foreground">New Folder</h3>
                                <form onSubmit={handleCreateFolderSubmit}>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Folder Name"
                                        className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all mb-6"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                    />
                                    <div className="flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsCreateFolderOpen(false)}
                                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-all shadow-lg shadow-primary/20"
                                            disabled={!newFolderName.trim()}
                                        >
                                            Create
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Delete Confirmation Modal */}
                <AnimatePresence>
                    {itemToDelete && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-background rounded-2xl shadow-xl p-6 w-96 border border-border"
                            >
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground">Delete Item?</h3>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        Are you sure you want to {itemToDelete.deleteType === 'hard' ? 'permanently delete' : 'move to trash'} <span className="font-medium text-foreground">"{itemToDelete.name}"</span>?
                                        {itemToDelete.isFolder && " This will delete all files inside it."}
                                        {itemToDelete.deleteType === 'hard' && <><br /><span className="text-destructive font-bold">This action cannot be undone.</span></>}
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setItemToDelete(null)}
                                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1 bg-secondary rounded-lg hover:bg-secondary/80"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-red-600/20 flex-1"
                                    >
                                        {itemToDelete.deleteType === 'hard' ? 'Delete Forever' : 'Move to Trash'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Navigation */}
                <nav className="flex-1 space-y-1 px-2">
                    {[
                        { icon: Home, label: 'My Drive', id: 'drive' as const },
                        { icon: Clock, label: 'Recent', id: 'recent' as const },
                        { icon: Star, label: 'Starred', id: 'starred' as const },
                        { icon: Trash2, label: 'Trash', id: 'trash' as const },
                    ].map((item, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                setCurrentSection(item.id);
                                if (item.id === 'drive') {
                                    setCurrentFolder(null); // Go to root when clicking My Drive
                                    setFolderName('My Drive');
                                } else if (item.id === 'trash') {
                                    setFolderName('Trash');
                                }
                            }}
                            className={`flex items-center gap-3 w-full px-4 py-3 rounded-full text-sm font-medium transition-colors ${currentSection === item.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            <item.icon className={`w-5 h-5 ${currentSection === item.id ? 'text-primary' : 'text-muted-foreground'}`} />
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* Storage Status */}
                <div className="px-6 mt-6">
                    <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                        <div className="flex items-center gap-2 mb-2 text-primary">
                            <Cloud className="w-5 h-5 fill-current" />
                            <span className="text-sm font-semibold">Storage</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-1.5 mb-2 overflow-hidden">
                            <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: (storageUsage === '0.00 B' || storageUsage === '0.00 KB' || storageUsage === '0 B') ? '0%' : '5%' }}></div>
                        </div>
                        <div className="flex justify-between items-end">
                            <p className="text-lg font-bold text-foreground">{storageUsage}</p>
                            <p className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">Used</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Telegram Unlimited Cloud</p>
                    </div>
                </div>
                {/* User Profile */}
                {user && (
                    <div className="px-6 pb-6 mt-auto">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                                {user.first_name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate">
                                    {user.first_name} {user.last_name || ''}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {user.phone ? `+${user.phone}` : `ID: ${user.id}`}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-background rounded-tl-3xl shadow-[-10px_-10px_30px_rgba(0,0,0,0.02)] border-l border-t border-border transition-colors duration-200">

                {/* Header */}
                <header className="h-20 px-8 flex items-center justify-between border-b border-gray-100/50 dark:border-gray-800 transition-colors duration-200">

                    {/* Search */}
                    <div className="flex-1 max-w-2xl mx-auto px-4">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder={`Search in ${folderName}`}
                                className="w-full h-12 pl-12 pr-4 bg-muted/50 hover:bg-muted focus:bg-background border border-transparent focus:border-ring rounded-full text-sm transition-all outline-none focus:ring-4 focus:ring-ring/10 placeholder:text-muted-foreground font-medium text-foreground"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 ml-4">
                        <button
                            onClick={async () => {
                                setIsRefreshing(true);
                                setRefresh(prev => prev + 1);
                                await fetchStorageUsage();
                                // Add a small delay so the user sees the spin
                                setTimeout(() => setIsRefreshing(false), 800);
                            }}
                            className="p-3 hover:bg-muted rounded-full text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            title="Refresh"
                            disabled={isRefreshing}
                        >
                            <RotateCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="p-3 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                            title="Log Out"
                        >
                            <LogOut className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => {
                                const newMode = !isDarkMode;
                                if (newMode) {
                                    document.documentElement.classList.add('dark');
                                    localStorage.setItem('theme', 'dark');
                                } else {
                                    document.documentElement.classList.remove('dark');
                                    localStorage.setItem('theme', 'light');
                                }
                                setIsDarkMode(newMode);
                            }}
                            className="p-3 hover:bg-muted rounded-full text-muted-foreground hover:text-primary transition-colors"
                        >
                            {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                        </button>

                    </div>
                </header>

                {/* Empty Trash Modal */}
                {/* Empty Trash Modal */}
                <AnimatePresence>
                    {isEmptyTrashOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-background rounded-2xl shadow-xl p-6 w-96 border border-border"
                            >
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground">Empty Trash?</h3>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        Are you sure you want to delete <span className="font-medium text-foreground">all items</span> in the trash?
                                        <br /><span className="text-destructive font-bold">This action cannot be undone.</span>
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsEmptyTrashOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1 bg-secondary rounded-lg hover:bg-secondary/80"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleEmptyTrash}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-red-600/20 flex-1"
                                    >
                                        Empty Trash
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toolbar / Breadcrumbs */}
                <div className="px-8 py-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                        {breadcrumbs.map((crumb, index) => (
                            <div key={index} className="flex items-center gap-2">
                                {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground/50" />}
                                <button
                                    onClick={() => handleBreadcrumbClick(index)}
                                    className={`hover:bg-muted px-2 py-1 rounded-lg transition-colors ${index === breadcrumbs.length - 1
                                        ? 'text-foreground font-bold'
                                        : 'hover:text-foreground'
                                        }`}
                                >
                                    {crumb.name}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        {currentSection === 'trash' && (
                            <button
                                onClick={() => setIsEmptyTrashOpen(true)}
                                disabled={allItems.length === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium ${allItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Trash2 className="w-4 h-4" />
                                Empty Trash
                            </button>
                        )}

                        <div className="flex items-center gap-2 border border-border rounded-full p-1 bg-card shadow-sm transition-colors">
                            <button
                                onClick={() => setView('list')}
                                className={`p-2 rounded-full transition-all ${view === 'list'
                                    ? 'bg-secondary text-secondary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <List className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setView('grid')}
                                className={`p-2 rounded-full transition-all ${view === 'grid'
                                    ? 'bg-secondary text-secondary-foreground'
                                    : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-auto px-8 pb-8">
                    {view === 'grid' ? (
                        <>
                            {itemsSection(allItems.filter(f => f.type === 'folder'), "Folders")}
                            {itemsSection(allItems.filter(f => f.type === 'file'), "Files")}
                        </>
                    ) : (
                        <div className="border border-border rounded-xl overflow-hidden bg-card">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted text-muted-foreground font-medium">
                                    <tr>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Size</th>
                                        <th className="px-4 py-3">Last Modified</th>
                                        <th className="px-4 py-3 w-32 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {allItems.map(item => (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-muted/50 transition-colors group cursor-pointer"
                                            onClick={(e) => {
                                                if ((e.target as HTMLElement).closest('button')) return;
                                                if (item.type === 'folder') {
                                                    setCurrentFolder(item.id);
                                                    setFolderName(item.name);
                                                } else {
                                                    handlePreview(item);
                                                }
                                            }}
                                        >
                                            <td className="px-4 py-3 font-medium text-card-foreground flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${item.type === 'folder' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                                                    {item.type === 'folder' ? <FolderIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                                                </div>
                                                {item.name}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {item.type === 'file' ? formatSize(item.size) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {item.modified ? formatDate(item.modified) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenameItem({ id: item.id, type: item.type, name: item.name });
                                                            setIsRenameOpen(true);
                                                        }}
                                                        className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                                        title="Rename"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleStar(item);
                                                        }}
                                                        className={`p-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded ${item.is_starred ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`}
                                                        title={item.is_starred ? "Unstar" : "Star"}
                                                    >
                                                        <Star className={`w-4 h-4 ${item.is_starred ? 'fill-current' : ''}`} />
                                                    </button>

                                                    {item.type === 'file' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDownload(item.id);
                                                            }}
                                                            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                                            title="Download"
                                                        >
                                                            <Upload className="w-4 h-4 rotate-180" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleTrash(item.id, item.type === 'folder', item.name);
                                                        }}
                                                        className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {allItems.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center text-center p-8 max-w-sm mx-auto mt-20"
                        >
                            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                                <Cloud className="w-12 h-12 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium text-foreground">Nothing here yet</p>
                            <p className="text-sm text-muted-foreground mt-2">Upload files or create folders to get started</p>
                        </motion.div>
                    )}
                </div>
            </main >

            {/* Upload Progress Panel (Google Drive Style) */}
            <AnimatePresence>
                {uploadQueue.length > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 right-6 w-96 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                            <span className="font-medium text-sm">
                                {uploadQueue.filter(i => i.status === 'pending' || i.status === 'uploading').length === 0
                                    ? "Uploads complete"
                                    : `Uploading ${uploadQueue.filter(i => i.status === 'pending' || i.status === 'uploading').length} items`
                                }
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsUploadProgressMinimized(!isUploadProgressMinimized)}
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                >
                                    {isUploadProgressMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => setUploadQueue([])}
                                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        {!isUploadProgressMinimized && (
                            <div className="max-h-60 overflow-y-auto bg-white">
                                {uploadQueue.map((item, index) => (
                                    <div key={index} className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 last:border-0 hover:bg-gray-50 transition-colors">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <FileIcon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
                                                {item.status === 'uploading' && (
                                                    <span className="text-xs text-blue-600 font-medium">{Math.round(item.progress)}%</span>
                                                )}
                                            </div>

                                            {/* Progress Bar or Status Text */}
                                            {item.status === 'uploading' ? (
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <motion.div
                                                        className="bg-blue-600 h-full rounded-full"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${item.progress}%` }}
                                                        transition={{ duration: 0.5 }}
                                                    />
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400">
                                                    {item.status === 'pending' && "Waiting..."}
                                                    {item.status === 'completed' && "Completed"}
                                                    {item.status === 'error' && "Failed"}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            {item.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                                            {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                                            {item.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                                            {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Rename Modal */}
            <AnimatePresence>
                {isRenameOpen && renameItem && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsRenameOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-semibold mb-4 text-foreground">Rename</h3>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                const name = fd.get('name') as string;
                                if (name && name.trim() !== "" && name !== renameItem.name) {
                                    try {
                                        await invoke('rename_item', {
                                            id: renameItem.id,
                                            newName: name,
                                            isFolder: renameItem.type === 'folder'
                                        });
                                        setRefresh(r => r + 1);
                                        setIsRenameOpen(false);
                                    } catch (err) {
                                        alert("Failed to rename: " + err);
                                    }
                                } else {
                                    setIsRenameOpen(false);
                                }
                            }}>
                                <input
                                    name="name"
                                    defaultValue={renameItem.name}
                                    className="w-full p-3 border border-border rounded-xl mb-4 bg-muted/50 text-foreground outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                    onFocus={e => e.target.select()}
                                />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setIsRenameOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Rename</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div >
    );
}
