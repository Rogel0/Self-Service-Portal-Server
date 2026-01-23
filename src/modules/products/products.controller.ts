import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";
import { supabase } from "../../utils/supabase";

// Get all products
export const getProducts = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.product_id,
        p.product_name,
        p.product_desc,
        p.category,
        p.status,
        p.profile_image_url,
        p.created_at,
        p.updated_at,
        MIN(m.model_number) AS model_number
       FROM product p
       LEFT JOIN machines m ON m.product_id = p.product_id
       GROUP BY p.product_id
       ORDER BY p.product_name`
    );

    const products = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        profile_image_url: row.profile_image_url
          ? await resolveSignedUrl("products", row.profile_image_url)
          : null,
      })),
    );

    return res.json({
      success: true,
      data: { products },
    });
  } catch (error) {
    logger.error("Get products error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

const extractStoragePath = (bucket: string, fileUrlOrPath: string) => {
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
      if (pathname.includes(marker)) {
        return pathname.split(marker)[1];
      }
    }
  } catch {
    return null;
  }
  return null;
};

const normalizeStoragePath = (bucket: string, fileUrlOrPath: string | null) => {
  if (!fileUrlOrPath) return null;
  let path = fileUrlOrPath;
  // If stored as "bucket/bucket/..." trim a single prefix
  if (path.startsWith(`${bucket}/${bucket}/`)) {
    path = path.slice(bucket.length + 1);
  }
  return path;
};

const resolvePublicUrl = (bucket: string, fileUrlOrPath: string) => {
  const resolvedPath = normalizeStoragePath(
    bucket,
    extractStoragePath(bucket, fileUrlOrPath),
  );
  if (!resolvedPath) return fileUrlOrPath;
  const { data } = supabase.storage.from(bucket).getPublicUrl(resolvedPath);
  return data.publicUrl;
};

const resolveSignedUrl = async (bucket: string, fileUrlOrPath: string) => {
  const resolvedPath = normalizeStoragePath(
    bucket,
    extractStoragePath(bucket, fileUrlOrPath),
  );
  if (!resolvedPath) return fileUrlOrPath;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(resolvedPath, 60 * 10);
  if (!error) return data.signedUrl;

  // Fallback: try the raw extracted path if different
  const rawPath = extractStoragePath(bucket, fileUrlOrPath);
  if (rawPath && rawPath !== resolvedPath) {
    const fallback = await supabase.storage
      .from(bucket)
      .createSignedUrl(rawPath, 60 * 10);
    if (!fallback.error) return fallback.data.signedUrl;
  }

  return resolvePublicUrl(bucket, resolvedPath);
};

export const getProductDetails = async (req: Request, res: Response) => {
  const { productId } = req.params;

  try {
    const productResult = await pool.query(
      `SELECT product_id, product_name, product_desc, category, status, profile_image_url, created_at, updated_at
       FROM product
       WHERE product_id = $1`,
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product = productResult.rows[0];
    const resolvedProfileImageUrl = product.profile_image_url
      ? await resolveSignedUrl("products", product.profile_image_url)
      : null;

    const [manualsResult, brochuresResult, galleryResult, videosResult, specsResult] =
      await Promise.all([
        pool.query(
          `SELECT manual_id, title, file_url, uploaded_at
           FROM machine_manuals
           WHERE product_id = $1
           ORDER BY uploaded_at DESC`,
          [productId],
        ),
        pool.query(
          `SELECT brochure_id, title, file_url, uploaded_at
           FROM machine_brochures
           WHERE product_id = $1
           ORDER BY uploaded_at DESC`,
          [productId],
        ),
        pool.query(
          `SELECT gallery_id, image_url, caption, uploaded_at
           FROM machine_gallery
           WHERE product_id = $1
           ORDER BY uploaded_at DESC`,
          [productId],
        ),
        pool.query(
          `SELECT video_id, video_type, title, video_url, uploaded_at
           FROM machine_videos
           WHERE product_id = $1
           ORDER BY uploaded_at DESC`,
          [productId],
        ),
        pool.query(
          `SELECT spec_id, spec_name, spec_value
           FROM machine_specifications
           WHERE product_id = $1
           ORDER BY spec_name`,
          [productId],
        ),
      ]);

    const manuals = await Promise.all(
      manualsResult.rows.map(async (row) => ({
        ...row,
        url: await resolveSignedUrl("manuals", row.file_url),
      })),
    );

    const brochures = await Promise.all(
      brochuresResult.rows.map(async (row) => ({
        ...row,
        url: await resolveSignedUrl("brochures", row.file_url),
      })),
    );

    const gallery = await Promise.all(
      galleryResult.rows.map(async (row) => ({
        ...row,
        url: await resolveSignedUrl("gallery", row.image_url),
      })),
    );

    const videos = await Promise.all(
      videosResult.rows.map(async (row) => ({
        ...row,
        url: await resolveSignedUrl("videos", row.video_url),
      })),
    );

    return res.json({
      success: true,
      data: {
        product: {
          ...product,
          profile_image_url: resolvedProfileImageUrl,
          manuals,
          brochures,
          gallery,
          videos,
          specifications: specsResult.rows,
        },
      },
    });
  } catch (error) {
    logger.error("Get product details error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
    });
  }
};

// Create product (admin)
export const createProduct = async (req: Request, res: Response) => {
  const rawName =
    typeof req.body?.product_name === "string" ? req.body.product_name : "";
  const rawDesc =
    typeof req.body?.product_desc === "string" ? req.body.product_desc : "";
  const rawCategory =
    typeof req.body?.category === "string" ? req.body.category : "";
  const rawStatus =
    typeof req.body?.status === "string" ? req.body.status : "";
  const rawProfileImageUrl =
    typeof req.body?.profile_image_url === "string"
      ? req.body.profile_image_url
      : "";

  const productName = rawName.trim();
  const productDesc = rawDesc.trim();
  const category = rawCategory.trim();
  const status = rawStatus.trim();
  const profileImageUrl = rawProfileImageUrl.trim();

  if (!productName) {
    return res.status(400).json({
      success: false,
      message: "Product name is required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO product
       (product_name, product_desc, category, status, profile_image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING product_id, product_name, product_desc, category, status, profile_image_url, created_at`,
      [
        productName,
        productDesc || null,
        category || null,
        status || null,
        profileImageUrl || null,
      ],
    );

    return res.status(201).json({
      success: true,
      data: { product: result.rows[0] },
    });
  } catch (error) {
    logger.error("Create product error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};

// Get parts for a product
export const getPartsByProduct = async (req: Request, res: Response) => {
  const { productId } = req.params;

  try {
    const result = await pool.query(
      `SELECT parts_id, parts_name, description, price, stock_quantity, created_at
       FROM parts
       WHERE product_id = $1
       ORDER BY parts_name`,
      [productId]
    );

    return res.json({
      success: true,
      data: { parts: result.rows },
    });
  } catch (error) {
    logger.error("Get parts by product error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts",
    });
  }
};

// Get all available parts
export const getAllParts = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.parts_id,
        p.parts_name,
        p.description,
        p.price,
        p.stock_quantity,
        p.created_at,
        pr.product_id,
        pr.product_name
       FROM parts p
       JOIN product pr ON p.product_id = pr.product_id
       WHERE p.stock_quantity > 0
       ORDER BY pr.product_name, p.parts_name`
    );

    return res.json({
      success: true,
      data: { parts: result.rows },
    });
  } catch (error) {
    logger.error("Get all parts error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parts",
    });
  }
};
