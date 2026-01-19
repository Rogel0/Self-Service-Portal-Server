import { EmployeeTokenPayload } from "../utils/token";

declare global {
  namespace Express {
    interface Request {
      employee?: EmployeeTokenPayload;
    }
  }
}
export {};
