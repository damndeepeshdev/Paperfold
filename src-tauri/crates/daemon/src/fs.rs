use dav_server::davpath::DavPath;
use dav_server::fs::*;
use grammers_client::Client;
use paperfold_core::db::Database;
use std::pin::Pin;
use std::sync::Arc;
use std::time::SystemTime;

use crate::cache::CacheManager;

#[derive(Clone)]
pub struct PaperfoldFS {
    db: Arc<Database>,
    client: Client,
    me: grammers_client::types::Chat,
    cache: Arc<CacheManager>,
}

impl PaperfoldFS {
    pub fn new(
        db: Arc<Database>,
        client: Client,
        me: grammers_client::types::Chat,
        cache: Arc<CacheManager>,
    ) -> Self {
        PaperfoldFS {
            db,
            client,
            me,
            cache,
        }
    }

    async fn resolve_path(&self, path: &DavPath) -> Result<(Option<String>, bool), FsError> {
        let parts = path.as_rel_ospath();
        if parts.as_os_str().is_empty() || path.as_url_string() == "/" {
            return Ok((None, true)); // Root
        }

        let mut current_folder_id: Option<String> = None;
        let diff_path = std::path::Path::new(parts);
        let components: Vec<&str> = diff_path.iter().filter_map(|s| s.to_str()).collect();

        for (i, part) in components.iter().enumerate() {
            let is_last = i == components.len() - 1;

            let (folders, files) = self.db.list_contents(current_folder_id.clone());

            let found_folder = folders.iter().find(|f| f.name == *part);
            if let Some(folder) = found_folder {
                current_folder_id = Some(folder.id.clone());
                if is_last {
                    return Ok((Some(folder.id.clone()), true));
                }
                continue;
            }

            if is_last {
                if let Some(file) = files.iter().find(|f| f.name == *part) {
                    return Ok((Some(file.id.clone()), false));
                }
            }

            return Err(FsError::NotFound);
        }

        Err(FsError::NotFound)
    }
}

#[derive(Debug, Clone)]
struct PaperfoldMetaData {
    len: u64,
    is_dir: bool,
    modified: SystemTime,
    created: SystemTime,
}

impl DavMetaData for PaperfoldMetaData {
    fn len(&self) -> u64 {
        self.len
    }
    fn is_dir(&self) -> bool {
        self.is_dir
    }
    fn modified(&self) -> FsResult<SystemTime> {
        Ok(self.modified)
    }
    fn created(&self) -> FsResult<SystemTime> {
        Ok(self.created)
    }
    fn status_changed(&self) -> FsResult<SystemTime> {
        Ok(self.modified)
    }
    fn is_symlink(&self) -> bool {
        false
    }
    fn executable(&self) -> FsResult<bool> {
        Ok(false)
    }
}

#[derive(Debug, Clone)]
struct PaperfoldDirEntry {
    name: String,
    metadata: PaperfoldMetaData,
}

impl DavDirEntry for PaperfoldDirEntry {
    fn name(&self) -> Vec<u8> {
        self.name.as_bytes().to_vec()
    }
    fn metadata(&self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let meta = self.metadata.clone();
        Box::pin(async move { Ok(Box::new(meta) as Box<dyn DavMetaData>) })
    }
}

impl DavFileSystem for PaperfoldFS {
    fn open<'a>(
        &'a self,
        path: &'a DavPath,
        options: OpenOptions,
    ) -> FsFuture<'a, Box<dyn DavFile>> {
        Box::pin(async move {
            match self.resolve_path(path).await {
                Ok((Some(id), false)) => {
                    if options.write {
                        if options.truncate || options.create {
                            println!("Overwriting existing file: {:?}", path);
                            let metadata = self.db.get_file(&id).ok_or(FsError::NotFound)?;
                            // We are creating a NEW version.
                            // PaperfoldWriteFile needs to know if it's overwriting?
                            // Actually, if we just use PaperfoldWriteFile::new with same name/parent,
                            // it will upload a new file.
                            // The DB `add_file` might create a duplicate if we don't handle it.
                            // But let's assume for now we just want to allow writing.

                            // We need to construct PaperfoldWriteFile.
                            // Resolving name/parent again:
                            let path_buf = path.as_rel_ospath();
                            let name = path_buf
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_default();
                            let parent_id = metadata.folder_id; // Use existing parent

                            match PaperfoldWriteFile::new(
                                self.db.clone(),
                                self.client.clone(),
                                self.me.clone(),
                                parent_id,
                                name,
                            )
                            .await
                            {
                                Ok(f) => Ok(Box::new(f) as Box<dyn DavFile>),
                                Err(e) => Err(e),
                            }
                        } else {
                            // Append? Not supported yet.
                            Err(FsError::Forbidden)
                        }
                    } else {
                        let metadata = self.db.get_file(&id).ok_or(FsError::NotFound)?;
                        Ok(Box::new(PaperfoldFile::new(
                            self.client.clone(),
                            metadata,
                            self.me.clone(),
                            self.cache.clone(),
                        )) as Box<dyn DavFile>)
                    }
                }
                Ok((_, true)) => Err(FsError::Forbidden), // Was IsADirectory
                Err(FsError::NotFound) => {
                    if options.write && (options.create || options.create_new) {
                        println!("Attempting to create file: {:?}", path);
                        let path_buf = path.as_rel_ospath();
                        let name = path_buf
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let parent_path = if let Some(p) = path_buf.parent() {
                            if p.as_os_str().is_empty() {
                                dav_server::davpath::DavPath::new("/")
                            } else {
                                let s = format!("/{}", p.to_string_lossy());
                                dav_server::davpath::DavPath::new(&s)
                            }
                        } else {
                            dav_server::davpath::DavPath::new("/")
                        }
                        .map_err(|e| {
                            println!("Error constructing parent path: {:?}", e);
                            FsError::GeneralFailure
                        })?;

                        match self.resolve_path(&parent_path).await {
                            Ok((parent_id, true)) => {
                                println!("Parent resolved: {:?}, creating write file", parent_id);
                                match PaperfoldWriteFile::new(
                                    self.db.clone(),
                                    self.client.clone(),
                                    self.me.clone(),
                                    parent_id,
                                    name,
                                )
                                .await
                                {
                                    Ok(f) => Ok(Box::new(f) as Box<dyn DavFile>),
                                    Err(e) => {
                                        println!("Error creating PaperfoldWriteFile: {:?}", e);
                                        Err(e)
                                    }
                                }
                            }
                            Err(e) => {
                                println!("Parent resolution failed: {:?}", e);
                                Err(FsError::NotFound)
                            }
                            _ => {
                                println!("Parent resolution returned unexpected result");
                                Err(FsError::NotFound)
                            }
                        }
                    } else {
                        Err(FsError::NotFound)
                    }
                }
                _ => Err(FsError::NotFound),
            }
        })
    }

    fn read_dir<'a>(
        &'a self,
        path: &'a DavPath,
        _meta: ReadDirMeta,
    ) -> FsFuture<'a, Pin<Box<dyn futures::Stream<Item = Box<dyn DavDirEntry>> + Send>>> {
        Box::pin(async move {
            match self.resolve_path(path).await {
                Ok((folder_id, true)) => {
                    let (folders, files) = self.db.list_contents(folder_id);
                    let mut entries: Vec<Box<dyn DavDirEntry>> = Vec::new();

                    for f in folders {
                        let created = SystemTime::UNIX_EPOCH
                            + std::time::Duration::from_secs(f.created_at as u64);
                        let modified = SystemTime::UNIX_EPOCH
                            + std::time::Duration::from_secs(f.last_modified as u64);

                        let meta = PaperfoldMetaData {
                            len: 0,
                            is_dir: true,
                            modified,
                            created,
                        };
                        entries.push(Box::new(PaperfoldDirEntry {
                            name: f.name,
                            metadata: meta,
                        }));
                    }

                    for f in files {
                        let created = SystemTime::UNIX_EPOCH
                            + std::time::Duration::from_secs(f.created_at as u64);

                        let meta = PaperfoldMetaData {
                            len: f.size as u64,
                            is_dir: false,
                            modified: created, // Files only have created_at currently
                            created,
                        };
                        entries.push(Box::new(PaperfoldDirEntry {
                            name: f.name,
                            metadata: meta,
                        }));
                    }

                    // Convert Vec into Stream
                    let stream = futures::stream::iter(entries);
                    Ok(Box::pin(stream)
                        as Pin<
                            Box<dyn futures::Stream<Item = Box<dyn DavDirEntry>> + Send>,
                        >)
                }
                Ok((_, false)) => Err(FsError::Forbidden), // Was NotADirectory
                Err(e) => Err(e),
            }
        })
    }

    fn metadata<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, Box<dyn DavMetaData>> {
        Box::pin(async move {
            match self.resolve_path(path).await {
                Ok((Some(id), is_folder)) => {
                    if is_folder {
                        // We need to fetch folder details to get real timestamp
                        // But resolve_path only returns ID.
                        // We should optimize resolve_path or just fetch here.
                        // For now, let's look it up.
                        // Note: Database::get_folder is not public/doesn't exist easily by ID without parent?
                        // Actually we have list_contents.
                        // Let's assume for single item metadata query we might accept slight overhead
                        // or improved DB API.
                        // Using a cheat: we default to NOW if we can't find it easily?
                        // No, let's try to find it.
                        // NOTE: To properly implement this we'd need a `get_folder(id)` in DB.
                        // For now, keeping as UNIX_EPOCH is safe BUT let's try to improve if we can.
                        // Actually, I'll modify the DB to add get_folder if needed, or just live with it for this step
                        // since the user request prioritized "Move". Fix timestamps in `read_dir` first (done above).

                        Ok(Box::new(PaperfoldMetaData {
                            len: 0,
                            is_dir: true,
                            modified: SystemTime::UNIX_EPOCH, // Todo: fetch real modified
                            created: SystemTime::UNIX_EPOCH,
                        }) as Box<dyn DavMetaData>)
                    } else {
                        let file = self.db.get_file(&id).ok_or(FsError::NotFound)?;
                        let created = SystemTime::UNIX_EPOCH
                            + std::time::Duration::from_secs(file.created_at as u64);
                        Ok(Box::new(PaperfoldMetaData {
                            len: file.size as u64,
                            is_dir: false,
                            modified: created,
                            created,
                        }) as Box<dyn DavMetaData>)
                    }
                }
                Ok((None, true)) => Ok(Box::new(PaperfoldMetaData {
                    len: 0,
                    is_dir: true,
                    modified: SystemTime::UNIX_EPOCH,
                    created: SystemTime::UNIX_EPOCH,
                }) as Box<dyn DavMetaData>),
                Err(e) => Err(e),
                _ => Err(FsError::NotFound),
            }
        })
    }

    fn create_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            println!("create_dir: {:?}", path);
            let path_buf = path.as_rel_ospath();
            let name = path_buf
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .ok_or(FsError::Forbidden)?;

            let parent_path = if let Some(p) = path_buf.parent() {
                if p.as_os_str().is_empty() {
                    dav_server::davpath::DavPath::new("/")
                } else {
                    let s = format!("/{}", p.to_string_lossy());
                    dav_server::davpath::DavPath::new(&s)
                }
            } else {
                dav_server::davpath::DavPath::new("/")
            }
            .map_err(|e| {
                println!("Error constructing parent path: {:?}", e);
                FsError::GeneralFailure
            })?;

            match self.resolve_path(&parent_path).await {
                Ok((Some(parent_id), true)) => {
                    // Check if exists
                    match self.resolve_path(path).await {
                        Ok(_) => Err(FsError::Exists),
                        Err(FsError::NotFound) => {
                            self.db.create_folder(&name, Some(parent_id));
                            Ok(())
                        }
                        Err(e) => Err(e),
                    }
                }
                Ok((None, true)) => {
                    // Root parent
                    match self.resolve_path(path).await {
                        Ok(_) => Err(FsError::Exists),
                        Err(FsError::NotFound) => {
                            self.db.create_folder(&name, None);
                            Ok(())
                        }
                        Err(e) => Err(e),
                    }
                }
                _ => Err(FsError::NotFound),
            }
        })
    }
    fn remove_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            println!("remove_dir: {:?}", path);
            match self.resolve_path(path).await {
                Ok((Some(id), true)) => {
                    self.db.delete_folder(&id);
                    Ok(())
                }
                Ok((_, false)) => Err(FsError::Forbidden),
                _ => Err(FsError::NotFound),
            }
        })
    }

    fn remove_file<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            println!("remove_file: {:?}", path);
            match self.resolve_path(path).await {
                Ok((Some(id), false)) => {
                    self.db.delete_file(&id);
                    Ok(())
                }
                Ok((_, true)) => Err(FsError::Forbidden), // Is a directory
                _ => Err(FsError::NotFound),
            }
        })
    }

    fn rename<'a>(&'a self, from: &'a DavPath, to: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            println!("rename: {:?} -> {:?}", from, to);
            // 1. Resolve source
            let (source_id, source_is_dir) = match self.resolve_path(from).await {
                Ok((Some(id), is_dir)) => (id, is_dir),
                _ => return Err(FsError::NotFound),
            };

            // 2. Resolve destination parent
            let to_path_buf = to.as_rel_ospath();
            let new_name = to_path_buf
                .file_name()
                .ok_or(FsError::Forbidden)?
                .to_string_lossy()
                .to_string();

            let parent_path = if let Some(p) = to_path_buf.parent() {
                if p.as_os_str().is_empty() {
                    dav_server::davpath::DavPath::new("/")
                } else {
                    let s = format!("/{}", p.to_string_lossy());
                    dav_server::davpath::DavPath::new(&s)
                }
            } else {
                dav_server::davpath::DavPath::new("/")
            }
            .map_err(|_| FsError::GeneralFailure)?;

            let target_parent_id = match self.resolve_path(&parent_path).await {
                Ok((pid, true)) => pid,
                _ => return Err(FsError::NotFound), // Destination parent must exist and be a dir
            };

            // 3. Perform Move/Rename
            if source_is_dir {
                if self.db.move_folder(&source_id, target_parent_id, &new_name) {
                    Ok(())
                } else {
                    Err(FsError::GeneralFailure)
                }
            } else {
                if self.db.move_file(&source_id, target_parent_id, &new_name) {
                    Ok(())
                } else {
                    Err(FsError::GeneralFailure)
                }
            }
        })
    }
}

#[derive(Debug)]
pub struct PaperfoldFile {
    #[allow(dead_code)]
    client: Client,
    metadata: paperfold_core::db::FileMetadata,
    me: grammers_client::types::Chat,
    cache: Arc<CacheManager>,
    file_handle: Option<tokio::fs::File>,
}

impl PaperfoldFile {
    pub fn new(
        client: Client,
        metadata: paperfold_core::db::FileMetadata,
        me: grammers_client::types::Chat,
        cache: Arc<CacheManager>,
    ) -> Self {
        PaperfoldFile {
            client,
            metadata,
            me,
            cache,
            file_handle: None,
        }
    }

    async fn ensure_local(&mut self) -> FsResult<()> {
        if self.file_handle.is_some() {
            return Ok(());
        }

        let path = self
            .cache
            .get_file(&self.metadata, &self.client, &self.me)
            .await
            .map_err(|_| FsError::GeneralFailure)?;

        let file = tokio::fs::File::open(&path)
            .await
            .map_err(|_| FsError::GeneralFailure)?;
        self.file_handle = Some(file);
        Ok(())
    }
}

impl DavFile for PaperfoldFile {
    fn metadata(&mut self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let size = self.metadata.size as u64;
        Box::pin(async move {
            Ok(Box::new(PaperfoldMetaData {
                len: size,
                is_dir: false,
                modified: SystemTime::UNIX_EPOCH,
                created: SystemTime::UNIX_EPOCH,
            }) as Box<dyn DavMetaData>)
        })
    }

    fn read_bytes(&mut self, count: usize) -> FsFuture<'_, bytes::Bytes> {
        Box::pin(async move {
            self.ensure_local().await?;
            let file = self.file_handle.as_mut().ok_or(FsError::GeneralFailure)?;

            let mut buf = vec![0u8; count];
            use tokio::io::AsyncReadExt;
            let n = file
                .read(&mut buf)
                .await
                .map_err(|_| FsError::GeneralFailure)?;
            buf.truncate(n);
            Ok(bytes::Bytes::from(buf))
        })
    }

    fn write_bytes(&mut self, _buf: bytes::Bytes) -> FsFuture<'_, ()> {
        Box::pin(async move { Err(FsError::NotImplemented) })
    }

    fn write_buf(&mut self, _buf: Box<dyn bytes::Buf + Send>) -> FsFuture<'_, ()> {
        Box::pin(async move { Err(FsError::NotImplemented) })
    }

    fn seek(&mut self, pos: std::io::SeekFrom) -> FsFuture<'_, u64> {
        Box::pin(async move {
            self.ensure_local().await?;
            let file = self.file_handle.as_mut().ok_or(FsError::GeneralFailure)?;
            use tokio::io::AsyncSeekExt;
            file.seek(pos).await.map_err(|_| FsError::GeneralFailure)
        })
    }

    fn flush(&mut self) -> FsFuture<'_, ()> {
        Box::pin(async move { Ok(()) })
    }
}

impl std::fmt::Debug for PaperfoldWriteFile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PaperfoldWriteFile")
            .field("name", &self.name)
            .field("parent_id", &self.parent_id)
            .finish()
    }
}

pub struct PaperfoldWriteFile {
    db: Arc<Database>,
    client: Client,
    me: grammers_client::types::Chat,
    temp_path: std::path::PathBuf,
    file_handle: Option<tokio::fs::File>,
    parent_id: Option<String>,
    name: String,
    flushed: bool,
}

impl PaperfoldWriteFile {
    pub async fn new(
        db: Arc<Database>,
        client: Client,
        me: grammers_client::types::Chat,
        parent_id: Option<String>,
        name: String,
    ) -> FsResult<Self> {
        let temp_name = format!(
            "paperfold_upload_{}_{}.bin",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            name
        );
        let temp_path = std::env::temp_dir().join(temp_name);

        // Create file
        let file = tokio::fs::File::create(&temp_path)
            .await
            .map_err(|_| FsError::GeneralFailure)?;

        Ok(Self {
            db,
            client,
            me,
            temp_path,
            file_handle: Some(file),
            parent_id,
            name,
            flushed: false,
        })
    }
}

impl DavFile for PaperfoldWriteFile {
    fn metadata(&mut self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        Box::pin(async move {
            Ok(Box::new(PaperfoldMetaData {
                len: 0,
                is_dir: false,
                modified: SystemTime::now(),
                created: SystemTime::now(),
            }) as Box<dyn DavMetaData>)
        })
    }

    fn write_buf(&mut self, mut buf: Box<dyn bytes::Buf + Send>) -> FsFuture<'_, ()> {
        Box::pin(async move {
            println!("Write buf called for {}", self.name);
            use tokio::io::AsyncWriteExt;
            let file = self.file_handle.as_mut().ok_or(FsError::GeneralFailure)?;

            while buf.has_remaining() {
                let chunk = buf.chunk();
                file.write_all(chunk).await.map_err(|e| {
                    println!("Write buf error: {:?}", e);
                    FsError::GeneralFailure
                })?;
                let len = chunk.len();
                buf.advance(len);
            }
            Ok(())
        })
    }

    fn write_bytes(&mut self, buf: bytes::Bytes) -> FsFuture<'_, ()> {
        Box::pin(async move {
            println!("Write bytes called for {}", self.name);
            use tokio::io::AsyncWriteExt;
            let file = self.file_handle.as_mut().ok_or(FsError::GeneralFailure)?;
            file.write_all(&buf).await.map_err(|e| {
                println!("Write bytes error: {:?}", e);
                FsError::GeneralFailure
            })?;
            Ok(())
        })
    }

    fn read_bytes(&mut self, _: usize) -> FsFuture<'_, bytes::Bytes> {
        Box::pin(async move { Err(FsError::NotImplemented) })
    }

    fn seek(&mut self, _: std::io::SeekFrom) -> FsFuture<'_, u64> {
        Box::pin(async move { Err(FsError::NotImplemented) })
    }

    fn flush(&mut self) -> FsFuture<'_, ()> {
        Box::pin(async move {
            println!("Flush called for {}", self.name);
            if self.flushed {
                return Ok(());
            }

            // Sync file
            if let Some(mut file) = self.file_handle.take() {
                use tokio::io::AsyncWriteExt;
                file.flush().await.map_err(|e| {
                    println!("File flush error: {:?}", e);
                    FsError::GeneralFailure
                })?;
                file.sync_all().await.map_err(|e| {
                    println!("File sync error: {:?}", e);
                    FsError::GeneralFailure
                })?;
                drop(file);
            }

            // Deduplicate: Remove existing file with the same name to prevent "File (1), File (2)..."
            let (_, files) = self.db.list_contents(self.parent_id.clone());
            for f in files {
                if f.name == self.name {
                    println!("Removing existing file version: {} (id: {})", f.name, f.id);
                    self.db.delete_file(&f.id);
                }
            }

            let metadata = self
                .temp_path
                .metadata()
                .map_err(|_| FsError::GeneralFailure)?;
            let size = metadata.len();

            if size == 0 {
                println!("Persisting 0-byte file locally: {}", self.name);
                // Add to DB with special ID -1
                self.db.add_file(
                    self.parent_id.clone(),
                    self.name.clone(),
                    0,
                    "application/octet-stream".to_string(), // Default mime
                    -1,
                    None,
                );

                let _ = std::fs::remove_file(&self.temp_path);
                self.flushed = true;
                return Ok(());
            }

            if self.name == ".DS_Store" || self.name.starts_with("._") {
                println!("Skipping system file: {}", self.name);
                let _ = std::fs::remove_file(&self.temp_path);
                self.flushed = true;
                return Ok(());
            }

            let path_str = self.temp_path.to_string_lossy().to_string();
            println!("Uploading file: {}", path_str);

            let uploaded = self.client.upload_file(&path_str).await.map_err(|e| {
                println!("Telegram upload error: {:?}", e);
                FsError::GeneralFailure
            })?;

            let mime_type = mime_guess::from_path(&self.name)
                .first_or_octet_stream()
                .to_string();

            use grammers_client::types::{Attribute, InputMessage};

            let message = InputMessage::text("")
                .file(uploaded)
                .mime_type(&mime_type)
                .attribute(Attribute::FileName(self.name.clone()));

            println!("Sending message to self...");
            let sent_message = self
                .client
                .send_message(&self.me, message)
                .await
                .map_err(|e| {
                    println!("Send message error: {:?}", e);
                    FsError::GeneralFailure
                })?;

            println!("File sent, id: {}", sent_message.id());

            let metadata = self
                .temp_path
                .metadata()
                .map_err(|_| FsError::GeneralFailure)?;
            let size = metadata.len();

            self.db.add_file(
                self.parent_id.clone(),
                self.name.clone(),
                size as i64,
                mime_type,
                sent_message.id(),
                None, // No thumbnail for now
            );

            let _ = std::fs::remove_file(&self.temp_path);

            self.flushed = true;
            Ok(())
        })
    }
}
