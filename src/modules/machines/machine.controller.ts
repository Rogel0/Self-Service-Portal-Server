import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

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

    const { serial_number, model_number, product_id, purchase_date } = req.body;

    // Check if machine already exists (by serial number)
    const existingMachine = await client.query(
      `SELECT machine_id, customer_id FROM machines WHERE serial_number = $1`,
      [serial_number]
    );

    if (existingMachine.rows.length > 0) {
      // Machine exists, check if it belongs to another customer
      if (existingMachine.rows[0].customer_id !== customerId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This machine is already registered to another account",
        });
      } else {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "This machine is already registered to your account",
        });
      }
    }

    // Verify product exists
    const productCheck = await client.query(
      `SELECT product_id FROM product WHERE product_id = $1`,
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid product",
      });
    }

    // Insert machine
    const result = await client.query(
      `INSERT INTO machines 
       (customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'active', NOW())
       RETURNING machine_id, customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at`,
      [
        customerId,
        product_id,
        serial_number,
        model_number,
        purchase_date || null,
      ]
    );

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
        m.registration_date,
        m.status,
        m.created_at,
        p.product_id,
        p.product_name,
        p.product_desc
       FROM machines m
       JOIN product p ON m.product_id = p.product_id
       WHERE m.customer_id = $1
       ORDER BY m.created_at DESC`,
      [customerId]
    );

    return res.json({
      success: true,
      data: { machines: result.rows },
    });
  } catch (error) {
    logger.error("Get machines error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch machines",
    });
  }
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
        p.product_desc
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

    // Get manuals
    const manualsResult = await pool.query(
      `SELECT manual_id, title, file_url, uploaded_at
       FROM machine_manuals
       WHERE machine_id = $1
       ORDER BY uploaded_at DESC`,
      [machineId]
    );

    // Get gallery
    const galleryResult = await pool.query(
      `SELECT gallery_id, image_url, caption, uploaded_at
       FROM machine_gallery
       WHERE machine_id = $1
       ORDER BY uploaded_at DESC`,
      [machineId]
    );

    // Get brochures
    const brochuresResult = await pool.query(
      `SELECT brochure_id, title, file_url, uploaded_at
       FROM machine_brochures
       WHERE machine_id = $1
       ORDER BY uploaded_at DESC`,
      [machineId]
    );

    // Get videos
    const videosResult = await pool.query(
      `SELECT video_id, video_type, title, video_url, uploaded_at
       FROM machine_videos
       WHERE machine_id = $1
       ORDER BY uploaded_at DESC`,
      [machineId]
    );

    // Get specifications
    const specsResult = await pool.query(
      `SELECT spec_id, spec_name, spec_value
       FROM machine_specifications
       WHERE machine_id = $1
       ORDER BY spec_name`,
      [machineId]
    );

    // Get available parts for this product
    const partsResult = await pool.query(
      `SELECT parts_id, parts_name, description, price, stock_quantity
       FROM parts
       WHERE product_id = $1 AND stock_quantity > 0
       ORDER BY parts_name`,
      [machine.product_id]
    );

    return res.json({
      success: true,
      data: {
        machine: {
          ...machine,
          manuals: manualsResult.rows,
          gallery: galleryResult.rows,
          brochures: brochuresResult.rows,
          videos: videosResult.rows,
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

    // Verify machine ownership
    const machineCheck = await client.query(
      `SELECT machine_id FROM machines WHERE machine_id = $1 AND customer_id = $2`,
      [machineId, customerId],
    );
    if (machineCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Machine not found",
      });
    }

    const { manuals, gallery, brochures, videos, specifications } = req.body;

    if (manuals?.length) {
      for (const item of manuals) {
        await client.query(
          `INSERT INTO machine_manuals (machine_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.title, item.file_url],
        );
      }
    }

    if (gallery?.length) {
      for (const item of gallery) {
        await client.query(
          `INSERT INTO machine_gallery (machine_id, image_url, caption, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.image_url, item.caption ?? null],
        );
      }
    }

    if (brochures?.length) {
      for (const item of brochures) {
        await client.query(
          `INSERT INTO machine_brochures (machine_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.title, item.file_url],
        );
      }
    }

    if (videos?.length) {
      for (const item of videos) {
        await client.query(
          `INSERT INTO machine_videos (machine_id, video_type, title, video_url, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, item.video_type, item.title, item.video_url],
        );
      }
    }

    if (specifications?.length) {
      for (const item of specifications) {
        await client.query(
          `INSERT INTO machine_specifications (machine_id, spec_name, spec_value)
           VALUES ($1, $2, $3)`,
          [machineId, item.spec_name, item.spec_value],
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
    customer_id,
    serial_number,
    model_number,
    product_id,
    purchase_date,
  } = req.body;

  try {
    await client.query("BEGIN");

    // Verify customer exists
    const customerCheck = await client.query(
      `SELECT customer_id FROM customer_user WHERE customer_id = $1`,
      [customer_id],
    );
    if (customerCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid customer",
      });
    }

    // Check if machine already exists (by serial number)
    const existingMachine = await client.query(
      `SELECT machine_id FROM machines WHERE serial_number = $1`,
      [serial_number],
    );
    if (existingMachine.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Serial number already exists",
      });
    }

    // Verify product exists
    const productCheck = await client.query(
      `SELECT product_id FROM product WHERE product_id = $1`,
      [product_id],
    );
    if (productCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid product",
      });
    }

    const result = await client.query(
      `INSERT INTO machines 
       (customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'active', NOW())
       RETURNING machine_id, customer_id, product_id, serial_number, model_number, purchase_date, registration_date, status, created_at`,
      [
        customer_id,
        product_id,
        serial_number,
        model_number,
        purchase_date || null,
      ],
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

    const { manuals, gallery, brochures, videos, specifications } = req.body;

    if (manuals?.length) {
      for (const item of manuals) {
        await client.query(
          `INSERT INTO machine_manuals (machine_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.title, item.file_url],
        );
      }
    }

    if (gallery?.length) {
      for (const item of gallery) {
        await client.query(
          `INSERT INTO machine_gallery (machine_id, image_url, caption, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.image_url, item.caption ?? null],
        );
      }
    }

    if (brochures?.length) {
      for (const item of brochures) {
        await client.query(
          `INSERT INTO machine_brochures (machine_id, title, file_url, uploaded_at)
           VALUES ($1, $2, $3, NOW())`,
          [machineId, item.title, item.file_url],
        );
      }
    }

    if (videos?.length) {
      for (const item of videos) {
        await client.query(
          `INSERT INTO machine_videos (machine_id, video_type, title, video_url, uploaded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [machineId, item.video_type, item.title, item.video_url],
        );
      }
    }

    if (specifications?.length) {
      for (const item of specifications) {
        await client.query(
          `INSERT INTO machine_specifications (machine_id, spec_name, spec_value)
           VALUES ($1, $2, $3)`,
          [machineId, item.spec_name, item.spec_value],
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
