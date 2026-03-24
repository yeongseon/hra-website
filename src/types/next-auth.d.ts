import "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "MEMBER";
  }

  interface Session {
    user: User & {
      id: string;
      role: "ADMIN" | "MEMBER";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "MEMBER";
  }
}
