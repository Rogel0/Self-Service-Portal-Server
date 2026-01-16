import { Request } from "express";

export interface LoginRequest {
  username: string;
  password: string;
  keepLoggedIn?: boolean;
}

export interface LoginResponse {
  token: string;
}

export interface EmployeeAuthResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      employee_id: number;
      firstname: string;
      lastname: string;
      middlename?: string;
      role_id: number;
      department_id: number;
      username: string;
      password: string;
      email: string;
      created_at: Date;
      updated_at: Date;
      isActive: boolean;
    };
    token: string;
  };
}

export interface CustomerAuthResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      customer_id: number;
      first_name: string;
      last_name: string;
      middle_name?: string;
      company_name?: string;
      email: string;
      phone: string;
      landline?: string;
      username: string;
      password: string;
      verification_status: string;
      approved: boolean;
      verified_at?: Date;
      verified_by: number;
      created_at: Date;
      updated_at: Date;
      isActive: boolean;
    };
  };
}
