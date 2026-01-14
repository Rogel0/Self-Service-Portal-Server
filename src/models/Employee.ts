import bcrypt from "bcryptjs";

export interface Employee {
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
  updated_At: Date;
}

export interface CreatEmployeeInput {
  firstname: string;
  lastname: string;
  middlename?: string;
  role_id: number;
  department_id: number;
  username: string;
  password: string;
  email: string;
}
