use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub created_at: i64,
    #[serde(default)]
    pub trashed: bool,
    #[serde(default)]
    pub trashed_at: Option<i64>,
    #[serde(default)]
    pub is_starred: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub gradient: Option<String>,
    #[serde(default)]
    pub cover_image: Option<String>,
    #[serde(default)]
    pub emoji: Option<String>,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub show_badges: bool, // e.g. "5 Items"
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub view_mode: Option<String>, // 'grid' | 'list'
    #[serde(default)]
    pub last_modified: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub size: i64,
    pub mime_type: String,
    pub message_id: i32,
    pub created_at: i64,
    #[serde(default)]
    pub trashed: bool,
    #[serde(default)]
    pub trashed_at: Option<i64>,
    #[serde(default)]
    pub is_starred: bool,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct DataStore {
    folders: Vec<Folder>,
    files: Vec<FileMetadata>,
}

pub struct Database {
    db_path: PathBuf,
    store: RwLock<DataStore>,
}

impl Database {
    pub fn new(app_dir: &str) -> Self {
        let db_path = std::path::Path::new(app_dir).join("metadata.json");
        let store = if db_path.exists() {
            let file = File::open(&db_path).unwrap();
            let reader = BufReader::new(file);
            serde_json::from_reader(reader).unwrap_or_default()
        } else {
            DataStore::default()
        };

        Database {
            db_path,
            store: RwLock::new(store),
        }
    }

    fn save(&self) {
        let file = File::create(&self.db_path).unwrap();
        let writer = BufWriter::new(file);
        serde_json::to_writer(writer, &*self.store.read().unwrap()).unwrap();
    }

    // Helper to get a unique name (e.g. "Folder (1)")
    // This needs to be called inside a lock, or we assume single-threaded access to store.
    // Since we lock in public methods, we should make this a private method taking &store.
    fn get_unique_name(
        &self,
        store: &DataStore,
        parent_id: Option<&String>,
        base_name: &str,
        is_folder: bool,
    ) -> String {
        // Base case: check if it exists
        let exists = if is_folder {
            store
                .folders
                .iter()
                .any(|f| f.parent_id.as_ref() == parent_id && f.name == base_name && !f.trashed)
        } else {
            store
                .files
                .iter()
                .any(|f| f.folder_id.as_ref() == parent_id && f.name == base_name && !f.trashed)
        };

        if !exists {
            return base_name.to_string();
        }

        // It exists, try (1), (2), etc.
        let mut i = 1;
        loop {
            let candidate = format!("{} ({})", base_name, i);
            let exists =
                if is_folder {
                    store.folders.iter().any(|f| {
                        f.parent_id.as_ref() == parent_id && f.name == candidate && !f.trashed
                    })
                } else {
                    store.files.iter().any(|f| {
                        f.folder_id.as_ref() == parent_id && f.name == candidate && !f.trashed
                    })
                };

            if !exists {
                return candidate;
            }
            i += 1;
        }
    }

    pub fn create_folder(&self, name: &str, parent_id: Option<String>) -> String {
        let mut store = self.store.write().unwrap();

        // Ensure unique name
        let final_name = self.get_unique_name(&store, parent_id.as_ref(), name, true);

        let id = Uuid::new_v4().to_string();
        // timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let folder = Folder {
            id: id.clone(),
            parent_id,
            name: final_name,
            created_at: now,
            trashed: false,
            trashed_at: None,
            is_starred: false,
            color: None,
            icon: None,
            gradient: None,
            cover_image: None,
            emoji: None,
            pattern: None,
            show_badges: false,
            tags: None,
            description: None,
            view_mode: None,

            last_modified: now,
        };

        store.folders.push(folder);
        drop(store);
        self.save();
        id
    }

    pub fn list_contents(&self, folder_id: Option<String>) -> (Vec<Folder>, Vec<FileMetadata>) {
        let store = self.store.read().unwrap();
        let folders = store
            .folders
            .iter()
            .filter(|f| f.parent_id == folder_id && !f.trashed)
            .cloned()
            .collect();
        let files = store
            .files
            .iter()
            .filter(|f| f.folder_id == folder_id && !f.trashed)
            .cloned()
            .collect();
        (folders, files)
    }

    pub fn list_trash(&self) -> (Vec<Folder>, Vec<FileMetadata>) {
        let store = self.store.read().unwrap();
        let folders = store
            .folders
            .iter()
            .filter(|f| f.trashed)
            .cloned()
            .collect();
        let files = store.files.iter().filter(|f| f.trashed).cloned().collect();
        (folders, files)
    }

    pub fn get_file(&self, id: &str) -> Option<FileMetadata> {
        let store = self.store.read().unwrap();
        store.files.iter().find(|f| f.id == id).cloned()
    }

    pub fn lookup_folder_name(&self, id: &str) -> Option<String> {
        let store = self.store.read().unwrap();
        store
            .folders
            .iter()
            .find(|f| f.id == id)
            .map(|f| f.name.clone())
    }

    pub fn get_folder_by_id(&self, id: &str) -> Option<Folder> {
        let store = self.store.read().unwrap();
        store.folders.iter().find(|f| f.id == id).cloned()
    }

    pub fn add_file(
        &self,
        folder_id: Option<String>,
        name: String,
        size: i64,
        mime_type: String,
        message_id: i32,
        thumbnail: Option<String>,
    ) -> FileMetadata {
        let mut store = self.store.write().unwrap();

        // Ensure unique name
        let final_name = self.get_unique_name(&store, folder_id.as_ref(), &name, false);

        let id = Uuid::new_v4().to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let file = FileMetadata {
            id: id.clone(),
            folder_id,
            name: final_name,
            size,
            mime_type,
            message_id,
            created_at: now,
            trashed: false,
            trashed_at: None,
            is_starred: false,

            thumbnail,
        };

        store.files.push(file.clone());
        drop(store);
        self.save();
        file
    }

    // Soft delete
    pub fn trash_item(&self, id: &str, is_folder: bool) {
        let mut store = self.store.write().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        if is_folder {
            if let Some(f) = store.folders.iter_mut().find(|f| f.id == id) {
                f.trashed = true;
                f.trashed_at = Some(now);

                // Also trash children recursively?
                // For simplicity now, let's just trash the folder.
                // But logically, children should be hidden too.
                // If I trash a folder, list_contents won't show it.
                // If I enter the folder by ID (if I had a link), list_contents(folder_id) would show children unless I filter them too?
                // list_contents only filters items WHERE parent_id == folder_id AND !trashed.
                // So children are effectively hidden because you can't navigate to the parent.
            }
        } else {
            if let Some(f) = store.files.iter_mut().find(|f| f.id == id) {
                f.trashed = true;
                f.trashed_at = Some(now);
            }
        }
        drop(store);
        self.save();
    }

    pub fn restore_item(&self, id: &str, is_folder: bool) {
        let mut store = self.store.write().unwrap();
        if is_folder {
            if let Some(f) = store.folders.iter_mut().find(|f| f.id == id) {
                f.trashed = false;
                f.trashed_at = None;
            }
        } else {
            if let Some(f) = store.files.iter_mut().find(|f| f.id == id) {
                f.trashed = false;
                f.trashed_at = None;
            }
        }
        drop(store);
        self.save();
    }

    // Hard delete (Permanent)
    pub fn delete_file(&self, id: &str) -> bool {
        let mut store = self.store.write().unwrap();
        let len_before = store.files.len();
        store.files.retain(|f| f.id != id);
        let deleted = store.files.len() < len_before;
        if deleted {
            drop(store);
            self.save();
        }
        deleted
    }

    pub fn delete_folder(&self, id: &str) -> Vec<FileMetadata> {
        let mut store = self.store.write().unwrap();

        // 1. Find all files in this folder (recursive TODO later, for now flat)
        let deleted_files: Vec<FileMetadata> = store
            .files
            .iter()
            .filter(|f| f.folder_id.as_deref() == Some(id))
            .cloned()
            .collect();

        // 2. Remove files
        store.files.retain(|f| f.folder_id.as_deref() != Some(id));

        // 3. Remove folder
        store.folders.retain(|f| f.id != id);

        drop(store);
        self.save();

        deleted_files
    }

    pub fn rename_file(&self, id: &str, new_name: &str) -> bool {
        let mut store = self.store.write().unwrap();
        if let Some(file) = store.files.iter_mut().find(|f| f.id == id) {
            file.name = new_name.to_string();
            drop(store); // release lock before save
            self.save();
            true
        } else {
            false
        }
    }

    pub fn move_file(&self, id: &str, target_folder_id: Option<String>, new_name: &str) -> bool {
        let mut store = self.store.write().unwrap();
        if let Some(file) = store.files.iter_mut().find(|f| f.id == id) {
            // Basic unique name check could be added here similar to add_file
            // For now, we assume caller (WebDAV) handles name collisions or we just overwrite
            file.folder_id = target_folder_id;
            file.name = new_name.to_string();
            drop(store);
            self.save();
            true
        } else {
            false
        }
    }

    pub fn move_folder(&self, id: &str, target_parent_id: Option<String>, new_name: &str) -> bool {
        let mut store = self.store.write().unwrap();
        // Prevent moving folder into itself (simple check)
        if let Some(target) = &target_parent_id {
            if target == id {
                return false;
            }
            // Deep cycle check omitted for brevity, but should be considered for prod
        }

        if let Some(folder) = store.folders.iter_mut().find(|f| f.id == id) {
            folder.parent_id = target_parent_id;
            folder.name = new_name.to_string();
            drop(store);
            self.save();
            true
        } else {
            false
        }
    }

    pub fn rename_folder(&self, id: &str, new_name: &str) -> bool {
        let mut store = self.store.write().unwrap();
        if let Some(folder) = store.folders.iter_mut().find(|f| f.id == id) {
            folder.name = new_name.to_string();
            drop(store);
            self.save();
            true
        } else {
            false
        }
    }

    pub fn get_folder_stats(&self, folder_id: &str) -> (i64, i32) {
        let store = self.store.read().unwrap();
        self.calculate_stats_recursive(&store, folder_id)
    }

    fn calculate_stats_recursive(&self, store: &DataStore, folder_id: &str) -> (i64, i32) {
        let mut total_size: i64 = 0;
        let mut total_count: i32 = 0;

        // Count files in this folder
        let files_in_folder: Vec<&FileMetadata> = store
            .files
            .iter()
            .filter(|f| f.folder_id.as_deref() == Some(folder_id) && !f.trashed)
            .collect();

        for file in files_in_folder {
            total_size += file.size;
            total_count += 1;
        }

        // Recursively count subfolders
        let subfolders: Vec<&Folder> = store
            .folders
            .iter()
            .filter(|f| f.parent_id.as_deref() == Some(folder_id) && !f.trashed)
            .collect();

        for folder in subfolders {
            let (child_size, child_count) = self.calculate_stats_recursive(store, &folder.id);
            total_size += child_size;
            total_count += child_count; // Should we count the folder itself as 1 item?
                                        // Usually "5 items" includes subfolders as items.
            total_count += 1;
        }

        (total_size, total_count)
    }

    pub fn update_folder_metadata(
        &self,
        id: &str,
        color: Option<String>,
        icon: Option<String>,
        gradient: Option<String>,
        cover_image: Option<String>,
        emoji: Option<String>,
        pattern: Option<String>,
        show_badges: Option<bool>,
        tags: Option<Vec<String>>,
        description: Option<String>,
        // view_mode update logic or separate? Let's add it.
        view_mode: Option<String>,
    ) -> bool {
        let mut store = self.store.write().unwrap();
        if let Some(folder) = store.folders.iter_mut().find(|f| f.id == id) {
            if let Some(c) = color {
                folder.color = if c.is_empty() { None } else { Some(c) };
            }
            if let Some(i) = icon {
                folder.icon = if i.is_empty() { None } else { Some(i) };
            }
            if let Some(g) = gradient {
                folder.gradient = if g.is_empty() { None } else { Some(g) };
            }
            if let Some(c) = cover_image {
                folder.cover_image = if c.is_empty() { None } else { Some(c) };
            }
            if let Some(e) = emoji {
                folder.emoji = if e.is_empty() { None } else { Some(e) };
            }
            if let Some(p) = pattern {
                folder.pattern = if p.is_empty() { None } else { Some(p) };
            }
            if let Some(s) = show_badges {
                folder.show_badges = s;
            }
            if let Some(t) = tags {
                folder.tags = Some(t);
            }
            if let Some(d) = description {
                folder.description = Some(d);
            }
            if let Some(v) = view_mode {
                folder.view_mode = Some(v);
            }

            folder.last_modified = chrono::Utc::now().timestamp();

            drop(store);
            self.save();
            true
        } else {
            false
        }
    }

    pub fn cleanup_trash(&self, days: i64) -> Vec<FileMetadata> {
        let mut store = self.store.write().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let limit = now - (days * 24 * 60 * 60);

        // Collect files to be deleted (for telegram deletion)
        let mut deleted_files = Vec::new();

        // 1. Identify valid trash items to remove
        // Note: If we remove a folder, we need to return its files too?
        // This is getting complex for auto-cleanup.
        // Let's just implement individual item cleanup for now.

        // Files older than limit
        let files_to_remove: Vec<String> = store
            .files
            .iter()
            .filter(|f| f.trashed && f.trashed_at.unwrap_or(0) < limit)
            .map(|f| f.id.clone())
            .collect();

        for id in &files_to_remove {
            if let Some(f) = store.files.iter().find(|f| f.id == *id) {
                deleted_files.push(f.clone());
            }
        }
        store.files.retain(|f| !files_to_remove.contains(&f.id));

        // Folders older than limit
        let folders_to_remove: Vec<String> = store
            .folders
            .iter()
            .filter(|f| f.trashed && f.trashed_at.unwrap_or(0) < limit)
            .map(|f| f.id.clone())
            .collect();

        // If folder is removed, its children must be removed too
        // But children might not be marked trashed?
        // For now, let's assume if you trash a folder, we don't necessarily trash children in DB
        // but they become inaccessible.
        // When cleaning up a folder, we should delete its children.

        for fid in folders_to_remove.clone() {
            let children_files: Vec<FileMetadata> = store
                .files
                .iter()
                .filter(|f| f.folder_id.as_deref() == Some(&fid))
                .cloned()
                .collect();
            deleted_files.extend(children_files);
            store.files.retain(|f| f.folder_id.as_deref() != Some(&fid));
        }

        store.folders.retain(|f| !folders_to_remove.contains(&f.id));

        drop(store);
        self.save();

        deleted_files
    }

    pub fn toggle_star(&self, id: &str, is_folder: bool) -> bool {
        let mut store = self.store.write().unwrap();
        let mut found = false;

        if is_folder {
            if let Some(f) = store.folders.iter_mut().find(|f| f.id == id) {
                f.is_starred = !f.is_starred;
                found = true;
            }
        } else {
            if let Some(f) = store.files.iter_mut().find(|f| f.id == id) {
                f.is_starred = !f.is_starred;
                found = true;
            }
        }

        if found {
            drop(store);
            self.save();
        }
        found
    }

    pub fn get_starred(&self) -> (Vec<Folder>, Vec<FileMetadata>) {
        let store = self.store.read().unwrap();
        let folders = store
            .folders
            .iter()
            .filter(|f| f.is_starred && !f.trashed)
            .cloned()
            .collect();
        let files = store
            .files
            .iter()
            .filter(|f| f.is_starred && !f.trashed)
            .cloned()
            .collect();
        (folders, files)
    }

    pub fn search_items(&self, query: &str) -> (Vec<Folder>, Vec<FileMetadata>) {
        let store = self.store.read().unwrap();
        let query_lower = query.to_lowercase();

        let folders = store
            .folders
            .iter()
            .filter(|f| {
                !f.trashed
                    && (f.name.to_lowercase().contains(&query_lower)
                        || f.tags.as_ref().map_or(false, |tags| {
                            tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
                        }))
            })
            .cloned()
            .collect();

        let files = store
            .files
            .iter()
            .filter(|f| !f.trashed && f.name.to_lowercase().contains(&query_lower))
            .cloned()
            .collect();

        (folders, files)
    }

    pub fn get_total_usage(&self) -> i64 {
        let store = self.store.read().unwrap();
        // Sum size of all NON-TRASHED files
        store
            .files
            .iter()
            .filter(|f| !f.trashed)
            .map(|f| f.size)
            .sum()
    }
    pub fn get_all_files(&self) -> Vec<FileMetadata> {
        let store = self.store.read().unwrap();
        store.files.clone()
    }

    pub fn get_all_folders(&self) -> Vec<Folder> {
        let store = self.store.read().unwrap();
        store.folders.clone()
    }

    pub fn delete_files_by_ids(&self, ids: &[String]) {
        {
            let mut store = self.store.write().unwrap();
            store.files.retain(|f| !ids.contains(&f.id));
        }
        self.save();
    }

    pub fn get_existing_message_ids(&self) -> Vec<i32> {
        let store = self.store.read().unwrap();
        store.files.iter().map(|f| f.message_id).collect()
    }

    pub fn move_file_to_sync_folder(
        &self,
        message_id: i32,
        target_folder_id: &str,
    ) -> Result<(), String> {
        let mut store = self.store.write().unwrap();
        if let Some(file) = store.files.iter_mut().find(|f| f.message_id == message_id) {
            // Only move if currently in root (folder_id is None)
            if file.folder_id.is_none() {
                file.folder_id = Some(target_folder_id.to_string());
                drop(store);
                self.save();
            }
        }
        Ok(())
    }

    pub fn reload(&self) {
        let mut store = self.store.write().unwrap();
        if self.db_path.exists() {
            if let Ok(file) = File::open(&self.db_path) {
                let reader = BufReader::new(file);
                if let Ok(new_store) = serde_json::from_reader(reader) {
                    *store = new_store;
                    println!("Database reloaded from disk.");
                } else {
                    eprintln!("Failed to parse metadata.json during reload.");
                }
            } else {
                eprintln!("Failed to open metadata.json during reload.");
            }
        }
    }
}
