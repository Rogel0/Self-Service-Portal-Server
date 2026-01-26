import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";
import { supabase } from "../../utils/supabase";

export const addMachine = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const customerId = req.customer?.customer_id;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    await client.query("BEGIN");

    const { model_number, product_id } = req.body;

    const productId = product_id ?? null;

    if (productId) {
      const productCheck = await client.query(
        `SELECT product_id FROM product WHERE product_id = $1`,
        [productId],
      );
      if (productCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid product",
        });
      }
    }

    const result = await client.query(
      `INSERT INTO machines
      (customer_id, product_id, model_number, registration_date, status, created_at)
      VALUES ($1, $2, $3, NOW(), 'active', NOW())
      RETURNING machine_id, customer_id, product_id, model_number, registration_date, status, created_at`,
      [customerId, productId, model_number]
    )

    await client.query("COMMIT");

    logger.info("Machine added", {
      machine_id: result.rows[0].machine_id,
      customer_id: customerId,
    });

    // TODO: Send confirmation email

    return res.status(201).json({
      success: true,
      message: "Machine registered successfully",
      data: { machine: result.rows[0] },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Add machine error", { error });

    // Handle unique constraint violation
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Serial number already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to register machine",
    });
  } finally {
    client.release();
  }
};

export const getMyMachines = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT
        m.machine_id,
        m.serial_number,
        m.model_number,
        m.purchase_date,
        m.status,
        m.created_at,
        p.product_id,
        p.product_name,
        p.product_desc,
        p.profile_image_url
      FROM machines m
      JOIN product p ON m.product_id = p.product_id
      WHERE m.customer_id = $1
      ORDER BY m.created_at DESC`,
      [customerId]
    );

    const machines = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        profile_image_url: row.profile_image_url
          ? await resolveSignedUrl("products", row.profile_image_url)
          : null,
      })),
    );

    return res.json({
      success: true,
      data: { machines },
    });
  } catch (error) {
    logger.error("Get machines error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch machines",
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

  const rawPath = extractStoragePath(bucket, fileUrlOrPath);
  if (rawPath && rawPath !== resolvedPath) {
    const fallback = await supabase.storage
      .from(bucket)
      .createSignedUrl(rawPath, 60 * 10);
    if (!fallback.error) return fallback.data.signedUrl;
  }

  return resolvePublicUrl(bucket, resolvedPath);
};

export const getMachineDetails = async (req: Request, res: Response) => {
  const customerId = req.customer?.customer_id;
  const { machineId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    // Get machine basic info
    const machineResult = await pool.query(
      `SELECT 
        m.machine_id,
        m.serial_number,
        m.model_number,
        m.purchase_date,
        m.registration_date,
        m.status,
        m.created_at,
        p.product_id,
        p.product_name,
        p.product_desc,
        p.profile_image_url
       FROM machines m
       JOIN product p ON m.product_id = p.product_id
       WHERE m.machine_id = $1 AND m.customer_id = $2`,
      [machineId, customerId]
    );

    if (machineResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    const machine = machineResult.rows[0];
    const resolvedMachine = {
      ...machine,
      profile_image_url: machine.profile_image_url
        ? await resolveSignedUrl("products", machine.profile_image_url)
        : null,
    };

    // Get manuals
    const manualsResult = await pool.query(
      `SELECT manual_id, title, file_url, uploaded_at
       FROM machine_manuals
       WHERE machine_id = $1 OR product_id = $2
       ORDER BY uploaded_at DESC`,
      [machineId, machine.product_id]
    );

    // Get gallery
    const galleryResult = await pool.query(
      `SELECT gallery_id, image_url, caption, uploaded_at
       FROM machine_gallery
       WHERE machine_id = $1 OR product_id = $2
       ORDER BY uploaded_at DESC`,
      [machineId, machine.product_id]
    );

    // Get brochures
    const brochuresResult = await pool.query(
      `SELECT brochure_id, title, file_url, uploaded_at
       FROM machine_brochures
       WHERE machine_id = $1 OR product_id = $2
       ORDER BY uploaded_at DESC`,
      [machineId, machine.product_id]
    );

    // Get videos
    const videosResult = await pool.query(
      `SELECT video_id, video_type, title, video_url, uploaded_at
       FROM machine_videos
       WHERE machine_id = $1 OR product_id = $2
       ORDER BY uploaded_at DESC`,
      [machineId, machine.product_id]
    );

    // Get specifications
    const specsResult = await pool.query(
      `SELECT spec_id, spec_name, spec_value
       FROM machine_specifications
       WHERE machine_id = $1 OR product_id = $2
       ORDER BY spec_name`,
      [machineId, machine.product_id]
    );

    // Get available parts for this product
    const partsResult = await pool.query(
      `SELECT parts_id, parts_name, description, price, stock_quantity
       FROM parts
       WHERE product_id = $1 AND stock_quantity > 0
       ORDER BY parts_name`,
      [machine.product_id]
    );

    const manuals = await Promise.all(
      manualsResult.rows.map(async (row) => ({
        ...row,
        file_url: row.file_url
          ? await resolveSignedUrl("products", row.file_url)
          : row.file_url,
      })),
    );

    const gallery = await Promise.all(
      galleryResult.rows.map(async (row) => ({
        ...row,
        image_url: row.image_url
          ? await resolveSignedUrl("products", row.image_url)
          : row.image_url,
      })),
    );

    const brochures = await Promise.all(
      brochuresResult.rows.map(async (row) => ({
        ...row,
        file_url: row.file_url
          ? await resolveSignedUrl("products", row.file_url)
          : row.file_url,
      })),
    );

    const videos = await Promise.all(
      videosResult.rows.map(async (row) => ({
        ...row,
        video_url: row.video_url
          ? await resolveSignedUrl("products", row.video_url)
          : row.video_url,
      })),
    );

    return res.json({
      success: true,
      data: {
        machine: {
          ...resolvedMachine,
          manuals,
          gallery,
          brochures,
          videos,
          specifications: specsResult.rows,
          parts: partsResult.rows,
        },
      },
    });
  } catch (error) {
    logger.error("Get machine details error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch machine details",
    });
  }
};

export const addMachineAssets = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const customerId = req.customer?.customer_id;
  const { machineId } = req.params;

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    await client.query("BEGIN");

    // Verify machine ownership and get product_id
    const machineCheck = await client.query(
      `SELECT machine_id, product_id FROM machines WHERE machine_id = $1 AND customer_id = $2`,
      [machineId, customerId],
    );
    if (machineCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    const productId = machineCheck.rows[0]?.product_id ?? null;
    const { manuals, gallery, brochures, videos, specifications } = req.body;

    if (manuals?.length) {
      for (const item of manuals) {
        await client.query(
          `INSERT INTO machine_manuals (machine_id, product_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, productId, item.title, item.file_url],
        );
      }
    }

    if (gallery?.length) {
      for (const item of gallery) {
        await client.query(
          `INSERT INTO machine_gallery (machine_id, product_id, image_url, caption, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, productId, item.image_url, item.caption ?? null],
        );
      }
    }

    if (brochures?.length) {
      for (const item of brochures) {
        await client.query(
          `INSERT INTO machine_brochures (machine_id, product_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, productId, item.title, item.file_url],
        );
      }
    }

    if (videos?.length) {
      for (const item of videos) {
        await client.query(
          `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [machineId, productId, item.video_type, item.title, item.video_url],
        );
      }
    }

    if (specifications?.length) {
      for (const item of specifications) {
        await client.query(
          `INSERT INTO machine_specifications (machine_id, product_id, spec_name, spec_value)
           VALUES ($1, $2, $3, $4)`,
          [machineId, productId, item.spec_name, item.spec_value],
        );
      }
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Machine details saved successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Add machine assets error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to save machine details",
    });
  } finally {
    client.release();
  }
};

export const addMachineForAdmin = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const {
    model_number,
    product_id,
    product_name,
    category,
    status,
    description,
    profile_image_url,
  } = req.body;

  try {
    await client.query("BEGIN");

    let productId: number | null = product_id ?? null;

    // Verify product exists or create a new one for the catalog
    if (productId) {
      const productCheck = await client.query(
        `SELECT product_id FROM product WHERE product_id = $1`,
        [productId],
      );
      if (productCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Invalid product",
        });
      }
    } else {
      const resolvedProductName = (product_name || "").trim() || model_number;
      const createdProduct = await client.query(
        `INSERT INTO product
         (product_name, product_desc, category, status, profile_image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING product_id`,
        [
          resolvedProductName,
          description || null,
          category || null,
          status || null,
          profile_image_url || null,
        ],
      );
      productId = createdProduct.rows[0]?.product_id ?? null;
    }

    const result = await client.query(
      `INSERT INTO machines 
       (customer_id, product_id, model_number, registration_date, status, created_at)
       VALUES ($1, $2, $3, NOW(), 'active', NOW())
       RETURNING machine_id, customer_id, product_id, model_number, registration_date, status, created_at`,
      [null, productId, model_number],
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Machine registered successfully",
      data: { machine: result.rows[0] },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    logger.error("Add machine (admin) error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to register machine",
    });
  } finally {
    client.release();
  }
};

export const addMachineAssetsForAdmin = async (
  req: Request,
  res: Response,
) => {
  const client = await pool.connect();
  const { machineId } = req.params;

  try {
    await client.query("BEGIN");

    const machineCheck = await client.query(
      `SELECT machine_id FROM machines WHERE machine_id = $1`,
      [machineId],
    );
    if (machineCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    const { manuals, gallery, brochures, videos, specifications, manual_ids, brochure_ids } = req.body;

    const machineRow = await client.query(
      `SELECT product_id FROM machines WHERE machine_id = $1`,
      [machineId],
    );
    const productId = machineRow.rows[0]?.product_id ?? null;
    if (!productId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Machine has no product",
      });
    }

    if (manual_ids?.length) {
      await client.query(
        `UPDATE machine_manuals SET product_id = $1 WHERE manual_id = ANY($2::int[])`,
        [productId, manual_ids],
      )
    }

    if (gallery?.length) {
      for (const item of gallery) {
        await client.query(
          `INSERT INTO machine_gallery (machine_id, product_id, image_url, caption, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, productId, item.image_url, item.caption ?? null],
        );
      }
    }

    if (brochure_ids?.length) {
      await client.query(
        `UPDATE machine_brochures SET product_id = $1 WHERE brochure_id = ANY($2::int[])`,
        [productId, brochure_ids],
      )
    }

    if (videos?.length) {
      for (const item of videos) {
        await client.query(
          `INSERT INTO machine_videos (machine_id, product_id, video_type, title, video_url, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [machineId, productId, item.video_type, item.title, item.video_url],
        );
      }
    }

    if (specifications?.length) {
      for (const item of specifications) {
        await client.query(
          `INSERT INTO machine_specifications (machine_id, product_id, spec_name, spec_value)
           VALUES ($1, $2, $3, $4)`,
          [machineId, productId, item.spec_name, item.spec_value],
        );
      }
    }

    await client.query("COMMIT");
    return res.json({
      success: true,
      message: "Machine details saved successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Add machine assets (admin) error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to save machine details",
    });
  } finally {
    client.release();
  }
};
