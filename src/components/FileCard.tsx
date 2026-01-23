import {
    Folder, File as FileIcon, Star, FileText, Music, Video, Image as ImageIcon, Play,
    Briefcase, Heart, Code, Globe, User, Users, Shield, Lock, Settings, Archive,
    Cloud, Database, Smartphone, Monitor, Book, Coffee, Gift, Tag, Flag
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';

export interface FileItem {
    id: string;
    name: string;
    type: 'file' | 'folder';
    size?: string;
    sizeBytes?: number;
    modified?: string;
    thumbnail?: string;
    mimeType?: string;
    is_starred?: boolean;
    path_display?: string;
    color?: string;
    icon?: string;
    gradient?: string;
    cover_image?: string;
    emoji?: string;
    pattern?: string;
    show_badges?: boolean;
    tags?: string[];
    description?: string;

}

interface FileCardProps {
    item: FileItem;
    isSelected?: boolean;
    onNavigate?: (id: string) => void;
    onPreview?: (item: FileItem) => void;
    onContextMenu?: (e: React.MouseEvent, item: FileItem) => void;
    onClick?: (e: React.MouseEvent, item: FileItem) => void;
    downloadProgress?: number;
}

export const FOLDER_ICONS: Record<string, any> = {
    default: Folder,
    briefcase: Briefcase,
    heart: Heart,
    code: Code,
    globe: Globe,
    user: User,
    users: Users,
    shield: Shield,
    lock: Lock,
    settings: Settings,
    archive: Archive,
    cloud: Cloud,
    database: Database,
    smartphone: Smartphone,
    monitor: Monitor,
    book: Book,
    coffee: Coffee,
    gift: Gift,
    tag: Tag,
    flag: Flag
};

export default function FileCard({ item, isSelected, onNavigate, onPreview, onContextMenu, onClick, downloadProgress }: FileCardProps) {
    const getFileIcon = () => {
        const name = item.name.toLowerCase();
        const mime = (item.mimeType || '').toLowerCase();

        if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
            return <ImageIcon className="w-1/3 h-1/3 text-purple-400 opacity-80" />;
        }
        if (mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i.test(name)) {
            return <Video className="w-1/3 h-1/3 text-red-400 opacity-80" />;
        }
        if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) {
            return <Music className="w-1/3 h-1/3 text-yellow-400 opacity-80" />;
        }
        if (mime === 'application/pdf' || name.endsWith('.pdf')) {
            return <FileText className="w-1/3 h-1/3 text-orange-400 opacity-80" />;
        }
        return <FileIcon className="w-1/3 h-1/3 text-gray-500" />;
    };

    const isVideo = (item.mimeType || '').startsWith('video/') || /\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i.test(item.name);

    const FolderIconStart = item.icon && FOLDER_ICONS[item.icon] ? FOLDER_ICONS[item.icon] : Folder;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: 1,
                scale: isSelected ? 0.95 : 1,
                backgroundColor: isSelected ? 'rgba(6,182,212,0.1)' : 'transparent'
            }}
            whileHover={{ scale: isSelected ? 0.97 : 1.02 }}
            className={`group relative flex flex-col items-center gap-3 cursor-pointer p-2 rounded-xl transition-all duration-200 hover:bg-white/5 ${isSelected ? 'ring-2 ring-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : ''
                }`}
            onClick={(e) => {
                if (onClick) {
                    onClick(e, item);
                } else if (item.type === 'folder') {
                    onNavigate?.(item.id);
                } else {
                    onPreview?.(item);
                }
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu?.(e, item);
            }}
        >
            {/* Thumbnail / Icon Container - Main Visual */}
            <div
                className={`w-full aspect-square rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-center transition-all duration-300 ${item.thumbnail
                    ? 'bg-black/50'
                    : item.type === 'folder'
                        ? '' // Transparent for folders
                        : 'bg-white/5 border border-white/5'
                    }`}
            >
                {/* Folder Content */}
                {item.type === 'folder' && (
                    <div className="relative w-full h-full flex items-center justify-center">
                        {/* Cover Image or Gradient Background */}
                        <div
                            className="absolute inset-0 rounded-xl overflow-hidden transition-all duration-300"
                            style={{
                                background: item.gradient || item.color || '#22d3ee',
                                opacity: item.cover_image ? 1 : (item.gradient ? 0.9 : 0.2)
                            }}
                        >
                            {item.cover_image && (
                                <img src={convertFileSrc(item.cover_image)} alt="cover" className="w-full h-full object-cover" />
                            )}

                        </div>

                        {/* Pattern Overlay - Separate layer to handle opacity independently */}
                        {item.pattern && (
                            <div
                                className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
                                style={{
                                    backgroundImage: item.pattern,
                                    backgroundSize: (item.pattern.includes('linear-gradient') && item.pattern.includes('to right')) || item.pattern.includes('90deg') ? '20px 20px' : '10px 10px',
                                    opacity: 0.15 // Subtle but visible overlay
                                }}
                            />
                        )}

                        {/* Icon / Emoji */}
                        <div className="relative z-10 transform transition-transform duration-300 group-hover:scale-110">
                            {item.emoji ? (
                                <span className="text-4xl filter drop-shadow-lg">{item.emoji}</span>
                            ) : (
                                !item.cover_image && (
                                    <FolderIconStart
                                        className={`w-12 h-12 ${item.gradient ? 'text-white drop-shadow-md' : ''}`}
                                        style={{
                                            color: item.gradient ? 'white' : (item.color || '#22d3ee'),
                                            fill: item.gradient ? 'rgba(255,255,255,0.2)' : 'currentColor',
                                            fillOpacity: item.gradient ? 1 : 0.2
                                        }}
                                    />
                                )
                            )}

                        </div>
                    </div>
                )}
                {item.type === 'folder' && item.show_badges && (
                    <div className="absolute bottom-2 px-2 py-0.5 bg-black/60 rounded-full border border-white/10 backdrop-blur-sm">
                        <span className="text-[10px] font-mono text-gray-300">Folder</span>
                    </div>
                )}
                {/* Render Tags */}
                {item.tags && item.tags.length > 0 && (
                    <div className="absolute top-2 right-2 flex gap-1 flex-wrap justify-end max-w-[80%]">
                        {item.tags.map((tag, idx) => (
                            <div key={idx} className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.5)]" title={tag} />
                        ))}
                    </div>
                )}

                {item.type !== 'folder' && (
                    item.thumbnail ? (
                        <div className="relative w-full h-full">
                            <img
                                src={`data:image/jpeg;base64,${item.thumbnail}`}
                                alt={item.name}
                                className="w-full h-full object-cover"
                            />
                            {isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-xl">
                                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        getFileIcon()
                    )
                )}

                {/* Star Overlay Indicator */}
                {item.is_starred && (
                    <div className="absolute top-2 right-2 text-yellow-400">
                        <Star className="w-4 h-4 fill-current drop-shadow-md" />
                    </div>
                )}


                {/* Download Progress Overlay */}
                {downloadProgress !== undefined && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4 z-20 backdrop-blur-sm rounded-2xl">
                        <span className="text-xl font-bold text-cyan-400 mb-2">{downloadProgress}%</span>
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-cyan-500 transition-all duration-300 ease-out"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-gray-400 mt-2 font-mono uppercase tracking-wider">Downloading</span>
                    </div>
                )}
            </div>

            {/* Name */}
            <div className="text-center w-full px-1">
                <h3 className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors truncate" title={item.name}>
                    {item.name}
                </h3>
            </div>
        </motion.div>
    );
}
