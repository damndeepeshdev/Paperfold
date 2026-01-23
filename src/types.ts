export interface FileMetadata {
    id: string;
    folder_id: string | null;
    name: string;
    size: number;
    mime_type: string;
    message_id: number;
    created_at: number;
    is_starred?: boolean;
    thumbnail?: string;
    path_display?: string;

}

export interface Folder {
    id: string;
    parent_id: string | null;
    name: string;
    created_at: number;
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
    view_mode?: 'grid' | 'list';
    last_modified?: number;

}
