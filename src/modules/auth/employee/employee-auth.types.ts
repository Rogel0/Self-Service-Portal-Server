import type { EmployeeSafe } from "../../../models/Employee";

export interface EmployeeLoginInput {
  username: string;
  password: string;
}

export interface EmployeeLoginResponse {
  success: true;
  message: string;
  data: {
    employee: EmployeeSafe;
    token: string;
  };
}

export interface EmployeeAuthErrorResponse {
  success: false;
  message: string;
}

export type EmployeeAuthResponse =
  | EmployeeLoginResponse
  | EmployeeAuthErrorResponse;
