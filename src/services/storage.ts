import pool from "../config/database";
import { supabase } from "../utils/supabase";
import { env } from "../config/env";
import path from "path";
import fs from "fs";
import logger from "../utils/logger";

export type StorageMode = "cloud" | "local";

const CACHE_TTL_MS = 60 * 1000;
let cache: { mode: StorageMode; at: number } | null = null;

export function clearStorageModeCache(): void {
  cache = null;
}

/** Same directory used for local uploads and for serving /uploads - use in app.ts for static middleware */
export function getUploadsDir(): string {
  if (env.UPLOADS_DIR) {
    return path.resolve(env.UPLOADS_DIR);
  }
  return path.join(process.cwd(), "uploads");
}

export async function getStorageMode(): Promise<StorageMode> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.mode;
  try {
    const row = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'storage_mode' LIMIT 1`,
    );
    const value = (row.rows[0]?.value ?? "cloud")
      .toString()
      .toLowerCase()
      .trim();
    const mode: StorageMode = value === "local" ? "local" : "cloud";
    cache = { mode, at: Date.now() };
    return mode;
  } catch (e) {
    logger.warn("getStorageMode fallback to cloud", { error: e });
    cache = { mode: "cloud", at: Date.now() };
    return "cloud";
  }
}

export async function upload(
  bucket: string,
  filePath: string,
  buffer: Buffer,
  options: { contentType?: string },
): Promise<{ path: string }> {
  const mode = await getStorageMode();
  if (mode === "cloud") {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: options.contentType,
        upsert: false,
      });
    if (error) throw error;
    return { path: data.path };
  }
  const uploadsDir = getUploadsDir();
  const fullPath = path.join(uploadsDir, bucket, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
  return { path: filePath };
}

function extractStoragePath(
  bucket: string,
  fileUrlOrPath: string,
): string | null {
  if (!fileUrlOrPath.startsWith("http")) return fileUrlOrPath;
  try {
    const url = new URL(fileUrlOrPath);
    const pathname = url.pathname;
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/object/public/${bucket}/`,
      `/object/sign/${bucket}/`,
    ];
    for (const marker of markers) {
      if (pathname.includes(marker)) return pathname.split(marker)[1] || null;
    }
  } catch {}
  return null;
}

function normalizeStoragePath(
  bucket: string,
  fileUrlOrPath: string | null,
): string | null {
  if (!fileUrlOrPath) return null;
  let p = fileUrlOrPath;
  // Handle double-bucket prefix (e.g. videos/videos/...) from old uploads
  // This can happen when old code included bucket prefix in the path before uploading
  if (p.startsWith(`${bucket}/${bucket}/`)) {
    // Keep the double path as-is - that's where the file actually is in Supabase
    return p;
  }
  // For single bucket prefix paths (e.g. videos/file.mp4), the file might be at videos/videos/file.mp4
  // Try the path as-is first, caller will handle fallback
  return p;
}

async function getSupabaseSignedOrPublicUrl(
  bucket: string,
  pathOrUrl: string,
): Promise<string> {
  const resolvedPath = normalizeStoragePath(
    bucket,
    extractStoragePath(bucket, pathOrUrl) ?? pathOrUrl,
  );
  if (!resolvedPath) return pathOrUrl;

  // Try to get signed URL with the path as-is
  let { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(resolvedPath, 60 * 10);
  if (!error && data?.signedUrl) return data.signedUrl;

  // If that fails and path has bucket prefix, try with double-bucket path (for old uploads)
  if (resolvedPath.startsWith(`${bucket}/`)) {
    // Path already has bucket prefix, Supabase file is at this location
    const { data: pub } = supabase.storage
      .from(bucket)
      .getPublicUrl(resolvedPath);
    return pub.publicUrl;
  }

  // Try public URL as fallback
  const { data: pub } = supabase.storage
    .from(bucket)
    .getPublicUrl(resolvedPath);
  return pub.publicUrl;
}

function tryLocalUrl(bucket: string, pathOrExtracted: string): string | null {
  const uploadsDir = getUploadsDir();
  let clean = pathOrExtracted.replace(/^\/+/, "").replace(/\\/g, "/");

  // Try two locations to support both old (double-bucket) and new (single-bucket) paths

  // First: Try with bucket prefix stripped (for new uploads without bucket prefix in DB)
  let cleanedPath = clean;
  if (clean.startsWith(`${bucket}/`)) {
    cleanedPath = clean.substring(bucket.length + 1);
  }

  let localPath = path.join(uploadsDir, bucket, cleanedPath);
  if (fs.existsSync(localPath)) {
    if (env.NODE_ENV === "development") {
      return `/uploads/${bucket}/${cleanedPath}`;
    }
    const base = env.UPLOADS_BASE_URL.replace(/\/$/, "");
    return `${base}/uploads/${bucket}/${cleanedPath}`;
  }

  // Second: Try with original path (for old uploads with bucket prefix in DB, resulting in double-bucket on disk)
  if (cleanedPath !== clean) {
    localPath = path.join(uploadsDir, bucket, clean);
    if (fs.existsSync(localPath)) {
      if (env.NODE_ENV === "development") {
        return `/uploads/${bucket}/${clean}`;
      }
      const base = env.UPLOADS_BASE_URL.replace(/\/$/, "");
      return `${base}/uploads/${bucket}/${clean}`;
    }
  }

  return null;
}

export async function resolveUrl(
  bucket: string,
  pathOrUrl: string,
): Promise<string> {
  if (!pathOrUrl) return pathOrUrl;

  // If it's an external URL (YouTube, Vimeo, etc.), return as-is without processing
  if (pathOrUrl.startsWith("http")) {
    const isStorageUrl =
      pathOrUrl.includes("/storage/v1/object/") ||
      pathOrUrl.includes("/object/public/") ||
      pathOrUrl.includes("/object/sign/") ||
      pathOrUrl.includes("localhost") ||
      pathOrUrl.includes("127.0.0.1");

    if (!isStorageUrl) {
      // External URL (YouTube, Vimeo, etc.) - return as-is
      return pathOrUrl;
    }
  }

  const pathToTry = pathOrUrl.startsWith("http")
    ? (extractStoragePath(bucket, pathOrUrl) ?? pathOrUrl)
    : pathOrUrl;
  if (!pathToTry) return pathOrUrl;

  // Always prefer local file when it exists
  const localUrl = tryLocalUrl(bucket, pathToTry);
  if (localUrl) return localUrl;

  // File not found locally - try Supabase as fallback
  // This allows retrieving cloud-stored files even when storage mode is "local"
  try {
    if (pathOrUrl.startsWith("http")) {
      const extracted = extractStoragePath(bucket, pathOrUrl);
      if (extracted)
        return await getSupabaseSignedOrPublicUrl(bucket, pathOrUrl);
      return pathOrUrl;
    }
    // Try to get from Supabase
    return await getSupabaseSignedOrPublicUrl(bucket, pathToTry);
  } catch (error) {
    // Supabase failed - return local URL as last resort (will 404 if not found)
    const mode = await getStorageMode();
    const clean = pathToTry.replace(/^\/+/, "").replace(/\\/g, "/");
    if (env.NODE_ENV === "development") {
      return `/uploads/${bucket}/${clean}`;
    }
    const base = env.UPLOADS_BASE_URL.replace(/\/$/, "");
    return `${base}/uploads/${bucket}/${clean}`;
  }
}
