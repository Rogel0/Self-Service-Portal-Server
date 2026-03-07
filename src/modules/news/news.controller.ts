import { Request, Response } from "express";
import * as newsService from "./news.service";
import * as storage from "../../services/storage";
import path from "path";

export const getAllNews = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;

    const news = await newsService.getAllNews({
      status: status as string,
      search: search as string,
    });

    res.json({ success: true, data: news });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ success: false, message: "Failed to fetch news" });
  }
};

export const getPublishedNews = async (req: Request, res: Response) => {
  try {
    const news = await newsService.getPublishedNews();
    res.json({ success: true, data: news });
  } catch (error) {
    console.error("Error fetching published news:", error);
    res.status(500).json({ success: false, message: "Failed to fetch news" });
  }
};

export const getNewsById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const news = await newsService.getNewsById(id);

    if (!news) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    await newsService.incrementViews(id);
  } catch (error) {
    console.error("Error fetching news by ID:", error);
    res.status(500).json({ success: false, message: "Failed to fetch news" });
  }
};

export const createNews = async (req: Request, res: Response) => {
  try {
    const employeeId = (req as any).employee?.employee_id;

    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const data = { ...req.body };

    // Handle uploaded video file - upload to Supabase
    if (files?.video?.[0]) {
      const videoFile = files.video[0];
      const ext = path.extname(videoFile.originalname);
      const uniqueName = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { path: videoPath } = await storage.upload(
        "news-videos",
        uniqueName,
        videoFile.buffer,
        { contentType: videoFile.mimetype },
      );

      data.video_url = await storage.getPublicUrl("news-videos", videoPath);
    }

    // Handle uploaded thumbnail file - upload to Supabase
    if (files?.thumbnail?.[0]) {
      const thumbFile = files.thumbnail[0];
      const ext = path.extname(thumbFile.originalname);
      const uniqueName = `thumb-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { path: thumbPath } = await storage.upload(
        "news-thumbnails",
        uniqueName,
        thumbFile.buffer,
        { contentType: thumbFile.mimetype },
      );

      data.thumbnail_url = await storage.getFileUrl(
        "news-thumbnails",
        thumbPath,
      );
    }

    // Validate required fields
    if (!data.title || (!data.video_url && !files?.video)) {
      return res.status(400).json({
        success: false,
        message: "Title and video are required",
      });
    }

    const news = await newsService.createNews(data, employeeId);

    res.status(201).json({
      success: true,
      message: "News created successfully",
      data: news,
    });
  } catch (error) {
    console.error("Error creating news:", error);
    res.status(500).json({ success: false, message: "Failed to create news" });
  }
};

export const updateNews = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    // Get existing news to delete old files if needed
    const existingNews = await newsService.getNewsById(id);
    if (!existingNews) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const data = { ...req.body };

    // Handle uploaded video file - upload to Supabase
    if (files?.video?.[0]) {
      const videoFile = files.video[0];
      const ext = path.extname(videoFile.originalname);
      const uniqueName = `video-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { path: videoPath } = await storage.upload(
        "news-videos",
        uniqueName,
        videoFile.buffer,
        { contentType: videoFile.mimetype },
      );

      data.video_url = await storage.getPublicUrl("news-videos", videoPath);

      // Delete old video file if it exists in storage
      if (
        existingNews.video_url &&
        !existingNews.video_url.startsWith("http")
      ) {
        await newsService.deleteNewsFile("news-videos", existingNews.video_url);
      }
    }

    // Handle uploaded thumbnail file - upload to Supabase
    if (files?.thumbnail?.[0]) {
      const thumbFile = files.thumbnail[0];
      const ext = path.extname(thumbFile.originalname);
      const uniqueName = `thumb-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { path: thumbPath } = await storage.upload(
        "news-thumbnails",
        uniqueName,
        thumbFile.buffer,
        { contentType: thumbFile.mimetype },
      );

      data.thumbnail_url = await storage.getFileUrl(
        "news-thumbnails",
        thumbPath,
      );

      // Delete old thumbnail file if it exists in storage
      if (
        existingNews.thumbnail_url &&
        !existingNews.thumbnail_url.startsWith("http")
      ) {
        await newsService.deleteNewsFile(
          "news-thumbnails",
          existingNews.thumbnail_url,
        );
      }
    }

    const news = await newsService.updateNews(id, data);

    res.json({
      success: true,
      message: "News updated successfully",
      data: news,
    });
  } catch (error) {
    console.error("Error updating news:", error);
    res.status(500).json({ success: false, message: "Failed to update news" });
  }
};

export const deleteNews = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    // Get news to delete associated files
    const news = await newsService.getNewsById(id);
    if (!news) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    // Delete uploaded files if they exist (not external URLs)
    if (news.video_url && !news.video_url.startsWith("http")) {
      await newsService.deleteNewsFile("news-videos", news.video_url);
    }
    if (news.thumbnail_url && !news.thumbnail_url.startsWith("http")) {
      await newsService.deleteNewsFile("news-thumbnails", news.thumbnail_url);
    }

    // Delete database record
    const success = await newsService.deleteNews(id);

    if (!success) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    res.json({ success: true, message: "News deleted successfully" });
  } catch (error) {
    console.error("Error deleting news:", error);
    res.status(500).json({ success: false, message: "Failed to delete news" });
  }
};

export const publishNews = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const news = await newsService.updateNews(id, { status: "published" });

    if (!news) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    res.json({
      success: true,
      message: "News published successfully",
      data: news,
    });
  } catch (error) {
    console.error("Error publishing news:", error);
    res.status(500).json({ success: false, message: "Failed to publish news" });
  }
};

export const migrateNewsUrls = async (req: Request, res: Response) => {
  try {
    const allNews = await newsService.getAllNews({});
    let updated = 0;

    for (const news of allNews) {
      let needsUpdate = false;
      const updates: any = {};

      // Update video URL if it's a Supabase storage URL
      if (news.video_url && news.video_url.includes("/storage/v1/object/")) {
        const newUrl = await storage.getPublicUrl("news-videos", news.video_url);
        if (newUrl !== news.video_url) {
          updates.video_url = newUrl;
          needsUpdate = true;
        }
      }

      // Update thumbnail URL if it's a Supabase storage URL
      if (news.thumbnail_url && news.thumbnail_url.includes("/storage/v1/object/")) {
        const newUrl = await storage.getPublicUrl("news-thumbnails", news.thumbnail_url);
        if (newUrl !== news.thumbnail_url) {
          updates.thumbnail_url = newUrl;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await newsService.updateNews(news.id, updates);
        updated++;
      }
    }

    res.json({
      success: true,
      message: `Migration complete. Updated ${updated} news records.`,
      data: { updated, total: allNews.length },
    });
  } catch (error) {
    console.error("Error migrating news URLs:", error);
    res.status(500).json({ success: false, message: "Failed to migrate news URLs" });
  }
};
