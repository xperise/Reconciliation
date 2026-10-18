// Dashboard Mobility (XPAY) — phần dùng chung cho các API /api/dashboard/mobility/*
import { NextResponse } from "next/server";
import { EDIT_ROLES } from "@/lib/dashboard/server";

/** Đường dẫn tài liệu: crm/b07, cfg/main… (số đoạn chẵn, ký tự an toàn) */
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
export function docPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length > 1000) return null;
  const s = p.split("/");
  return s.length % 2 === 0 && s.every((x) => SEG.test(x) && x !== "." && x !== "..") ? p : null;
}
export function colPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length > 1000) return null;
  const s = p.split("/");
  return s.length % 2 === 1 && s.every((x) => SEG.test(x) && x !== "." && x !== "..") ? p : null;
}

/** Bỏ các khoá null (giống cách dashboard trên claude.ai xử lý khi tạo mới tài liệu) */
export function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== null && x !== undefined) o[k] = stripNulls(x);
    return o;
  }
  return v;
}

export const canEditRole = (role: string) => EDIT_ROLES.includes(role);

export const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status });
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
