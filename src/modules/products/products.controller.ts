import { Request, Response } from "express";
import pool from "../../config/database";
import logger from "../../utils/logger";

// Get all products
export const getProducts = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT product_id, product_name, product_desc, created_at
       FROM product
       ORDER BY product_name`
    );

    return res.json({
      success: true,
      data: { products: result.rows },
    });
  } catch (error) {
    logger.error("Get products error", { error });
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
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
