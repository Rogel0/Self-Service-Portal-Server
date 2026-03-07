import { Router } from "express";
import { employeeAuth } from "../../middlewares/auth.middleware";
import validate from "../../middlewares/validate.middleware";
import * as newsController from "./news.controller";
import { createNewsSchema, updateNewsSchema } from "./news.schema";
import { uploadNews } from "./news.upload";

const router = Router();

router.get("/published", newsController.getPublishedNews);
router.get("/:id/view", newsController.getNewsById);

router.get("/", employeeAuth, newsController.getAllNews);
router.post(
  "/",
  employeeAuth,
  uploadNews.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  newsController.createNews,
);
router.patch(
  "/:id",
  employeeAuth,
  uploadNews.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  newsController.updateNews,
);
router.delete("/:id", employeeAuth, newsController.deleteNews);
router.patch("/:id/publish", employeeAuth, newsController.publishNews);
router.post("/migrate-urls", employeeAuth, newsController.migrateNewsUrls);

export default router;
