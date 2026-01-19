import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface EmployeeTokenPayload {
  employee_id: number;
  username: string;
  role_id: number;
  department_id: number;
}

export interface CustomerTokenPayload {
  customer_id: number;
  username: string;
  email: string;
}

export const generateCustomerToken = (
  payload: CustomerTokenPayload,
  expiresIn?: string | number,
): string => {
  const opts = {
    expiresIn: expiresIn ?? env.JWT_EXPIRES_IN,
  } as jwt.SignOptions;
  return jwt.sign(payload, env.JWT_SECRET, opts);
};

export const generateToken = (
  payload: EmployeeTokenPayload,
  expiresIn?: string | number,
): string => {
  const opts = {
    expiresIn: expiresIn ?? env.JWT_EXPIRES_IN,
  } as jwt.SignOptions;
  return jwt.sign(payload, env.JWT_SECRET, opts);
};

export const verifyToken = (token: string): EmployeeTokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as EmployeeTokenPayload;
};

export const verifyCustomerToken = (token: string): CustomerTokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as CustomerTokenPayload;
};
