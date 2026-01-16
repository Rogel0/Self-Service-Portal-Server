// import jwt from "jsonwebtoken";

// const JWT_SECRET = process.env.JWT_SECRET;
// const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

// export interface TokenPayload {
//   id: number;
//   username: string;
//   role: "employee" | "customer";
//   role_id?: number;
// }

// export const generateToken = (payload: TokenPayload): string => {
//   return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
// };

// export const verifyToken = (token: string): TokenPayload => {
//   return jwt.verify(token, JWT_SECRET) as TokenPayload;
// };
