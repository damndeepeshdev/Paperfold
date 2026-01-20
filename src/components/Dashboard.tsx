import { useState, useEffect, useRef } from 'react';
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
    Pencil,
    Music,
    Settings,
    ArrowUpDown,
    Calendar,
    ArrowDownAZ,
    HardDrive,
    Tag,
    Palette,
    Smile,
    Grid,
    Server
} from 'lucide-react';
import FileCard, { FileItem } from './FileCard';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
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

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const currentFolderRef = useRef<string | null>(null); // Ref to track currentFolder for listeners
    useEffect(() => { currentFolderRef.current = currentFolder; }, [currentFolder]);

    const [folderName, setFolderName] = useState<string>("My Drive");
    const [folders, setFolders] = useState<Folder[]>([]);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [refresh, setRefresh] = useState(0);
    const [currentSection, setCurrentSection] = useState<'drive' | 'recent' | 'starred' | 'trash'>('drive');
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([{ id: null, name: 'My Drive' }]);
    const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [renameItem, setRenameItem] = useState<{ id: string, type: 'file' | 'folder', name: string } | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

    useEffect(() => {
        const unlistenPromise = listen('download-progress', (event: any) => {
            const { id, progress } = event.payload;
            setDownloadProgress(prev => {
                if (progress >= 100) {
                    const newState = { ...prev };
                    delete newState[id];
                    return newState;
                }
                return { ...prev, [id]: progress };
            });
        });
        return () => {
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);
    const [newFolderName, setNewFolderName] = useState("");
    const [itemToDelete, setItemToDelete] = useState<{ id: string, isFolder: boolean, name: string, deleteType: 'soft' | 'hard', batchIds?: string[] } | null>(null);
    const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);
    const [storageUsage, setStorageUsage] = useState<string>("0 KB");
    const [isUploadProgressMinimized, setIsUploadProgressMinimized] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<{ folders: Folder[], files: FileMetadata[] }>({ folders: [], files: [] });
    const [previewingItem, setPreviewingItem] = useState<FileMetadata | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: FileItem } | null>(null);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [customizationItem, setCustomizationItem] = useState<{
        id: string,
        name: string,
        color?: string,
        icon?: string,
        gradient?: string,
        cover_image?: string,
        emoji?: string,
        pattern?: string,
        show_badges?: boolean,
        tags?: string[]
    } | null>(null);

    const [activeTab, setActiveTab] = useState<'appearance' | 'icon' | 'cover' | 'pattern' | 'tags'>('appearance');

    // Sorting State
    const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

    // Properties Modal State
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertiesItem, setPropertiesItem] = useState<{ id: string, type: 'folder' | 'file', name: string, stats?: { size: number, count: number } } | null>(null);
    const [itemDescription, setItemDescription] = useState("");

    const handleProperties = async (id: string, type: 'folder' | 'file', name: string, description?: string, sizeBytes?: number) => {
        setPropertiesItem({
            id,
            type,
            name,
            stats: sizeBytes !== undefined ? { size: sizeBytes, count: 0 } : undefined
        });
        setIsPropertiesOpen(true);
        setItemDescription(description || ""); // Reset or fetch if available

        if (type === 'folder') {
            try {
                const [size, count] = await invoke<[number, number]>('get_folder_stats', { id });
                setPropertiesItem(prev => prev ? { ...prev, stats: { size, count } } : null);
                // Also fetch description if stored (need to update list fetch to return it first)
            } catch (e) {
                console.error("Failed to get stats", e);
            }
        }
    };

    const CUSTOM_GRADIENTS = [
        'linear-gradient(135deg, #FF6B6B 0%, #556270 100%)',
        'linear-gradient(135deg, #43CBFF 0%, #9708CC 100%)',
        'linear-gradient(135deg, #F05F57 0%, #360940 100%)',
        'linear-gradient(135deg, #FCE38A 0%, #F38181 100%)',
        'linear-gradient(135deg, #EA5C54 0%, #bb6dec 100%)',
        'linear-gradient(135deg, #1fa2ff 0%, #12d8fa 50%, #a6ffcb 100%)',
        'linear-gradient(135deg, #e1eec3 0%, #f05053 100%)',
        'linear-gradient(135deg, #360033 0%, #0b8793 100%)',
        'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    ];

    const EMOJI_LIST = ["🚀", "📂", "💼", "🎨", "❤️", "⭐", "🎮", "🎵", "📸", "📝", "🏠", "✈️", "🍔", "💡", "💰", "🔒", "💊", "🎓", "👶", "🐶"];



    const CUSTOM_COLORS = [
        '#22d3ee', // Default Cyan
        '#ef4444', // Red
        '#f97316', // Orange
        '#eab308', // Yellow
        '#22c55e', // Green
        '#3b82f6', // Blue
        '#a855f7', // Purple
        '#ec4899', // Pink
        '#64748b', // Slate
    ];

    const CUSTOM_ICONS = [
        'default', 'briefcase', 'heart', 'code', 'globe', 'user', 'users',
        'smartphone', 'monitor', 'book', 'coffee', 'gift', 'tag', 'flag'
    ];

    const CUSTOM_PATTERNS = [
        { name: 'None', value: '' },
        { name: 'Dots', value: 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)' },
        { name: 'Grid', value: 'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)' },
        { name: 'Lines', value: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 1px, transparent 0, transparent 50%)' },
        { name: 'Waves', value: 'repeating-radial-gradient(circle at 0 0, transparent 0, rgba(255,255,255,0.1) 10px), repeating-linear-gradient(rgba(255,255,255,0.1), rgba(255,255,255,0.1))' }
    ];

    const [uploadQueue, setUploadQueue] = useState<{ path: string, name: string, status: 'pending' | 'uploading' | 'completed' | 'error', progress: number, targetFolderId?: string | null }[]>([]);

    const [folderStats, setFolderStats] = useState<Record<string, { size: number, count: number }>>({});
    const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);

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

    useEffect(() => {
        invoke<UserProfile>('get_current_user').then(setUser).catch(console.error);
    }, []);

    // Update Page Title
    useEffect(() => {
        document.title = `${folderName} - Paperfold`;
    }, [folderName]);

    // Search Effect
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults({ folders: [], files: [] });
            setIsSearchOpen(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                console.log("Searching for:", searchQuery);
                const [folders, files] = await invoke<[Folder[], FileMetadata[]]>('search_items', { query: searchQuery });
                setSearchResults({ folders, files });
                setIsSearchOpen(true);
            } catch (e) {
                console.error("Search failed:", e);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchStorageUsage = async () => {
        try {
            const usage = await invoke<string>('get_storage_usage');
            setStorageUsage(usage);
        } catch (e) {
            console.error("Failed to fetch storage usage", e);
        }
    };

    // WebDAV State
    const [isWebDavRunning, setIsWebDavRunning] = useState(false);
    const [isWebDavLoading, setIsWebDavLoading] = useState(false);

    useEffect(() => {
        invoke<boolean>('get_webdav_status')
            .then(setIsWebDavRunning)
            .catch(console.error);
    }, []);

    const handleToggleWebDav = async () => {
        if (isWebDavLoading) return;
        setIsWebDavLoading(true);
        try {
            if (isWebDavRunning) {
                await invoke('stop_webdav');
                setIsWebDavRunning(false);
            } else {
                await invoke('start_webdav');
                setIsWebDavRunning(true);
            }
        } catch (e) {
            console.error("Failed to toggle WebDAV", e);
            alert("Failed to toggle WebDAV: " + e);
        } finally {
            setIsWebDavLoading(false);
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

    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

    const handleNavigate = (folderId: string | null, folderName: string) => {
        console.log("Navigating to:", folderId, folderName);
        setCurrentFolder(folderId);
        setFolderName(folderName);
        setSelectedItemIds(new Set()); // Clear selection on navigation
        if (folderId) {
            setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
        }
    };

    const handleBreadcrumbClick = (index: number) => {
        const item = breadcrumbs[index];
        console.log("Breadcrumb click:", item);
        setCurrentFolder(item.id === 'root' ? null : item.id);
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(newBreadcrumbs);
        setFolderName(item.name === 'Home' ? 'My Cloud' : item.name);
        setSelectedItemIds(new Set()); // Clear selection
    };

    // Multi-Select Handlers
    const handleFileClick = (e: React.MouseEvent, item: FileItem) => {
        // e.metaKey is Cmd on Mac, e.ctrlKey is Ctrl on Windows/Linux
        const isModifier = e.metaKey || e.ctrlKey;
        const isShift = e.shiftKey;

        if (isModifier) {
            // Toggle selection
            setSelectedItemIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(item.id)) {
                    newSet.delete(item.id);
                } else {
                    newSet.add(item.id);
                }
                return newSet;
            });
        } else if (isShift) {
            // Range selection - simplified for now: add to selection
            setSelectedItemIds(prev => {
                const newSet = new Set(prev);
                newSet.add(item.id);
                return newSet;
            });
        } else {
            // Normal click navigation provided by default logic inside onClick wrapper if needed, 
            // BUT here we interpret "Click" on a file card.
            // If we want normal click to navigate/preview, we do that here if NOT selecting.

            // If we have a selection and click something else without modifier, usually it clears selection 
            // AND performs the action (navigate/preview) OR just selects the new item.
            // Let's stick to: Click = Navigate/Preview, but clears other selections if any.
            if (selectedItemIds.size > 0) {
                setSelectedItemIds(new Set());
            }

            if (item.type === 'folder') {
                handleNavigate(item.id, item.name);
            } else {
                handlePreview(item);
            }
        }
    };

    // Clear selection when clicking empty space
    const handleBackgroundClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            setSelectedItemIds(new Set());
        }
    };

    const getSortedItems = () => {
        // Upload queue items are always first and unsorted (or sorted by add time implicit)
        const uploadItems: FileItem[] = uploadQueue
            .filter(q => (q.status === 'pending' || q.status === 'uploading') && q.targetFolderId === currentFolder) // Filter by current folder
            .map((q, i) => ({
                id: `upload-${i}`,
                name: q.name,
                type: 'file' as const,
                size: q.status === 'uploading' ? 'Uploading...' : 'Queued',
                mimeType: 'application/octet-stream' // placeholder
            }));

        let sortedFolders = [...folders];
        let sortedFiles = [...files];

        const compare = (a: any, b: any) => {
            let valA, valB;
            switch (sortBy) {
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
                case 'size':
                    // Folders don't have size readily available in the object for sorting usually, 
                    // unless we use folderStats? `size` prop in Folder struct is not populated by backend automatically? 
                    // Wait, Folder struct doesn't have size. We use folderStats[id].size.
                    valA = a.size || (folderStats[a.id]?.size || 0);
                    valB = b.size || (folderStats[b.id]?.size || 0);
                    break;
                case 'date':
                default:
                    // Use created_at or last_modified. Let's use created_at for now as default "Date"
                    // FileMetadata has created_at (i64). Folder has created_at (i64).
                    valA = a.created_at;
                    valB = b.created_at;
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        };

        sortedFolders.sort(compare);
        sortedFiles.sort(compare);

        return [
            ...sortedFolders.map(f => ({
                id: f.id,
                name: f.name,
                type: 'folder' as const,
                modified: 'Just now', // TODO: Use real date
                is_starred: f.is_starred,
                color: f.color,
                icon: f.icon,
                gradient: f.gradient,
                cover_image: f.cover_image,
                emoji: f.emoji,
                pattern: f.pattern,
                show_badges: f.show_badges,
                tags: f.tags,
                description: f.description
            })),
            ...uploadItems,
            ...sortedFiles.map(f => ({
                id: f.id,
                name: f.name,
                type: 'file' as const,
                size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
                sizeBytes: f.size,
                mimeType: f.mime_type,
                is_starred: f.is_starred,
                thumbnail: f.thumbnail,
                modified: new Date(f.created_at * 1000).toISOString()
            }))
        ].filter(item => {
            if (item.name.endsWith('.part') || item.name.startsWith('temp_') || item.name.startsWith('Paperfold_Backup_Part_')) return false;
            return true;
        });
    };

    const allItems = getSortedItems();

    // Run folder stats fetch when allItems updates
    useEffect(() => {
        const fetchStats = async () => {
            const folders = allItems.filter(item => item.type === 'folder');
            if (folders.length === 0) return;

            const newStats: Record<string, { size: number, count: number }> = {};

            // Limit to checking stats for items that DON'T have them yet to avoid loops?
            // Actually, we should check if we already have stats for this ID to avoid re-fetching on every render
            // But if content changes, we might want to refresh.
            // For now, let's just fetch. To optimize, we can compare keys.

            await Promise.all(folders.map(async (folder) => {
                // Optimization: if we already have it, maybe skip? 
                // But user might have added files. 
                // For now, simple fetch.
                try {
                    const stats = await invoke<[number, number]>('get_folder_stats', { id: folder.id });
                    if (Array.isArray(stats)) {
                        newStats[folder.id] = { size: stats[0], count: stats[1] };
                    }
                } catch (error) {
                    console.error(`Failed to fetch stats for folder ${folder.id}:`, error);
                }
            }));

            setFolderStats(prev => ({ ...prev, ...newStats }));
        };

        if (allItems.length > 0) {
            fetchStats();
        }
    }, [folders, files]); // Using folders/files as dep relies on them changing. allItems changes on every render!
    // Wait, allItems is derived from folders/uploadQueue/files.
    // referencing allItems in useEffect dep array causes infinite loop if we set state inside effect?
    // setFolderStats causes re-render -> allItems re-calculated -> effect runs -> setFolderStats
    // YES. INFINITE LOOP RISK.
    // Depend on `folders` and `files` instead.

    // Keyboard Shortcuts (Select All)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                // Select all items in current view
                const ids = allItems.map(item => item.id);
                setSelectedItemIds(new Set(ids));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [allItems]);



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

    const handleFolderDownload = async (folderId: string) => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Destination Folder"
            });

            if (selected) {
                const basePath = selected as string;

                await invoke('download_folder', { folderId, basePath });

                setUpdateStatus("Download Completed!");
                setTimeout(() => setUpdateStatus(null), 3000);
            }
        } catch (e) {
            console.error("Folder Download Failed", e);
            setUpdateStatus("Download failed");
            setTimeout(() => setUpdateStatus(null), 3000);
        }
    };

    const handlePreview = async (item: FileItem) => {
        if (item.type === 'file') {
            try {
                setIsPreviewLoading(true);
                const file = files.find(f => f.id === item.id);
                if (!file) return;

                const path = await invoke<string>('preview_file', {
                    fileId: file.message_id,
                    fileName: file.name
                });

                // Fallback attempt: Read file directly using FS plugin
                try {
                    const contents = await readFile(path);
                    const blob = new Blob([contents], { type: file.mime_type || 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    setPreviewUrl(url);
                } catch (readErr) {
                    console.error("Direct read failed, trying asset url:", readErr);
                    // Fallback to convertFileSrc if direct read fails (unlikely if plugin works)
                    setPreviewUrl(convertFileSrc(path));
                }

                setPreviewingItem(file);
            } catch (e) {
                console.error("Preview failed", e);
                alert("Failed to load preview");
            } finally {
                setIsPreviewLoading(false);
            }
        }
    };

    // Cleanup blob URLs
    useEffect(() => {
        return () => {
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);


    const handleTrash = (id: string, isFolder: boolean, name: string) => {
        setItemToDelete({ id, isFolder, name, deleteType: 'soft' });
    };

    const handleToggleStar = async (item: FileItem) => {
        try {
            // Batch Logic
            const itemsToToggle = (selectedItemIds.has(item.id) && selectedItemIds.size > 1)
                ? allItems.filter(i => selectedItemIds.has(i.id))
                : [item];

            setIsLoading(true);

            // Execute sequentially to avoid overwhelming SQLite/API
            for (const i of itemsToToggle) {
                const isFolder = i.type === 'folder';
                await invoke('toggle_star', { id: i.id, isFolder });
            }

            // Refresh to ensure consistent state
            setRefresh(prev => prev + 1);

            // Optimistic update (optional, but refresher handles it safer for batch)

        } catch (e) {
            console.error("Failed to toggle star", e);
        } finally {
            setIsLoading(false);
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



    const handleRename = (id: string, currentName: string, isFolder: boolean) => {
        setRenameItem({ id, type: isFolder ? 'folder' : 'file', name: currentName });
        setIsRenameOpen(true);
    };

    const handleRestore = async (id: string, isFolder: boolean) => {
        try {
            // Batch Logic
            const itemsToRestore = (selectedItemIds.has(id) && selectedItemIds.size > 1)
                ? allItems.filter(i => selectedItemIds.has(i.id))
                : [allItems.find(i => i.id === id) || { id, type: isFolder ? 'folder' : 'file' } as FileItem];

            setIsLoading(true);

            for (const item of itemsToRestore) {
                const isItemFolder = item.type === 'folder';
                await invoke('restore_item', { id: item.id, is_folder: isItemFolder, isFolder: isItemFolder });
            }

            setRefresh(prev => prev + 1);
            setSelectedItemIds(new Set());
        } catch (e) {
            console.error("Restore failed", e);
            alert("Restore failed: " + e);
        } finally {
            setIsLoading(false);
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

            const itemsToDelete = itemToDelete.batchIds
                ? itemToDelete.batchIds.map(id => allItems.find(i => i.id === id)).filter(Boolean) as FileItem[]
                : [{ id: itemToDelete.id, type: itemToDelete.isFolder ? 'folder' : 'file' } as FileItem];

            for (const item of itemsToDelete) {
                const isFolder = item.type === 'folder';
                if (itemToDelete.deleteType === 'hard') {
                    await invoke('delete_item_permanently', {
                        id: item.id,
                        is_folder: isFolder,
                        isFolder: isFolder
                    });
                } else {
                    await invoke('delete_item', {
                        id: item.id,
                        is_folder: isFolder,
                        isFolder: isFolder
                    });
                }
            }

            setRefresh(prev => prev + 1);
            setItemToDelete(null);
            setSelectedItemIds(new Set()); // Clear selection after delete
        } catch (e) {
            console.error("Delete failed", e);
            alert("Delete failed: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await invoke('logout');
            onLogout();
        } catch (e) {
            console.error("Logout failed", e);
            onLogout();
        }
    };

    const checkForUpdates = async () => {
        try {
            setIsCheckingUpdate(true);
            setUpdateStatus("Checking for updates...");

            const update = await check();

            if (update) {
                console.log(`found update ${update.version} from ${update.date} with notes ${update.body}`);
                setUpdateStatus(`Update found: ${update.version}`);


                // Let's assume usage of window.confirm for now
                if (window.confirm(`Update to ${update.version}?`)) {
                    setUpdateStatus("Downloading update...");
                    let downloaded = 0;
                    let contentLength = 0;

                    await update.downloadAndInstall((event) => {
                        switch (event.event) {
                            case 'Started':
                                contentLength = event.data.contentLength || 0;
                                console.log(`started downloading ${contentLength} bytes`);
                                break;
                            case 'Progress':
                                downloaded += event.data.chunkLength;
                                console.log(`downloaded ${downloaded} from ${contentLength}`);
                                // Calculate percentage if needed
                                break;
                            case 'Finished':
                                console.log('download finished');
                                break;
                        }
                    });

                    setUpdateStatus("Update installed. Restarting...");
                    await relaunch();
                } else {
                    setUpdateStatus(null);
                }
            } else {
                setUpdateStatus("You are up to date!");
                setTimeout(() => setUpdateStatus(null), 3000);
            }
        } catch (e) {
            console.error("Update check failed", e);
            setUpdateStatus("Update check failed.");
            setTimeout(() => setUpdateStatus(null), 3000);
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const handleMetadataBackup = async () => {
        try {
            const res = await invoke<string>('backup_metadata');
            alert(res);
        } catch (e) {
            alert("Backup failed: " + e);
        }
    };

    const handleMetadataRestore = async () => {
        setIsRestoreConfirmOpen(true);
    };

    const confirmRestore = async () => {
        setIsRestoreConfirmOpen(false);
        try {
            const res = await invoke<string>('restore_metadata');
            alert(res);
            setRefresh(prev => prev + 1); // Refresh UI to show restored data
        } catch (e) {
            alert("Restore failed: " + e);
        }
    };

    const handleDownloadAll = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Destination for Backup',
            });
            if (selected && typeof selected === 'string') {
                setUpdateStatus("Preparing download...");
                await invoke('download_all', { targetDir: selected as string });
                setUpdateStatus("Download Completed!");
                setTimeout(() => setUpdateStatus(null), 3000);
            }
        } catch (e) {
            console.error("Download Failed", e);
            setUpdateStatus("Download failed");
            setTimeout(() => setUpdateStatus(null), 3000);
        }
    };

    useEffect(() => {
        let unlisteners: (() => void)[] = [];

        async function setupListeners() {
            const unlisten1 = await listen('download-all-progress', (event) => {
                const payload = event.payload as any;
                const percent = Math.round(((payload.file_index - 1) / payload.total_files) * 100);
                const packetInfo = payload.total_packets > 1 ? ` (Part ${payload.packet}/${payload.total_packets})` : '';

                setUpdateStatus(`Downloading${packetInfo}: ${percent}%`);
            });
            unlisteners.push(unlisten1);

            const unlisten2 = await listen('download-progress', (event) => {
                const payload = event.payload as any;
                setUpdateStatus(payload.status);
            });
            unlisteners.push(unlisten2);
        }
        setupListeners();
        return () => {
            unlisteners.forEach(f => f());
        };
    }, []);





    function itemsSection(items: FileItem[], title: string) {
        if (items.length === 0) return null;
        return (
            <div className="mb-8">
                <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">{title}</h2>
                <div className={`grid gap-4 ${view === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1'}`}>
                    {items.map(file => {
                        const isSelected = selectedItemIds.has(file.id);
                        return (
                            <FileCard
                                key={file.id}
                                item={file}
                                isSelected={isSelected}
                                downloadProgress={downloadProgress[file.id]}
                                onClick={(e) => handleFileClick(e, file)}
                                onContextMenu={(e, item) => {
                                    e.preventDefault();
                                    if (!selectedItemIds.has(file.id)) {
                                        setSelectedItemIds(new Set([file.id]));
                                    }
                                    setContextMenu({ x: e.clientX, y: e.clientY, item });
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    const [isDragging, setIsDragging] = useState(false);






    // Tauri v2 Drag & Drop Implementation
    // Tauri v2 Drag & Drop Implementation
    useEffect(() => {
        let unlistenDrop: () => void;
        let unlistenEnter: () => void;
        let unlistenLeave: () => void;
        let isMounted = true;

        async function setupDragDrop() {
            try {
                console.log('Setting up Tauri v2 drag listeners...');

                const uEnter = await listen('tauri://drag-enter', (_event) => {
                    if (!isMounted) return;
                    console.log('Tauri Event: drag-enter');
                    setIsDragging(true);
                });
                if (isMounted) unlistenEnter = uEnter;
                else uEnter();

                const uLeave = await listen('tauri://drag-leave', (_event) => {
                    if (!isMounted) return;
                    console.log('Tauri Event: drag-leave');
                    setIsDragging(false);
                });
                if (isMounted) unlistenLeave = uLeave;
                else uLeave();

                const uDrop = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                    if (!isMounted) return;
                    console.log('Tauri Event: drag-drop', event);
                    setIsDragging(false);

                    let activePaths: string[] = [];
                    // Handle potential payload variations
                    if (Array.isArray(event.payload)) {
                        activePaths = event.payload;
                    } else if (event.payload && Array.isArray((event.payload as any).paths)) {
                        activePaths = (event.payload as any).paths;
                    }

                    if (activePaths && activePaths.length > 0) {
                        const targetFolderId = currentFolderRef.current;
                        const newItems = activePaths.map(path => ({
                            path,
                            name: path.split(/[/\\]/).pop() || 'Unknown File',
                            status: 'pending' as const,
                            progress: 0,
                            targetFolderId: targetFolderId
                        }));
                        setUploadQueue(prev => {
                            // Deduplicate based on path if needed, but for now just appending.
                            // The issue was multiple listeners.
                            return [...prev, ...newItems];
                        });
                    }
                });
                if (isMounted) unlistenDrop = uDrop;
                else uDrop();

                console.log('Drag listeners set up successfully');
            } catch (err) {
                console.error('Failed to setup drag listeners:', err);
            }
        }

        setupDragDrop();

        return () => {
            isMounted = false;
            // Immediate cleanup if they exist
            if (unlistenDrop) unlistenDrop();
            if (unlistenEnter) unlistenEnter();
            if (unlistenLeave) unlistenLeave();
        };
    }, []); // Listener depends on Ref now, so no re-binding needed!

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
                // Allow ESC to blur input
                if (e.key === 'Escape') {
                    (e.target as HTMLElement).blur();
                }
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            // Select All (Cmd/Ctrl + A)
            if (modifier && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                const allIds = [
                    ...folders.map(f => f.id),
                    ...files.map(f => f.id)
                ];
                setSelectedItemIds(new Set(allIds));
                return;
            }

            // Search (Cmd/Ctrl + F)
            if (modifier && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setIsSearchOpen(true);
                return;
            }

            // New Folder (Cmd/Ctrl + N)
            if ((modifier && e.shiftKey && e.key.toLowerCase() === 'n') || (modifier && e.key.toLowerCase() === 'n')) {
                e.preventDefault();
                openCreateFolderModal();
                return;
            }

            // Delete (Delete / Backspace)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedItemIds.size > 0 && !itemToDelete) {
                    e.preventDefault();

                    if (selectedItemIds.size === 1) {
                        const firstId = Array.from(selectedItemIds)[0];
                        const isFolder = folders.some(f => f.id === firstId);
                        const item = isFolder
                            ? folders.find(f => f.id === firstId)
                            : files.find(f => f.id === firstId);

                        if (item) {
                            setItemToDelete({
                                id: item.id,
                                isFolder,
                                name: item.name,
                                deleteType: currentSection === 'trash' ? 'hard' : 'soft' // Context aware?
                            });
                        }
                    } else {
                        // Batch Delete
                        setItemToDelete({
                            id: 'batch', // Dummy ID
                            isFolder: false, // Mixed
                            name: `${selectedItemIds.size} items`,
                            deleteType: currentSection === 'trash' ? 'hard' : 'soft',
                            batchIds: Array.from(selectedItemIds)
                        });
                    }
                }
                return;
            }

            // Escape - Clear Selection / Close Modals
            if (e.key === 'Escape') {
                if (isSearchOpen) setIsSearchOpen(false);
                else if (isSortMenuOpen) setIsSortMenuOpen(false);
                else if (isCustomizeOpen) setIsCustomizeOpen(false);
                else if (isUserMenuOpen) setIsUserMenuOpen(false);
                else if (isCreateFolderOpen) setIsCreateFolderOpen(false);
                else if (selectedItemIds.size > 0) setSelectedItemIds(new Set());
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [folders, files, selectedItemIds, isSearchOpen, isCustomizeOpen, isUserMenuOpen, itemToDelete, isCreateFolderOpen, currentSection]);

    const handleCustomizeSubmit = async () => {
        if (!customizationItem) return;

        try {
            setIsLoading(true);
            await invoke('update_folder_metadata', {
                id: customizationItem.id,
                color: customizationItem.color,
                icon: customizationItem.icon,
                gradient: customizationItem.gradient,
                cover_image: customizationItem.cover_image,
                emoji: customizationItem.emoji,
                pattern: customizationItem.pattern,
                show_badges: customizationItem.show_badges,
                tags: customizationItem.tags
            });

            // Optimistic update locally
            setFolders(prev => prev.map(f => {
                if (f.id === customizationItem.id) {
                    return { ...f, color: customizationItem.color, icon: customizationItem.icon };
                }
                return f;
            }));

            setRefresh(prev => prev + 1); // Full refresh to be safe
            setIsCustomizeOpen(false);
        } catch (e) {
            console.error("Customize failed", e);
            alert("Failed to update folder: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="flex h-screen bg-[#030712] text-foreground font-sans selection:bg-cyan-500/30 overflow-hidden relative"
        >





            {/* Properties Modal */}
            <AnimatePresence>
                {isPropertiesOpen && propertiesItem && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-0 w-full max-w-sm border border-white/10 overflow-hidden"
                        >
                            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    Properties
                                </h3>
                                <button
                                    onClick={() => setIsPropertiesOpen(false)}
                                    className="p-2 -mr-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 space-y-6">
                                {/* Header Info */}
                                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 relative overflow-hidden group">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${propertiesItem.type === 'folder' ? 'from-cyan-500/10 to-transparent' : 'from-blue-500/10 to-transparent'} opacity-50`} />

                                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center relative z-10 shadow-lg ${propertiesItem.type === 'folder' ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/20' : 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 border border-blue-500/20'}`}>
                                        {propertiesItem.type === 'folder' ? <FolderIcon className="w-7 h-7 fill-current" /> : <FileIcon className="w-7 h-7" />}
                                    </div>
                                    <div className="relative z-10 min-w-0 flex-1">
                                        <p className="font-bold text-white text-lg truncate leading-tight mb-1">{propertiesItem.name}</p>
                                        <span className="text-[10px] font-mono uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded text-gray-300">
                                            {propertiesItem.type}
                                        </span>
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                                        <p className="text-xs text-gray-500 mb-1">Type</p>
                                        <p className="text-sm font-medium text-white capitalize flex items-center gap-2">
                                            {propertiesItem.type}
                                        </p>
                                    </div>
                                    {propertiesItem.stats && (
                                        <>
                                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                                                <p className="text-xs text-gray-500 mb-1">Size</p>
                                                <p className="text-sm font-medium text-white font-mono">{formatSize(propertiesItem.stats.size)}</p>
                                            </div>
                                            <div className="col-span-2 p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-0.5">Contents</p>
                                                    <p className="text-sm font-medium text-white">{propertiesItem.stats.count} items</p>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                                                    <LayoutGrid className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Description / Readme Editor */}
                                {propertiesItem.type === 'folder' && (
                                    <div className="pt-2">
                                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">
                                            <div className="w-1 h-3 bg-cyan-500 rounded-full" />
                                            Description
                                        </label>
                                        <div className="relative group">
                                            <textarea
                                                value={itemDescription}
                                                onChange={(e) => setItemDescription(e.target.value)}
                                                onBlur={async () => {
                                                    // Auto-save on blur
                                                    try {
                                                        await invoke('update_folder_metadata', {
                                                            id: propertiesItem.id,
                                                            description: itemDescription
                                                        });
                                                    } catch (e) { console.error("Failed to save description", e); }
                                                }}
                                                placeholder="Add a description for this folder..."
                                                className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 focus:ring-1 focus:ring-cyan-500/50 min-h-[120px] resize-none transition-all placeholder:text-gray-700 custom-scrollbar"
                                            />
                                            <div className="absolute bottom-3 right-3 text-[10px] text-gray-600 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                                Auto-saves on blur
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02] flex justify-end">
                                <button
                                    onClick={() => setIsPropertiesOpen(false)}
                                    className="px-4 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Global Status Toast (Downloads, etc.) */}
            <AnimatePresence>
                {updateStatus && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.9 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#0A0A0A] border border-cyan-500/20 rounded-full py-3 px-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl flex items-center gap-3"
                    >
                        <div className="w-4 h-4 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                        <span className="text-sm font-medium text-cyan-50 drop-shadow-sm font-mono tracking-tight">{updateStatus}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Customization Modal */}
            <AnimatePresence>
                {isCustomizeOpen && customizationItem && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#0A0A0A] rounded-2xl shadow-2xl w-full max-w-4xl border border-white/10 overflow-hidden flex flex-col max-h-[85vh]"
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center text-cyan-400 border border-white/5 shadow-inner">
                                        <Settings className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white tracking-tight">Customize Folder</h3>
                                        <p className="text-xs text-gray-400 font-medium">
                                            Personalize how "{customizationItem.name}" looks
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsCustomizeOpen(false)}
                                    className="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex flex-1 min-h-0">
                                {/* Sidebar Tabs */}
                                <div className="w-64 border-r border-white/5 p-4 space-y-1 bg-white/[0.02]">
                                    {[
                                        { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Colors & Gradients' },
                                        { id: 'pattern', label: 'Patterns', icon: Grid, description: 'Background Textures' },
                                        { id: 'icon', label: 'Icons & Emoji', icon: Smile, description: 'Visual Identifiers' },
                                        { id: 'tags', label: 'Tags', icon: Tag, description: 'Organization' },
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${activeTab === tab.id
                                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                                                }`}
                                        >
                                            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-cyan-400' : 'text-gray-500'}`} />
                                            <div>
                                                <span className="block text-sm font-medium">{tab.label}</span>
                                                <span className="block text-[10px] opacity-60 font-normal">{tab.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Content Area */}
                                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#0f0f0f]">
                                    <div className="flex flex-col h-full gap-8">

                                        {/* Live Preview Card (Always Visible or Top) */}
                                        <div className="flex items-center justify-center p-8 bg-black/40 rounded-2xl border border-white/5 relative group overflow-hidden shadow-inner">
                                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/5 to-transparent opacity-50" />
                                            <div className="w-32 h-32 relative z-10 transition-transform duration-500 group-hover:scale-105">
                                                <FileCard
                                                    item={{
                                                        id: 'preview',
                                                        name: customizationItem.name,
                                                        type: 'folder',
                                                        color: customizationItem.color,
                                                        icon: customizationItem.icon,
                                                        gradient: customizationItem.gradient,
                                                        cover_image: customizationItem.cover_image,
                                                        emoji: customizationItem.emoji,
                                                        pattern: customizationItem.pattern,
                                                        tags: customizationItem.tags,
                                                        show_badges: customizationItem.show_badges,
                                                    } as any}
                                                    isSelected={false}
                                                />
                                            </div>
                                            <div className="absolute top-4 right-4 flex items-center gap-2">
                                                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-600 bg-white/5 px-2 py-1 rounded">Preview</span>
                                            </div>

                                            {/* Show Badges Toggle Inline */}
                                            <div className="absolute bottom-4 right-4 flex items-center gap-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                                                <span className="text-xs text-gray-300 font-medium">Badges</span>
                                                <button
                                                    onClick={() => setCustomizationItem({ ...customizationItem, show_badges: !customizationItem.show_badges })}
                                                    className={`w-9 h-5 rounded-full transition-colors relative ${customizationItem.show_badges ? 'bg-cyan-500' : 'bg-white/20'}`}
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all shadow-sm ${customizationItem.show_badges ? 'left-[19px]' : 'left-[3px]'}`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Controls Section */}
                                        <div className="flex-1 min-h-0 pt-2">
                                            {activeTab === 'appearance' && (
                                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                                            <div className="w-1 h-4 bg-cyan-500 rounded-full"></div>
                                                            Solid Colors
                                                        </h4>
                                                        <div className="flex flex-wrap gap-3">
                                                            {CUSTOM_COLORS.map(color => (
                                                                <button
                                                                    key={color}
                                                                    onClick={() => setCustomizationItem({ ...customizationItem, color, gradient: undefined })}
                                                                    className={`w-11 h-11 rounded-full border-2 transition-all hover:scale-110 relative group ${customizationItem.color === color && !customizationItem.gradient
                                                                        ? 'border-white ring-2 ring-cyan-500/50 scale-110 shadow-lg shadow-cyan-500/20'
                                                                        : 'border-transparent opacity-80 hover:opacity-100 hover:border-white/20'
                                                                        }`}
                                                                    style={{ backgroundColor: color }}
                                                                >
                                                                    {customizationItem.color === color && !customizationItem.gradient && (
                                                                        <CheckCircle className="w-5 h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-md" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-white/5 pt-6">
                                                        <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                                            <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                                                            Gradients
                                                        </h4>
                                                        <div className="grid grid-cols-4 gap-3">
                                                            {CUSTOM_GRADIENTS.map(gradient => (
                                                                <button
                                                                    key={gradient}
                                                                    onClick={() => setCustomizationItem({ ...customizationItem, gradient, color: undefined })}
                                                                    className={`aspect-square rounded-xl border-2 transition-all hover:scale-105 relative overflow-hidden ${customizationItem.gradient === gradient
                                                                        ? 'border-white ring-2 ring-purple-500/50 shadow-lg shadow-purple-500/20'
                                                                        : 'border-transparent opacity-80 hover:opacity-100 hover:border-white/20'
                                                                        }`}
                                                                    style={{ background: gradient }}
                                                                >
                                                                    {customizationItem.gradient === gradient && (
                                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                                                                            <CheckCircle className="w-6 h-6 text-white drop-shadow-md" />
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {activeTab === 'pattern' && (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div className="grid grid-cols-3 gap-4">
                                                        {CUSTOM_PATTERNS.map((pattern) => (
                                                            <button
                                                                key={pattern.name}
                                                                onClick={() => setCustomizationItem(prev => prev ? { ...prev, pattern: pattern.value } : null)}
                                                                className={`aspect-[4/3] rounded-xl border-2 transition-all relative overflow-hidden group ${customizationItem.pattern === pattern.value
                                                                    ? 'border-cyan-500 ring-1 ring-cyan-500/50 shadow-lg shadow-cyan-500/20'
                                                                    : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                                                                    }`}
                                                                style={{
                                                                    background: customizationItem.gradient || customizationItem.color || '#1A1A1A'
                                                                }}
                                                            >
                                                                {pattern.value && (
                                                                    <div
                                                                        className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"
                                                                        style={{
                                                                            backgroundImage: pattern.value,
                                                                            backgroundSize: pattern.name === 'Grid' ? '20px 20px' : '10px 10px'
                                                                        }}
                                                                    />
                                                                )}
                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors pointer-events-none">
                                                                    <span className="text-sm font-semibold text-white drop-shadow-lg tracking-wide">{pattern.name}</span>
                                                                </div>
                                                                {customizationItem.pattern === pattern.value && (
                                                                    <div className="absolute top-2 right-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                                                                    </div>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {activeTab === 'tags' && (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div className="relative group">
                                                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
                                                        <input
                                                            type="text"
                                                            placeholder="Type a tag and press Enter..."
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-gray-600 focus:bg-white/10"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    const val = e.currentTarget.value.trim();
                                                                    if (val && !customizationItem.tags?.includes(val)) {
                                                                        setCustomizationItem(prev => prev ? { ...prev, tags: [...(prev.tags || []), val] } : null);
                                                                        e.currentTarget.value = '';
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        {customizationItem.tags?.map(tag => (
                                                            <div key={tag} className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-cyan-300 rounded-lg text-sm group hover:border-cyan-500/40 transition-colors cursor-default">
                                                                <span className="font-medium">{tag}</span>
                                                                <button
                                                                    onClick={() => setCustomizationItem(prev => prev ? { ...prev, tags: prev.tags?.filter(t => t !== tag) } : null)}
                                                                    className="p-1 hover:bg-cyan-500/20 rounded-md text-cyan-500/50 hover:text-cyan-300 transition-colors"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {(!customizationItem.tags || customizationItem.tags.length === 0) && (
                                                            <div className="w-full flex flex-col items-center justify-center p-8 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                                                                <Tag className="w-10 h-10 text-gray-800 mb-3" />
                                                                <p className="text-sm text-gray-500 text-center">No tags added yet.<br />Use tags to organize folders.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {activeTab === 'icon' && (
                                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Standard Icons</h4>
                                                        <div className="grid grid-cols-5 gap-3">
                                                            {CUSTOM_ICONS.map(iconName => (
                                                                <button
                                                                    key={iconName}
                                                                    onClick={() => setCustomizationItem({ ...customizationItem, icon: iconName === 'default' ? "" : iconName, emoji: undefined, cover_image: undefined })}
                                                                    className={`aspect-square rounded-xl border flex flex-col items-center justify-center transition-all hover:bg-white/5 relative ${customizationItem.icon === iconName && !customizationItem.emoji
                                                                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/20'
                                                                        : 'border-white/5 text-gray-500 hover:text-white'
                                                                        }`}
                                                                >
                                                                    <div className={`transition-transform duration-300 ${customizationItem.icon === iconName ? 'scale-110' : ''}`}>
                                                                        <span className="text-[10px] capitalize font-medium">{iconName}</span>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-white/5 pt-6">
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Emojis</h4>
                                                        <div className="grid grid-cols-6 gap-3">
                                                            {EMOJI_LIST.map(emoji => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => setCustomizationItem({ ...customizationItem, emoji, icon: undefined, cover_image: undefined })}
                                                                    className={`aspect-square flex items-center justify-center text-2xl rounded-xl transition-all hover:bg-white/10 ${customizationItem.emoji === emoji
                                                                        ? 'bg-white/10 ring-1 ring-cyan-500/50 shadow-lg shadow-cyan-500/20 scale-110'
                                                                        : 'hover:scale-110'
                                                                        }`}
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}


                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-8 py-5 border-t border-white/5 bg-white/[0.02] flex justify-between items-center z-10">
                                <div className="text-xs text-gray-600 font-mono flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                    Changes previewed in real-time
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setIsCustomizeOpen(false)}
                                        className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCustomizeSubmit}
                                        className="px-8 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Drag & Drop Overlay */}
            <AnimatePresence>
                {isDragging && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[999] bg-cyan-500/20 backdrop-blur-sm border-4 border-cyan-400 border-dashed rounded-xl m-4 flex items-center justify-center pointer-events-none"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-[#0A0A0A] p-8 rounded-2xl border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.3)] flex flex-col items-center text-center"
                        >
                            <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-6 text-cyan-400 animate-bounce">
                                <Upload className="w-10 h-10" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">Drop to Upload</h2>
                            <p className="text-gray-400 text-lg">Release files to add them to your cloud</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Grid Pattern (Technical Look) */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Loading Indicator */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-cyan-500/10 backdrop-blur-md border border-cyan-500/20 text-cyan-400 px-6 py-2 rounded-b-xl shadow-[0_0_20px_rgba(6,182,212,0.1)] text-sm font-medium flex items-center gap-2"
                    >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className="w-72 bg-transparent flex flex-col pt-8 pb-6 z-20" data-tauri-drag-region>
                {/* Logo */}
                <div className="px-8 mb-10 flex items-center gap-3 select-none">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(6,182,212,0.3)]">P</div>
                    <span className="text-xl font-bold tracking-tight text-white/90">
                        Paperfold
                    </span>
                </div>

                {/* Primary Actions */}
                <div className="px-6 mb-8">
                    <div className="relative">
                        <button
                            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] w-full group backdrop-blur-sm"
                        >
                            <Plus className="w-5 h-5 text-cyan-400 group-hover:rotate-90 transition-transform" />
                            <span className="font-medium text-sm tracking-wide">New Upload</span>
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
                                        className="absolute top-full left-0 w-full mt-2 bg-[#0A0A0A] border border-white/10 p-1.5 rounded-xl shadow-2xl z-20 backdrop-blur-xl"
                                    >
                                        <button onClick={(e) => { e.stopPropagation(); openCreateFolderModal(); }} className="flex items-center gap-3 w-full p-2.5 hover:bg-white/5 rounded-lg text-left text-sm font-medium text-gray-300 hover:text-white transition-colors">
                                            <FolderPlus className="w-4 h-4 text-cyan-500/70" />
                                            New Folder
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleUpload(); }} className="flex items-center gap-3 w-full p-2.5 hover:bg-white/5 rounded-lg text-left text-sm font-medium text-gray-300 hover:text-white transition-colors">
                                            <Upload className="w-4 h-4 text-cyan-500/70" />
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
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/10 overflow-hidden"
                            >
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
                                        <FolderIcon className="w-6 h-6 fill-current" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">New Folder</h3>
                                        <p className="text-xs text-gray-400">Create a new folder to organize your files</p>
                                    </div>
                                </div>

                                <form onSubmit={handleCreateFolderSubmit}>
                                    <div className="space-y-4 mb-6">
                                        <div className="relative group">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder=" "
                                                className="peer w-full bg-black/20 border border-white/10 rounded-xl px-4 pt-5 pb-2 text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-medium placeholder-transparent"
                                                value={newFolderName}
                                                onChange={(e) => setNewFolderName(e.target.value)}
                                            />
                                            <label className="absolute left-4 top-2 text-[10px] text-gray-500 font-medium uppercase tracking-wider transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-500 peer-placeholder-shown:top-3.5 peer-focus:top-2 peer-focus:text-[10px] peer-focus:text-cyan-400">
                                                Folder Name
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsCreateFolderOpen(false)}
                                            className="px-4 py-2.5 text-xs font-medium text-gray-400 hover:text-white transition-colors flex-1 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/20 flex-1 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                                            disabled={!newFolderName.trim()}
                                        >
                                            Create Folder
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Delete Confirmation Modal */}


                {/* Navigation */}
                <nav className="flex-1 space-y-1 px-4">
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
                                setCurrentFolder(null); // Always reset to root context

                                if (item.id === 'drive') {
                                    setFolderName('My Drive');
                                    setBreadcrumbs([{ id: null, name: 'My Drive' }]);
                                } else if (item.id === 'recent') {
                                    setFolderName('Recent');
                                    setBreadcrumbs([{ id: null, name: 'Recent' }]);
                                } else if (item.id === 'starred') {
                                    setFolderName('Starred');
                                    setBreadcrumbs([{ id: null, name: 'Starred' }]);
                                } else if (item.id === 'trash') {
                                    setFolderName('Trash');
                                    setBreadcrumbs([{ id: null, name: 'Trash' }]);
                                }
                            }}
                            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${currentSection === item.id
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <item.icon className={`w-[18px] h-[18px] transition-colors ${currentSection === item.id ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* WebDAV Toggle */}
                <div className="px-4 mt-2 mb-2">
                    <div className="h-px bg-white/5" />
                </div>

                <div className="px-4 mb-2">
                    <button
                        onClick={handleToggleWebDav}
                        disabled={isWebDavLoading}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isWebDavRunning
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                            }`}
                    >
                        {isWebDavLoading ? (
                            <Loader2 className="w-[18px] h-[18px] animate-spin text-gray-500" />
                        ) : (
                            <Server className={`w-[18px] h-[18px] transition-colors ${isWebDavRunning ? 'text-green-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                        )}
                        <div className="flex flex-col items-start leading-none">
                            <span>Paperfold Network Drive</span>
                            <span className="text-[10px] mt-1 opacity-60 font-normal">
                                {isWebDavLoading ? 'Updating...' : (isWebDavRunning ? 'Running' : 'Stopped')}
                            </span>
                            {isWebDavRunning && !isWebDavLoading && (
                                <span className="text-[9px] text-cyan-400 font-mono mt-0.5 select-all">
                                    {window.navigator.userAgent.includes("Linux") ? "dav://127.0.0.1:17432" : "http://127.0.0.1:17432"}
                                </span>
                            )}
                        </div>
                    </button>
                </div>

                {/* Storage Status */}
                <div className="px-6 mt-6">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-white/5 to-transparent border border-white/5">
                        <div className="flex items-center gap-2 mb-3 text-cyan-400">
                            <Cloud className="w-4 h-4 fill-current opacity-80" />
                            <span className="text-xs font-bold uppercase tracking-wider opacity-80">Storage</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1 mb-3 overflow-hidden">
                            <div className="bg-cyan-400 h-1 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-500" style={{ width: (storageUsage === '0.00 B' || storageUsage === '0.00 KB' || storageUsage === '0 B') ? '0%' : '5%' }}></div>
                        </div>
                        <div className="flex justify-between items-end">
                            <p className="text-sm font-mono text-white/90">{storageUsage}</p>
                            <p className="text-[10px] text-cyan-400 font-medium bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-500/20">USED</p>
                        </div>
                    </div>
                </div>
                {/* User Profile */}
                {user && (
                    <div className="px-6 pb-6 mt-auto">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {user.first_name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white/90 text-sm truncate group-hover:text-white transition-colors">
                                    {user.first_name} {user.last_name || ''}
                                </p>
                                <p className="text-[10px] text-gray-500 font-mono truncate">
                                    ID: {user.id}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0A] m-2 rounded-2xl border border-white/5 relative z-10 shadow-2xl">

                {/* Header */}
                <header className="h-20 px-8 flex items-center justify-between z-20">

                    {/* Search */}
                    <div className="flex-1 max-w-2xl mx-auto px-4 relative">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-cyan-400 transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => { if (searchQuery.trim().length > 0) setIsSearchOpen(true); }}
                                placeholder="Search your universe..."
                                className="w-full h-11 pl-11 pr-10 bg-white/5 hover:bg-white/[0.07] focus:bg-[#0A0A0A] border border-white/5 focus:border-cyan-500/30 rounded-full text-sm transition-all outline-none focus:ring-4 focus:ring-cyan-500/10 placeholder:text-gray-600 font-medium text-gray-200"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setIsSearchOpen(false);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* Search Results Dropdown */}
                        <AnimatePresence>
                            {isSearchOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsSearchOpen(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                        className="absolute top-full left-4 right-4 mt-2 bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-20 max-h-[60vh] flex flex-col backdrop-blur-3xl"
                                    >
                                        <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                                            {searchResults.folders.length === 0 && searchResults.files.length === 0 ? (
                                                <div className="p-8 text-center text-gray-500">
                                                    <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                    <p className="text-sm">No results found for "{searchQuery}"</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Folders Section */}
                                                    {searchResults.folders.length > 0 && (
                                                        <div className="mb-4">
                                                            <h3 className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Folders</h3>
                                                            {searchResults.folders.map(folder => (
                                                                <button
                                                                    key={folder.id}
                                                                    onClick={() => {
                                                                        setCurrentFolder(folder.id);
                                                                        setFolderName(folder.name);
                                                                        setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
                                                                        setIsSearchOpen(false);
                                                                        setSearchQuery('');
                                                                    }}
                                                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left group border border-transparent hover:border-white/5"
                                                                >
                                                                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                                                                        <FolderIcon className="w-4 h-4 fill-current" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-medium text-gray-200 text-sm group-hover:text-white transition-colors">{folder.name}</p>
                                                                        <p className="text-[10px] text-gray-500 font-mono">FOLDER</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Files Section */}
                                                    {searchResults.files.length > 0 && (
                                                        <div>
                                                            <h3 className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Files</h3>

                                                            {searchResults.files.map(file => (
                                                                <button
                                                                    key={file.id}
                                                                    onClick={() => {
                                                                        handlePreview({ ...file, type: 'file', size: formatSize(file.size) });
                                                                        setIsSearchOpen(false);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left group border border-transparent hover:border-white/5"
                                                                >
                                                                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-400 group-hover:scale-110 transition-transform">
                                                                        <FileIcon className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-medium text-gray-200 text-sm truncate group-hover:text-white transition-colors">{file.name}</p>
                                                                        <p className="text-[10px] text-gray-500 font-mono">{formatSize(file.size)} • {formatDate(new Date(file.created_at * 1000).toISOString())}</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                        <button
                            onClick={async () => {
                                setIsRefreshing(true);
                                setRefresh(prev => prev + 1);
                                try {
                                    await invoke('sync_files');
                                } catch (e) {
                                    console.error("Sync failed", e);
                                }
                                await fetchStorageUsage();
                                setTimeout(() => setIsRefreshing(false), 800);
                            }}
                            className="p-2.5 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-full text-gray-400 hover:text-cyan-400 transition-all disabled:opacity-50"
                            title="Refresh"
                            disabled={isRefreshing}
                        >
                            <RotateCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>



                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 p-[2px] shadow-[0_0_10px_rgba(6,182,212,0.3)] hover:scale-105 transition-transform"
                            >
                                <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center text-white font-bold text-sm uppercase">
                                    {user?.first_name ? user.first_name[0] : 'U'}
                                </div>
                            </button>

                            <AnimatePresence>
                                {isUserMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 top-14 w-64 bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl p-2 z-20 backdrop-blur-xl flex flex-col gap-1"
                                        >
                                            <div className="p-3 border-b border-white/5 mb-1">
                                                <p className="font-bold text-white mb-0.5">{user?.first_name} {user?.last_name || ''}</p>
                                                {user?.username && <p className="text-xs text-gray-500 font-mono">@{user.username}</p>}
                                                {user?.id && <p className="text-[10px] text-gray-600 font-mono mt-1">ID: {user.id}</p>}
                                            </div>

                                            <button
                                                onClick={() => { checkForUpdates(); setIsUserMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <RotateCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                                                Check for Updates
                                            </button>

                                            <div className="h-px bg-white/5 my-1" />

                                            <button
                                                onClick={() => { handleMetadataBackup(); setIsUserMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <Cloud className="w-4 h-4 text-cyan-400" />
                                                Backup Metadata
                                            </button>

                                            <button
                                                onClick={() => { handleMetadataRestore(); setIsUserMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <RotateCw className="w-4 h-4 text-orange-400" />
                                                Restore Data
                                            </button>

                                            <button
                                                onClick={() => { handleDownloadAll(); setIsUserMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <Cloud className="w-4 h-4 text-cyan-400" />
                                                Download All Backup
                                            </button>

                                            <div className="h-px bg-white/5 my-1" />

                                            {updateStatus && (
                                                <div className="px-3 py-2 text-xs text-cyan-400 font-mono break-words">
                                                    {updateStatus}
                                                </div>
                                            )}

                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Log Out
                                            </button>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                        {/* Theme toggle removed intentionally as we are enforcing dark mode for this aesthetic, or hiding it */}
                    </div>
                </header>

                {/* Empty Trash Modal */}
                <AnimatePresence>
                    {isEmptyTrashOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-6 w-96 border border-white/10"
                            >
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Empty Trash?</h3>
                                    <p className="text-sm text-gray-400 mt-2">
                                        Are you sure you want to delete <span className="font-medium text-white">all items</span> in the trash?
                                        <br /><span className="text-red-400 font-medium">This action cannot be undone.</span>
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsEmptyTrashOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors flex-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleEmptyTrash}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-red-600/20 flex-1 border border-red-500/50"
                                    >
                                        Empty Trash
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Restore Confirmation Modal */}
                <AnimatePresence>
                    {isRestoreConfirmOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-6 w-96 border border-white/10"
                            >
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                                        <RotateCw className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Restore Data?</h3>
                                    <p className="text-sm text-gray-400 mt-2">
                                        This will overwrite your current folders with the latest backup from Telegram.
                                        <br /><span className="text-orange-400 font-medium">Recent local changes will be lost.</span>
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsRestoreConfirmOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors flex-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmRestore}
                                        className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-orange-600/20 flex-1 border border-orange-500/50"
                                    >
                                        Restore
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Toolbar / Breadcrumbs */}
                <div className="px-8 py-6 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                        {breadcrumbs.map((crumb, index) => (
                            <div key={index} className="flex items-center gap-2">
                                {index > 0 && <ChevronRight className="w-4 h-4 text-gray-600" />}
                                <button
                                    onClick={() => handleBreadcrumbClick(index)}
                                    className={`hover:bg-white/5 px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-white/5 ${index === breadcrumbs.length - 1
                                        ? 'text-white font-bold bg-white/5 border-white/5 shadow-sm'
                                        : 'hover:text-white'
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
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-medium ${allItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'shadow-[0_0_10px_rgba(239,68,68,0.1)]'}`}
                            >
                                <Trash2 className="w-4 h-4" />
                                Empty Trash
                            </button>
                        )}

                        <div className="flex items-center gap-1">
                            {/* Sort Dropdown */}
                            <div className="relative z-30">
                                <button
                                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm font-medium border ${isSortMenuOpen ? 'bg-white/10 text-white border-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent hover:border-white/5'}`}
                                >
                                    <ArrowUpDown className="w-4 h-4" />
                                    <span className="hidden sm:inline">Sort</span>
                                    {sortBy === 'name' && <span className="text-xs text-cyan-400 ml-1 font-mono">NAME</span>}
                                    {sortBy === 'date' && <span className="text-xs text-cyan-400 ml-1 font-mono">DATE</span>}
                                    {sortBy === 'size' && <span className="text-xs text-cyan-400 ml-1 font-mono">SIZE</span>}
                                </button>

                                <AnimatePresence>
                                    {isSortMenuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-20" onClick={() => setIsSortMenuOpen(false)} />
                                            <motion.div
                                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                className="absolute right-0 top-full mt-2 w-56 bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl p-1.5 z-30 backdrop-blur-xl flex flex-col gap-1 overflow-hidden"
                                            >
                                                <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center justify-between border-b border-white/5 mb-1 bg-white/[0.02] -mx-1.5 -mt-1.5">
                                                    <span>Sort By</span>
                                                </div>

                                                <button
                                                    onClick={() => { setSortBy('name'); setIsSortMenuOpen(false); }}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left group ${sortBy === 'name' ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <ArrowDownAZ className={`w-4 h-4 ${sortBy === 'name' ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                                        <span>Name</span>
                                                    </div>
                                                    {sortBy === 'name' && <motion.div layoutId="sort-check" className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />}
                                                </button>
                                                <button
                                                    onClick={() => { setSortBy('date'); setIsSortMenuOpen(false); }}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left group ${sortBy === 'date' ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Calendar className={`w-4 h-4 ${sortBy === 'date' ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                                        <span>Date Modified</span>
                                                    </div>
                                                    {sortBy === 'date' && <motion.div layoutId="sort-check" className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />}
                                                </button>
                                                <button
                                                    onClick={() => { setSortBy('size'); setIsSortMenuOpen(false); }}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left group ${sortBy === 'size' ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <HardDrive className={`w-4 h-4 ${sortBy === 'size' ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                                        <span>File Size</span>
                                                    </div>
                                                    {sortBy === 'size' && <motion.div layoutId="sort-check" className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />}
                                                </button>

                                                <div className="my-1 border-t border-white/5 mx-1" />

                                                <button
                                                    onClick={() => { setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {sortOrder === 'asc' ? (
                                                            <div className="flex flex-col -space-y-1 text-gray-500 group-hover:text-gray-300">
                                                                <ChevronUp className="w-3 h-3" />
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col -space-y-1 text-gray-500 group-hover:text-gray-300">
                                                                <ChevronDown className="w-3 h-3" />
                                                            </div>
                                                        )}
                                                        <span>Order</span>
                                                    </div>
                                                    <span className="text-[10px] uppercase font-mono bg-white/5 px-2 py-0.5 rounded text-gray-400 group-hover:bg-white/10 group-hover:text-white transition-colors">
                                                        {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                                                    </span>
                                                </button>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="h-4 w-px bg-white/10 mx-2" />

                            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/5 rounded-full shadow-inner">
                                <button
                                    onClick={() => setView('list')}
                                    className={`p-2 rounded-full transition-all duration-300 ${view === 'list'
                                        ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                                        : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <List className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setView('grid')}
                                    className={`p-2 rounded-full transition-all duration-300 ${view === 'grid'
                                        ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                                        : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* File List */}
                <div
                    className="flex-1 overflow-auto px-8 pb-8 custom-scrollbar"
                    onClick={handleBackgroundClick} // Clear selection on background click
                >
                    {view === 'grid' ? (
                        <>
                            {itemsSection(allItems.filter(f => f.type === 'folder'), "Folders")}
                            {itemsSection(allItems.filter(f => f.type === 'file'), "Files")}
                        </>
                    ) : (
                        <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.02]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white/5 text-gray-400 font-medium font-mono text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4">Size</th>
                                        <th className="px-6 py-4">Last Modified</th>
                                        <th className="px-6 py-4 w-32 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {allItems.map(item => {
                                        const isSelected = selectedItemIds.has(item.id);
                                        return (
                                            <tr
                                                key={item.id}
                                                className={`transition-colors group cursor-pointer ${isSelected ? 'bg-cyan-500/10 hover:bg-cyan-500/20' : 'hover:bg-white/5'}`}
                                                onClick={(e) => {
                                                    if ((e.target as HTMLElement).closest('button')) return;
                                                    handleFileClick(e, item);
                                                }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    if (!selectedItemIds.has(item.id)) {
                                                        // If right-clicking outside selection, clear and select this one
                                                        setSelectedItemIds(new Set([item.id]));
                                                    }
                                                    setContextMenu({ x: e.clientX, y: e.clientY, item });
                                                }}
                                            >
                                                <td className="px-6 py-3.5 font-medium text-gray-200 flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${item.type === 'folder' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-white/10 text-gray-400'}`}>
                                                        {item.type === 'folder' ? <FolderIcon className="w-4 h-4 fill-current" /> : <FileIcon className="w-4 h-4" />}
                                                    </div>
                                                    {item.name}
                                                </td>
                                                <td className="px-6 py-3.5 text-gray-500 font-mono text-xs">
                                                    {item.type === 'file'
                                                        ? formatSize(item.size)
                                                        : (folderStats[item.id] ? `${formatSize(folderStats[item.id].size)} • ${folderStats[item.id].count} items` : 'Calculating...')}
                                                </td>
                                                <td className="px-6 py-3.5 text-gray-500 font-mono text-xs">
                                                    {item.modified ? formatDate(item.modified) : '-'}
                                                </td>
                                                <td className="px-6 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRenameItem({ id: item.id, type: item.type, name: item.name });
                                                                setIsRenameOpen(true);
                                                            }}
                                                            className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                                            title="Rename"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleStar(item);
                                                            }}
                                                            className={`p-1.5 hover:bg-yellow-500/10 rounded transition-colors ${item.is_starred ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'}`}
                                                            title={item.is_starred ? "Unstar" : "Star"}
                                                        >
                                                            <Star className={`w-4 h-4 ${item.is_starred ? 'fill-current' : ''}`} />
                                                        </button>

                                                        {item.type === 'folder' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleFolderDownload(item.id);
                                                                }}
                                                                className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                                                title="Download Folder"
                                                            >
                                                                <Upload className="w-4 h-4 rotate-180" />
                                                            </button>
                                                        )}

                                                        {item.type === 'file' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDownload(item.id);
                                                                }}
                                                                className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
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
                                                            className="p-1.5 hover:bg-red-500/10 rounded text-gray-500 hover:text-red-500 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}


                </div>
            </main >

            {/* Upload Progress Panel (Google Drive Style) */}
            {/* Upload Progress Panel (Technical/Cyber) */}
            <AnimatePresence>
                {uploadQueue.length > 0 && (
                    <motion.div
                        initial={{ y: 20, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 20, opacity: 0, scale: 0.95 }}
                        className="fixed bottom-6 right-6 w-96 bg-[#0A0A0A] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden z-50 flex flex-col backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="bg-white/5 border-b border-white/5 px-4 py-3 flex items-center justify-between">
                            <span className="font-bold text-xs text-white uppercase tracking-wider">
                                {uploadQueue.filter(i => i.status === 'pending' || i.status === 'uploading').length === 0
                                    ? "Operations Complete"
                                    : `Processing ${uploadQueue.filter(i => i.status === 'pending' || i.status === 'uploading').length} Items`
                                }
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsUploadProgressMinimized(!isUploadProgressMinimized)}
                                    className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"

                                >
                                    {isUploadProgressMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => setUploadQueue([])}
                                    className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        {!isUploadProgressMinimized && (
                            <div className="max-h-60 overflow-y-auto bg-black/20 custom-scrollbar">
                                {uploadQueue.map((item, index) => (
                                    <div key={index} className="px-4 py-3 border-b border-white/5 flex items-center gap-3 last:border-0 hover:bg-white/5 transition-colors">
                                        <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg">
                                            <FileIcon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <p className="text-sm font-medium text-gray-200 truncate">{item.name}</p>
                                                {item.status === 'uploading' && (
                                                    <span className="text-xs text-cyan-400 font-mono">{Math.round(item.progress)}%</span>
                                                )}
                                            </div>

                                            {/* Progress Bar or Status Text */}
                                            {item.status === 'uploading' ? (
                                                <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                                                    <motion.div
                                                        className="bg-cyan-400 h-full rounded-full shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${item.progress}%` }}
                                                        transition={{ duration: 0.1 }}
                                                    />
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-gray-500 font-mono uppercase">
                                                    {item.status === 'pending' && "Queued"}
                                                    {item.status === 'completed' && <span className="text-green-400">Success</span>}
                                                    {item.status === 'error' && <span className="text-red-400">Failed</span>}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            {item.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-gray-600" />}
                                            {item.status === 'uploading' && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
                                            {item.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-400" />}
                                            {item.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>




            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {itemToDelete && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/10"
                        >
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/10 to-transparent flex items-center justify-center mb-4 text-red-500 border border-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                                    <Trash2 className="w-8 h-8" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">
                                    {itemToDelete.deleteType === 'hard' ? 'Delete Permanently?' : 'Move to Trash?'}
                                </h3>
                                <div className="text-sm text-gray-400 px-4">
                                    {itemToDelete.batchIds ? (
                                        <>Are you sure you want to delete <span className="font-bold text-white block mt-1 text-base">{itemToDelete.batchIds.length} items</span>?</>
                                    ) : (
                                        <>Are you sure you want to delete <span className="font-bold text-white block mt-1 text-base truncate max-w-[250px] mx-auto">{itemToDelete.name}</span>?</>
                                    )}
                                    {itemToDelete.deleteType === 'hard' && (
                                        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium">
                                            This action cannot be undone.
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setItemToDelete(null)}
                                    className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white transition-colors flex-1 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-red-600/20 flex-1 border border-white/10"
                                >
                                    {itemToDelete.deleteType === 'hard' ? 'Delete Forever' : 'Delete'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Rename Modal */}
            <AnimatePresence>
                {isRenameOpen && renameItem && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-[#0A0A0A] rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/10 overflow-hidden"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                                    <Pencil className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Rename</h3>
                                    <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                                        {renameItem.type}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="relative group">
                                    <input
                                        value={renameItem.name}
                                        onChange={(e) => setRenameItem({ ...renameItem, name: e.target.value })}
                                        className="peer w-full bg-black/20 border border-white/10 rounded-xl px-4 pt-5 pb-2 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-medium placeholder-transparent"
                                        placeholder=" "
                                        autoFocus
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (renameItem.name.trim()) {
                                                    try {
                                                        await invoke('rename_item', {
                                                            id: renameItem.id,
                                                            new_name: renameItem.name,
                                                            newName: renameItem.name,
                                                            is_folder: renameItem.type === 'folder',
                                                            isFolder: renameItem.type === 'folder'
                                                        });
                                                        setRefresh(r => r + 1);
                                                        setIsRenameOpen(false);
                                                    } catch (err) {
                                                        alert("Failed to rename: " + err);
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                    <label className="absolute left-4 top-2 text-[10px] text-gray-500 font-medium uppercase tracking-wider transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-500 peer-placeholder-shown:top-3.5 peer-focus:top-2 peer-focus:text-[10px] peer-focus:text-purple-400">
                                        Name
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsRenameOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors flex-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (renameItem.name.trim()) {
                                            try {
                                                await invoke('rename_item', {
                                                    id: renameItem.id,
                                                    new_name: renameItem.name,
                                                    newName: renameItem.name,
                                                    is_folder: renameItem.type === 'folder',
                                                    isFolder: renameItem.type === 'folder'
                                                });
                                                setRefresh(r => r + 1);
                                                setIsRenameOpen(false);
                                            } catch (err) {
                                                alert("Failed to rename: " + err);
                                            }
                                        }
                                    }}
                                    className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-500/20 flex-1"
                                >
                                    Rename
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Preview Modal */}
            <AnimatePresence>
                {previewingItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-[#0A0A0A] rounded-2xl border border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden relative shadow-2xl"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                                        <FileIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-medium text-sm">{previewingItem.name}</h3>
                                        <p className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">
                                            {formatSize(previewingItem.size)} • {previewingItem.mime_type}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownload(previewingItem.id)}
                                        className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
                                        title="Download"
                                    >
                                        <Cloud className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPreviewingItem(null);
                                            setPreviewUrl(null);
                                        }}
                                        className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden bg-black/40 relative flex items-center justify-center p-4">
                                {isPreviewLoading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
                                        <p className="text-sm text-gray-400 animate-pulse">Fetching high-quality media from Telegram...</p>
                                    </div>
                                ) : previewUrl ? (
                                    <div className="w-full h-full flex items-center justify-center p-4">
                                        {(() => {
                                            const name = previewingItem.name.toLowerCase();
                                            const mime = (previewingItem.mime_type || '').toLowerCase();

                                            const isImage = (mime.startsWith('image/') ||
                                                /\.(jpg|jpeg|png|webp|svg|bmp)$/i.test(name)) && !name.endsWith('.gif'); // Exclude .gif here

                                            // Treated as video for playback control (looping)
                                            const isVideo = mime.startsWith('video/') ||
                                                /\.(mp4|mov|avi|wmv|flv|webm|mkv|gif)$/i.test(name);

                                            const isAudio = mime.startsWith('audio/') ||
                                                /\.(mp3|wav|ogg|m4a|flac)$/i.test(name);

                                            const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');

                                            if (isImage) {
                                                return (
                                                    <img
                                                        src={previewUrl}
                                                        alt={previewingItem.name}
                                                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                                    />
                                                );
                                            } else if (isVideo) {
                                                const isGif = name.endsWith('.gif');
                                                // If it's a small MP4 (Telegram often converts gifs to mp4), treat as gif
                                                // For now relying on extension is safest for "GIF user exp".

                                                return (
                                                    <div className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 group flex items-center justify-center">
                                                        {/* Backdrop blur effect */}
                                                        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-blue-600/10 opacity-50" />

                                                        <video
                                                            src={previewUrl}
                                                            controls={!isGif}
                                                            autoPlay
                                                            loop={isGif}
                                                            muted={isGif}
                                                            playsInline
                                                            className="w-full h-full object-contain relative z-10"
                                                        />
                                                    </div>
                                                );
                                            } else if (isAudio) {
                                                return (
                                                    <div className="bg-white/5 p-12 rounded-3xl border border-white/5 flex flex-col items-center gap-8 w-full max-w-xl shadow-2xl backdrop-blur-sm">
                                                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(6,182,212,0.15)] animate-pulse-slow">
                                                            <Music className="w-12 h-12 text-cyan-400 fill-current opacity-80" />
                                                        </div>
                                                        <div className="text-center w-full">
                                                            <h3 className="text-xl font-bold text-white mb-2 truncate px-4" title={previewingItem.name}>
                                                                {previewingItem.name}
                                                            </h3>
                                                            <p className="text-sm text-gray-400 font-mono">Audio Preview</p>
                                                        </div>
                                                        <audio
                                                            src={previewUrl}
                                                            controls
                                                            autoPlay
                                                            className="w-full"
                                                        />
                                                    </div>
                                                );
                                            } else if (isPdf) {
                                                return (
                                                    <iframe
                                                        src={previewUrl}
                                                        className="w-full h-full rounded-xl bg-white shadow-2xl border-none"
                                                        title="PDF Preview"
                                                    />
                                                );
                                            } else {
                                                return (
                                                    <div className="text-center p-12 bg-white/5 rounded-3xl border border-white/5 max-w-md backdrop-blur-sm">
                                                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                                                            <AlertCircle className="w-10 h-10 text-gray-400" />
                                                        </div>
                                                        <h4 className="text-xl font-bold text-white mb-2">Preview Not Available</h4>
                                                        <p className="text-sm text-gray-400 mb-8 leading-relaxed">
                                                            We can't preview this file type directly in Paperfold yet.
                                                            <br />Please download it to view locally.
                                                        </p>
                                                        <button
                                                            onClick={() => handleDownload(previewingItem.id)}
                                                            className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95"
                                                        >
                                                            Download File
                                                        </button>
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </div>
                                ) : null}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <>
                        {/* Backdrop to close menu */}
                        <div
                            className="fixed inset-0 z-50"
                            onClick={() => setContextMenu(null)}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                        />

                        {/* Menu */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="fixed z-50 bg-[#0A0A0A] border border-white/10 rounded-xl shadow-2xl p-1.5 min-w-[180px] backdrop-blur-xl"
                            style={{
                                top: Math.min(contextMenu.y, window.innerHeight - 200),
                                left: Math.min(contextMenu.x, window.innerWidth - 180)
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-2 py-1.5 border-b border-white/5 mb-1">
                                {selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1 ? (
                                    <p className="text-xs font-medium text-gray-400 truncate max-w-[150px]">{selectedItemIds.size} items selected</p>
                                ) : (
                                    <>
                                        <p className="text-xs font-medium text-gray-400 truncate max-w-[150px]">{contextMenu.item.name}</p>
                                        {contextMenu.item.path_display && (
                                            <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[150px]">{contextMenu.item.path_display}</p>
                                        )}
                                    </>
                                )}
                            </div>

                            {currentSection !== 'trash' ? (
                                <>
                                    <button
                                        onClick={() => { handleToggleStar(contextMenu.item); setContextMenu(null); }}
                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                    >
                                        <Star className={`w-4 h-4 ${contextMenu.item.is_starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                        {(selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1)
                                            ? `Star ${selectedItemIds.size} items`
                                            : (contextMenu.item.is_starred ? 'Unstar' : 'Star')}
                                    </button>

                                    {(!selectedItemIds.has(contextMenu.item.id) || selectedItemIds.size <= 1) && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    handleRename(contextMenu.item.id, contextMenu.item.name, contextMenu.item.type === 'folder');
                                                    setContextMenu(null);
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                Rename
                                            </button>

                                            {contextMenu.item.type === 'file' && (
                                                <button
                                                    onClick={() => { handleDownload(contextMenu.item.id); setContextMenu(null); }}
                                                    className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                                >
                                                    <Upload className="w-4 h-4 rotate-180" />
                                                    Download
                                                </button>
                                            )}

                                            {contextMenu.item.type === 'folder' && (
                                                <>
                                                    <button
                                                        onClick={() => { handleFolderDownload(contextMenu.item.id); setContextMenu(null); }}
                                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                                    >
                                                        <Upload className="w-4 h-4 rotate-180" />
                                                        Download Folder
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setCustomizationItem({
                                                                id: contextMenu.item.id,
                                                                name: contextMenu.item.name,
                                                                color: contextMenu.item.color,
                                                                icon: contextMenu.item.icon,
                                                                gradient: contextMenu.item.gradient,
                                                                cover_image: contextMenu.item.cover_image,
                                                                emoji: contextMenu.item.emoji,
                                                                show_badges: contextMenu.item.show_badges,
                                                                tags: contextMenu.item.tags
                                                            });
                                                            setIsCustomizeOpen(true);
                                                            setContextMenu(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                                    >
                                                        <Settings className="w-4 h-4" />
                                                        Customize
                                                    </button>
                                                </>
                                            )}

                                            <button
                                                onClick={() => {
                                                    handleProperties(contextMenu.item.id, contextMenu.item.type, contextMenu.item.name, contextMenu.item.description, contextMenu.item.sizeBytes);
                                                    setContextMenu(null);
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                            >
                                                <AlertCircle className="w-4 h-4" />
                                                Properties
                                            </button>
                                        </>
                                    )}
                                    <div className="h-px bg-white/5 my-1" />

                                    <button
                                        onClick={() => {
                                            if (selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1) {
                                                // Batch Delete
                                                setItemToDelete({
                                                    id: 'batch', // Dummy ID
                                                    isFolder: false, // Mixed
                                                    name: `${selectedItemIds.size} items`,
                                                    deleteType: 'soft',
                                                    batchIds: Array.from(selectedItemIds)
                                                });
                                            } else {
                                                handleDelete(contextMenu.item.id, contextMenu.item.name, contextMenu.item.type === 'folder');
                                            }
                                            setContextMenu(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {(selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1)
                                            ? `Delete ${selectedItemIds.size} items`
                                            : 'Delete'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => { handleRestore(contextMenu.item.id, contextMenu.item.type === 'folder'); setContextMenu(null); }}
                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-green-400 hover:bg-green-500/10 rounded-lg transition-colors text-left"
                                    >
                                        <RotateCw className="w-4 h-4" />
                                        {(selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1)
                                            ? `Restore ${selectedItemIds.size} items`
                                            : 'Restore'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1) {
                                                // Batch Delete Forever
                                                setItemToDelete({
                                                    id: 'batch',
                                                    isFolder: false,
                                                    name: `${selectedItemIds.size} items`,
                                                    deleteType: 'hard',
                                                    batchIds: Array.from(selectedItemIds)
                                                });
                                            } else {
                                                handleDeleteForever(contextMenu.item.id, contextMenu.item.type === 'folder', contextMenu.item.name);
                                            }
                                            setContextMenu(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {(selectedItemIds.has(contextMenu.item.id) && selectedItemIds.size > 1)
                                            ? `Delete Forever ${selectedItemIds.size} items`
                                            : 'Delete Forever'}
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </>
                )
                }
            </AnimatePresence >

        </div >
    );
}
