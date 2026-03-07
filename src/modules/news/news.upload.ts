import multer from "multer";

// File filter for validation
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.fieldname === "video") {
    const allowedVideoTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ];
    if (allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid video format. Only MP4, WebM, MOV, and AVI are allowed.",
        ),
      );
    }
  } else if (file.fieldname === "thumbnail") {
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid image format. Only JPG, PNG, and WebP are allowed."),
      );
    }
  } else {
    cb(null, false);
  }
};

// Use memory storage - files will be uploaded to Supabase from memory
export const uploadNews = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for videos
  },
});
