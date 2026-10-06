'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './mlx.module.css';
import { normalizeText } from '@/lib/mlx/normalize';
import type { MlxCustomer } from '@/lib/mlx/types';

/**
 * Ô chọn khách hàng có tìm kiếm.
 *
 * Danh sách master data đã hơn 800 khách nên thẻ <select> gốc không dùng nổi.
 * Ở đây gõ từ khoá để lọc theo tên công ty, tên viết tắt, mã khách hàng,
 * mã hợp đồng và MST; không phân biệt hoa thường và không cần gõ dấu.
 *
 * Danh sách thả xuống được vẽ bằng portal và định vị theo cửa sổ, vì bảng cha
 * có thanh cuộn ngang — nếu để trong bảng, danh sách sẽ bị cắt mất.
 */

const MAX_HIEN = 60; // chỉ dựng tối đa 60 dòng mỗi lần để danh sách luôn mượt

type Props = {
  customers: MlxCustomer[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

/** Chuỗi để so khớp từ khoá: gom mọi trường nhận dạng của khách hàng */
function timKiemKey(c: MlxCustomer): string {
  return [c.ten_cong_ty, c.ten_viet_tat, c.ma_khach_hang, c.ma_hop_dong, c.mst]
    .filter(Boolean)
    .map((v) => normalizeText(v))
    .join(' ');
}

export function nhanKhachHang(c: MlxCustomer): string {
  const ma = c.ma_hop_dong?.trim() || c.ma_khach_hang?.trim() || c.ten_viet_tat?.trim();
  return ma ? `${ma} — ${c.ten_cong_ty}` : c.ten_cong_ty;
}

export default function CustomerPicker({ customers, value, onChange, disabled }: Props) {
  const [mo, setMo] = useState(false);
  const [tuKhoa, setTuKhoa] = useState('');
  const [chon, setChon] = useState(0);
  const [toaDo, setToaDo] = useState<{ top: number; left: number; width: number; cao: number } | null>(null);

  const nutRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const oTimRef = useRef<HTMLInputElement>(null);

  const daChon = useMemo(() => customers.find((c) => c.id === value) ?? null, [customers, value]);

  // Chuẩn hoá sẵn một lần, tránh tính lại mỗi lần gõ phím
  const danhSach = useMemo(
    () => customers.map((c) => ({ c, key: timKiemKey(c) })),
    [customers],
  );

  const ketQua = useMemo(() => {
    const q = normalizeText(tuKhoa);
    if (!q) return danhSach.slice(0, MAX_HIEN).map((x) => x.c);
    // Mọi từ khoá đều phải xuất hiện: gõ "ssi 2000" vẫn ra đúng khách
    const tu = q.split(' ').filter(Boolean);
    const hop: MlxCustomer[] = [];
    for (const x of danhSach) {
      if (tu.every((t) => x.key.includes(t))) {
        hop.push(x.c);
        if (hop.length >= MAX_HIEN) break;
      }
    }
    return hop;
  }, [danhSach, tuKhoa]);

  const tongHop = useMemo(() => {
    const q = normalizeText(tuKhoa);
    if (!q) return customers.length;
    const tu = q.split(' ').filter(Boolean);
    return danhSach.reduce((n, x) => n + (tu.every((t) => x.key.includes(t)) ? 1 : 0), 0);
  }, [danhSach, tuKhoa, customers.length]);

  // Đặt danh sách ngay dưới ô chọn; nếu sát đáy màn hình thì lật lên trên
  const datViTri = () => {
    const el = nutRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const CAO_TOI_DA = 320;
    const choDuoi = window.innerHeight - r.bottom - 12;
    const choTren = r.top - 12;
    // Mở xuống dưới nếu đủ chỗ, không thì lật lên trên; chiều cao co theo chỗ còn lại
    const xuong = choDuoi >= Math.min(CAO_TOI_DA, choTren);
    const cao = Math.max(180, Math.min(CAO_TOI_DA, xuong ? choDuoi : choTren));
    setToaDo({
      top: xuong ? r.bottom + 4 : Math.max(8, r.top - cao - 4),
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 360) - 8)),
      width: Math.max(r.width, 360),
      cao,
    });
  };

  useLayoutEffect(() => {
    if (mo) datViTri();
  }, [mo]);

  useEffect(() => {
    if (!mo) return;
    oTimRef.current?.focus();
    const dong = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !nutRef.current?.contains(t)) setMo(false);
    };
    const theoDoi = () => datViTri();
    document.addEventListener('mousedown', dong);
    window.addEventListener('resize', theoDoi);
    window.addEventListener('scroll', theoDoi, true);
    return () => {
      document.removeEventListener('mousedown', dong);
      window.removeEventListener('resize', theoDoi);
      window.removeEventListener('scroll', theoDoi, true);
    };
  }, [mo]);

  useEffect(() => setChon(0), [tuKhoa]);

  // Luôn cuộn dòng đang trỏ vào trong tầm nhìn
  useEffect(() => {
    if (!mo) return;
    boxRef.current?.querySelector('[data-chon="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [chon, mo]);

  function phim(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setChon((i) => Math.min(i + 1, ketQua.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setChon((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = ketQua[chon];
      if (c?.id) {
        onChange(c.id);
        setMo(false);
        setTuKhoa('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMo(false);
      setTuKhoa('');
    }
  }

  function chonKhach(id: string) {
    onChange(id);
    setMo(false);
    setTuKhoa('');
  }

  return (
    <>
      <button
        ref={nutRef}
        type="button"
        className={`${s.picker} ${daChon ? '' : s.pickerTrong}`}
        disabled={disabled}
        onClick={() => setMo((v) => !v)}
        title={daChon ? daChon.ten_cong_ty : 'Chọn khách hàng'}
      >
        <span className={s.pickerText}>{daChon ? nhanKhachHang(daChon) : '— Chọn khách hàng —'}</span>
        <span className={s.pickerIcon} aria-hidden>▾</span>
      </button>

      {mo && toaDo && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={boxRef}
            className={s.pickerBox}
            style={{ top: toaDo.top, left: toaDo.left, width: toaDo.width, maxHeight: toaDo.cao }}
          >
            <input
              ref={oTimRef}
              className={s.pickerSearch}
              placeholder="Gõ tên, mã hợp đồng, MST…"
              value={tuKhoa}
              onChange={(e) => setTuKhoa(e.target.value)}
              onKeyDown={phim}
            />
            <div className={s.pickerList}>
              {ketQua.length === 0 ? (
                <div className={s.pickerEmpty}>Không tìm thấy khách hàng phù hợp.</div>
              ) : (
                ketQua.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    data-chon={i === chon ? '1' : undefined}
                    className={`${s.pickerItem} ${i === chon ? s.pickerItemOn : ''} ${c.id === value ? s.pickerItemSel : ''}`}
                    onMouseEnter={() => setChon(i)}
                    onClick={() => chonKhach(c.id as string)}
                  >
                    <span className={s.pickerName}>{c.ten_cong_ty}</span>
                    <span className={s.pickerMeta}>
                      {[c.ma_hop_dong && `HĐ ${c.ma_hop_dong}`, c.ma_khach_hang, c.mst && `MST ${c.mst}`]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className={s.pickerFoot}>
              {tongHop > ketQua.length
                ? `Hiện ${ketQua.length}/${tongHop} khách — gõ thêm từ khoá để thu hẹp`
                : `${tongHop} khách`}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
