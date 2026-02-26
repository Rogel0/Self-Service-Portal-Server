import { CookieOptions } from "express";
import { COOKIE_MAX_AGE } from "../constants";

export const getCookieConfig = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === "production";
  const cookieSecure = isProd
    ? process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === "true"
      : true
    : false;
  const cookieSameSite = isProd
    ? (process.env.COOKIE_SAMESITE ?? "none")
    : "lax";

  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite as "none" | "lax" | "strict",
    path: "/",
  };
};

export const getAuthCookieOptions = (keepSignedIn: boolean): CookieOptions => {
  return {
    ...getCookieConfig(),
    maxAge: keepSignedIn ? COOKIE_MAX_AGE.LONG : COOKIE_MAX_AGE.SHORT,
  };
};

export const getClearCookieOptions = (): CookieOptions => {
  return {
    ...getCookieConfig(),
    maxAge: 0,
    expires: new Date(0),
  };
};
