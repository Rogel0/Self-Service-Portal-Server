import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";

export function multerErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      // Access limit property safely (it exists at runtime but not in TypeScript types)
      const limit = (err as any).limit as number | undefined;
      const limitMB = limit ? Math.round(limit / 1024 / 1024) : 50; // Default to 50MB (Supabase limit) if limit not available
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum file size is ${limitMB}MB`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }
  next(err);
}
