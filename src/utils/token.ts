import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface EmployeeTokenPayload {
  employee_id: number;
  username: string;
  role_id: number;
  department_id: number;
}

export const generateToken = (payload: EmployeeTokenPayload): string => {
  const options: SignOptions = { expiresIn: "7d" };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): EmployeeTokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as EmployeeTokenPayload;
};
