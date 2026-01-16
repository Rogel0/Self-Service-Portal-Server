export interface LoginInput {
  username: string;
  password: string;
  keepLoggedIn?: boolean;
}

export interface RegisterInput {
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

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: number;
      username: string;
      email: string;
      role: "employee" | "customer";
    };
    token: string;
  };
}
