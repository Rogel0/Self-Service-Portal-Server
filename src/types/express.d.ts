import type {
  CustomerTokenPayload,
  EmployeeTokenPayload,
} from "../utils/token";

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerTokenPayload;
      employee?: EmployeeTokenPayload;
    }
  }
}

export {};
