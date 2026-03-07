export interface NewsVideo {
  id: number;
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url: string;
  category: string;
  status: "draft" | "published" | "archived";
  views_count: number;
  created_by: number;
  created_by_name?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNewsInput {
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  category?: string;
  status?: "draft" | "published" | "archived";
}

export interface UpdateNewsInput {
  title?: string;
  description?: string;
  video_url?: string;
  thumbnail_url?: string;
  category?: string;
  status?: "draft" | "published" | "archived";
}
