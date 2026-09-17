import type { ReactNode } from 'react';
import MlxNav from '@/components/mlx/MlxNav';
import s from '@/components/mlx/mlx.module.css';

export const metadata = { title: 'MLX – Bảng kê taxi' };

export default function MlxLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.root}>
      <MlxNav />
      {children}
    </div>
  );
}
