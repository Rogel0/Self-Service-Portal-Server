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
  updated_at: Date;
}

export interface CreateEmployeeInput {
  firstname: string;
  lastname: string;
  middlename?: string;
  role_id: number;
  department_id: number;
  username: string;
  password: string;
  email: string;
}

export interface EmployeeSafe {
  employee_id: number;
  firstname: string;
  lastname: string;
  middlename?: string;
  role_id: number;
  department_id: number;
  username: string;
  email: string;
  created_at: Date;
}

export interface UpdateEmployeeInput {
  firstname?: string;
  lastname?: string;
  role_id?: number;
  department_id?: number;
  email?: string;
}
