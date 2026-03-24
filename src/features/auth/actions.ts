"use server";

import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { z } from "zod/v4";

const registerSchema = z
  .object({
    name: z.string().min(1, "이름을 입력해주세요"),
    email: z.string().email("올바른 이메일을 입력해주세요"),
    password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

export async function registerUser(formData: FormData) {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  const parsed = registerSchema.safeParse({
    name,
    email,
    password,
    confirmPassword,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "입력값을 확인해주세요",
    };
  }

  const { name: validatedName, email: validatedEmail, password: validatedPassword } = parsed.data;

  try {
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, validatedEmail),
    });

    if (existingUser) {
      return {
        success: false,
        error: "이미 등록된 이메일입니다",
      };
    }

    const passwordHash = await hash(validatedPassword, 10);

    await db.insert(users).values({
      name: validatedName,
      email: validatedEmail,
      passwordHash,
      role: "MEMBER",
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: "회원가입에 실패했습니다. 다시 시도해주세요.",
    };
  }
}
