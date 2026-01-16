import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    user?: { employee_id: number; role_id: number };
  }
}
