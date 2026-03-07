import pool from "../../config/database";
import type { CreateNewsInput, UpdateNewsInput, NewsVideo } from "./news.types";
import * as storage from "../../services/storage";

export const getAllNews = async (filters?: {
  status?: string;
  search?: string;
}): Promise<NewsVideo[]> => {
  let query = `SELECT n.*, CONCAT(e.firstname, ' ', e.lastname) as created_by_name
                 FROM news_videos n
                 LEFT JOIN employee e ON n.created_by = e.employee_id
                 WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.status && filters.status !== "all") {
    query += ` AND n.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.search) {
    query += ` AND (n.title ILIKE $${paramIndex} OR n.description ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  query += ` ORDER BY n.created_at DESC`;

  const result = await pool.query(query, params);

  return result.rows;
};

export const getPublishedNews = async (): Promise<NewsVideo[]> => {
  const result = await pool.query(
    `SELECT * FROM news_videos
         WHERE status = 'published'
         ORDER BY published_at DESC, created_at DESC
         LIMIT 50`,
  );
  return result.rows;
};

export const getNewsById = async (id: number): Promise<NewsVideo | null> => {
  const result = await pool.query(
    `SELECT
          n.*,
          CONCAT(e.firstname, ' ', e.lastname) as created_by_name
        FROM news_videos n
        LEFT JOIN employee e ON n.created_by = e.employee_id
        WHERE n.id = $1`,
    [id],
  );
  return result.rows[0] || null;
};

export const createNews = async (
  data: CreateNewsInput,
  createdBy: number,
): Promise<NewsVideo> => {
  const publishedAt = data.status === "published" ? new Date() : null;

  const result = await pool.query(
    `INSERT INTO news_videos 
      (title, description, video_url, thumbnail_url, category, status, created_by, published_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.title,
      data.description || null,
      data.video_url,
      data.thumbnail_url || null,
      data.category || "News",
      data.status || "draft",
      createdBy,
      publishedAt,
    ],
  );
  return result.rows[0];
};

export const updateNews = async (
  id: number,
  data: UpdateNewsInput,
): Promise<NewsVideo | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex}`);
    values.push(data.title);
    paramIndex++;
  }

  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex}`);
    values.push(data.description);
    paramIndex++;
  }

  if (data.video_url !== undefined) {
    fields.push(`video_url = $${paramIndex}`);
    values.push(data.video_url);
    paramIndex++;
  }

  if (data.thumbnail_url !== undefined) {
    fields.push(`thumbnail_url = $${paramIndex}`);
    values.push(data.thumbnail_url || null);
    paramIndex++;
  }

  if (data.category !== undefined) {
    fields.push(`category = $${paramIndex}`);
    values.push(data.category);
    paramIndex++;
  }

  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex}`);
    values.push(data.status);
    paramIndex++;

    if (data.status === "published") {
      fields.push(`published_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;
    }
  }

  fields.push(`updated_at = $${paramIndex}`);
  values.push(new Date());
  paramIndex++;

  if (fields.length === 0) return null;

  values.push(id);

  const query = `
    UPDATE news_videos
    SET ${fields.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

export const deleteNews = async (id: number): Promise<boolean> => {
  const result = await pool.query(
    "DELETE FROM news_videos WHERE id = $1 RETURNING id",
    [id],
  );
  return result.rowCount ? result.rowCount > 0 : false;
};

export const incrementViews = async (id: number): Promise<void> => {
  await pool.query(
    "UPDATE news_videos SET views_count = views_count + 1 WHERE id = $1",
    [id],
  );
};

export const deleteNewsFile = async (
  bucket: string,
  fileUrl: string,
): Promise<void> => {
  try {
    await storage.deleteFile(bucket, fileUrl);
  } catch (error) {
    console.error(
      `Error deleting file ${fileUrl} from bucket ${bucket}:`,
      error,
    );
  }
};
