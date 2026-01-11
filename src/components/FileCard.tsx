import { File, Folder, Download, Trash, Pencil, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

export interface FileItem {
    id: string;
    name: string;
    type: 'file' | 'folder';
    size?: string;
    modified?: string;
    mimeType?: string;
    is_starred?: boolean;
}

interface FileCardProps {
    item: FileItem;
    onNavigate?: (folderId: string) => void;
    onDownload?: (fileId: string) => void;
    onDelete?: (id: string) => void;
    onRename?: (id: string) => void;
    onRestore?: (id: string) => void;
    onPreview?: (item: FileItem) => void;
    onToggleStar?: (item: FileItem) => void;
}

export default function FileCard({ item, onNavigate, onDownload, onDelete, onRename, onRestore, onPreview, onToggleStar }: FileCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            className="group relative p-4 bg-card hover:bg-accent/50 border border-border rounded-xl cursor-pointer transition-colors"
            onClick={() => {
                if (item.type === 'folder') {
                    onNavigate?.(item.id);
                } else {
                    onPreview?.(item);
                }
            }}
        >
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-lg ${item.type === 'folder' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-secondary text-primary'}`}>
                        {item.type === 'folder' ? <Folder className="w-6 h-6" /> : <File className="w-6 h-6" />}
                    </div>
                    <div className="flex gap-1">
                        {onToggleStar && (
                            <button
                                className={`p-2 rounded-full transition-opacity hover:bg-yellow-50 hover:text-yellow-500 ${item.is_starred ? 'opacity-100 text-yellow-500' : 'opacity-0 group-hover:opacity-100 text-muted-foreground'}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleStar(item);
                                }}
                                title={item.is_starred ? "Unstar" : "Star"}
                            >
                                <div className="relative">
                                    <Trash className="w-4 h-4 opacity-0 absolute" /> {/* Spacer hack or just use Star */}
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill={item.is_starred ? "currentColor" : "none"}
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="w-4 h-4"
                                    >
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                </div>
                            </button>
                        )}
                        {onRename && (
                            <button
                                className="p-2 hover:bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRename(item.id);
                                }}
                                title="Rename"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        )}
                        {onRestore && (
                            <button
                                className="p-2 hover:bg-green-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-green-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRestore(item.id);
                                }}
                                title="Restore"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                        {item.type === 'file' && onDownload && (
                            <button
                                className="p-2 hover:bg-background rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDownload(item.id);
                                }}
                                title="Download"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            className="p-2 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete?.(item.id);
                            }}
                            title="Delete"
                        >
                            <Trash className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="space-y-1">
                    <h3 className="font-medium truncate" title={item.name}>{item.name}</h3>
                    <p className="text-xs text-muted-foreground">
                        {item.type === 'folder' ? 'Folder' : item.size} • {item.modified || 'Just now'}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
