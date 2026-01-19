import { Request, Response, NextFunction } from "express";

export default function validate(
  schema: any,
  location: "body" | "query" | "params",
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (typeof schema.safeParse === "function") {
      // Zod schema support
      const result = schema.safeParse(req[location]);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          errors: result.error.errors,
        });
      }
      req[location] = result.data;
      return next();
    }
    return next();
  };
}
