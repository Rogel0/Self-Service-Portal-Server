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
            `SELECT value FROM app_settings WHERE key = 'storage_mode' LIMIT 1`
        );
        const value = (row.rows[0]?.value ?? "cloud").toString().toLowerCase().trim();
        const mode: StorageMode = value === "local" ? "local" : "cloud";
        cache = { mode, at: Date.now() }
        return mode;
    } catch (e) {
        logger.warn("getStorageMode fallback to cloud", { error: e });
        cache = { mode: "cloud", at: Date.now() }
        return "cloud";
    }
}

export async function upload(
    bucket: string,
    filePath: string,
    buffer: Buffer,
    options: { contentType?: string }
): Promise<{ path: string }> {
    const mode = await getStorageMode();
    if (mode === "cloud") {
        const { data, error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
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

function extractStoragePath(bucket: string, fileUrlOrPath: string): string | null {
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
    } catch {

    }
    return null;
}

function normalizeStoragePath(bucket: string, fileUrlOrPath: string | null): string | null {
    if (!fileUrlOrPath) return null;
    let p = fileUrlOrPath;
    // Only strip duplicated bucket prefix (e.g. gallery/gallery/...); stored paths like gallery/machine_1/file.jpg must stay as-is for Supabase
    if (p.startsWith(`${bucket}/${bucket}/`)) p = p.slice(bucket.length + 1);
    return p;
}

async function getSupabaseSignedOrPublicUrl(bucket: string, pathOrUrl: string): Promise<string> {
    const resolvedPath = normalizeStoragePath(
        bucket,
        extractStoragePath(bucket, pathOrUrl) ?? pathOrUrl
    );
    if (!resolvedPath) return pathOrUrl;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(resolvedPath, 60 * 10);
    if (!error && data?.signedUrl) return data.signedUrl;
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(resolvedPath);
    return pub.publicUrl;
}

function tryLocalUrl(bucket: string, pathOrExtracted: string): string | null {
    const uploadsDir = getUploadsDir();
    const clean = pathOrExtracted.replace(/^\/+/, "").replace(/\\/g, "/");
    const localPath = path.join(uploadsDir, bucket, clean);
    if (fs.existsSync(localPath)) {
        // In development, return relative URL so the client (e.g. localhost:5173) requests same-origin and Vite proxy can forward to API server
        if (env.NODE_ENV === "development") {
            return `/uploads/${bucket}/${clean}`;
        }
        const base = env.UPLOADS_BASE_URL.replace(/\/$/, "");
        return `${base}/uploads/${bucket}/${clean}`;
    }
    return null;
}

export async function resolveUrl(bucket: string, pathOrUrl: string): Promise<string> {
    if (!pathOrUrl) return pathOrUrl;

    const pathToTry = pathOrUrl.startsWith("http")
        ? (extractStoragePath(bucket, pathOrUrl) ?? pathOrUrl)
        : pathOrUrl;
    if (!pathToTry) return pathOrUrl;

    // Always prefer local file when it exists (avoids Supabase "Bucket not found" when files are on disk)
    const localUrl = tryLocalUrl(bucket, pathToTry);
    if (localUrl) return localUrl;

    const mode = await getStorageMode();

    if (mode === "local") {
        // Local mode but file not on disk: still return local URL so client hits our server (404) not Supabase
        const clean = pathToTry.replace(/^\/+/, "").replace(/\\/g, "/");
        if (env.NODE_ENV === "development") {
            return `/uploads/${bucket}/${clean}`;
        }
        const base = env.UPLOADS_BASE_URL.replace(/\/$/, "");
        return `${base}/uploads/${bucket}/${clean}`;
    }

    // Cloud mode, file not local: use Supabase (may 400 if bucket doesn't exist)
    if (pathOrUrl.startsWith("http")) {
        const extracted = extractStoragePath(bucket, pathOrUrl);
        if (extracted) return getSupabaseSignedOrPublicUrl(bucket, pathOrUrl);
        return pathOrUrl;
    }
    return getSupabaseSignedOrPublicUrl(bucket, pathOrUrl);
}