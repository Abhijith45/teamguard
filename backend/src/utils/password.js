import bcrypt from "bcryptjs";

export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export function passwordFitsBcrypt(password) {
  return typeof password === "string"
    && Buffer.byteLength(password, "utf8") <= MAX_BCRYPT_PASSWORD_BYTES;
}

export async function hashPassword(password) {
  if (!passwordFitsBcrypt(password)) {
    throw new Error(`Password must be no more than ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes.`);
  }
  return bcrypt.hash(password, 12);
}