export interface Customer {
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
  verified_by?: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCustomerInput {
  first_name: string;
  last_name: string;
  middle_name?: string;
  company_name?: string;
  email: string;
  phone: string;
  landline?: string;
  username: string;
  password: string;
}
