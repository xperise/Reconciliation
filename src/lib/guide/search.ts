// Tìm kiếm thông minh trong tab Hướng dẫn — chạy được cả trên trình duyệt và máy chủ.
// Chia nhỏ nội dung tới từng bước / câu hỏi / dòng tra lỗi, hiểu từ đồng nghĩa, gõ không dấu, sai 1 ký tự; xếp hạng BM25 + cụm từ.
import type { Guide } from './meta';
import type { Journey } from './journey';

export type Chunk = {
  id: string; g: string; s: string; guide: string; title: string; head: string; group?: string;
  kind: 'step' | 'faq' | 'symptom' | 'part';
  text: string; f: string; ft: string; fh: string;      // chữ thường, đã bỏ dấu: toàn văn / tiêu đề mục / tiêu đề đoạn
  sym?: { who: string; symptom: string; cause: string; fix: string; link?: string };
  at?: { k: number; p: number; role: string; stage: string; color: string };
};
export type Hit = { c: Chunk; score: number; terms: string[] };

/** bỏ dấu tiếng Việt, chữ thường, giữ chữ + số; giữ nguyên độ dài theo từng ký tự (để tô sáng đúng chỗ) */
export const foldChar = (ch: string) => { const x = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return (x === 'đ' ? 'd' : x[0] || ' ').replace(/[^a-z0-9]/, ' '); };
export const fold = (s: string) => Array.from(String(s || '').normalize('NFC')).map(foldChar).join('');
const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);
const plain = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^>\s*\[![A-Z]+\]\s*/gm, '').replace(/[#>*_`|]+/g, ' ').replace(/^\s*-\s*\[[ x]\]\s*/gm, '').replace(/\s+/g, ' ').trim();

/* từ đồng nghĩa / cách gọi khác (đã bỏ dấu). Cụm nhiều âm tiết được so như một cụm. */
const SYN: string[][] = [
  ['pin', 'ma pin'], ['gan the', 'assign the', 'phat the cho nhan vien'], ['nap tien', 'topup', 'top up', 'nap vi', 'nap so du'],
  ['han muc', 'limit', 'monthly limit', 'dinh muc'], ['cost center', 'trung tam chi phi'], ['vi cong ty', 'vi doanh nghiep', 'wallet', 'vi'],
  ['tai xe', 'driver', 'lai xe', 'bac tai'], ['don vi', 'merchant', 'vendor', 'nha xe', 'don vi van tai'], ['doanh nghiep', 'khach hang doanh nghiep', 'corporate', 'cong ty'],
  ['dat xe', 'goi xe', 'book xe', 'booking', 'dat chuyen'], ['huy chuyen', 'huy xe', 'huy cuoc', 'cancel'], ['bien so', 'bien kiem soat', 'bs xe'],
  ['dang nhap', 'login', 'log in', 'vao he thong'], ['mat khau', 'password', 'pass'], ['quen', 'mat', 'khong nho'],
  ['loi', 'bao loi', 'that bai', 'khong duoc', 'khong the', 'error', 'bi tu choi', 'tu choi'], ['the', 'card', 'the xpay'],
  ['zalo', 'tro ly zalo', 'chatbot'], ['tong dai', 'hotline', '1900 2189', 'call center', 'tong dai vien'], ['ticket', 'yeu cau dat xe'],
  ['uid', 'chip', 'ma chip'], ['qr', 'ma qr', 'pantoken', 'pan token'], ['nfc', 'cham the', 'quet the'], ['verify', 'xac minh', 'xac thuc', 'duyet doanh nghiep'],
  ['khoa the', 'lock the', 'tam khoa'], ['mat the', 'that lac the', 'roi the'], ['nhan vien', 'nguoi dung', 'user', 'thanh vien'],
  ['xoa', 'go', 'remove', 'delete'], ['them', 'tao', 'khoi tao', 'add'], ['sua', 'chinh sua', 'cap nhat', 'doi', 'edit'],
  ['thanh toan', 'tra tien', 'thu tien', 'payment'], ['kich hoat', 'active', 'activate'], ['bao cao', 'thong ke', 'report'], ['phoi the', 'in the', 'the vat ly'],
];
const SYNI: Record<string, string[]> = {}; SYN.forEach((g) => g.forEach((w) => (SYNI[w] = g)));
/* bỏ phần hỏi han, giữ ý chính */
const FILLER = /\b(lam sao de|lam sao|lam the nao|nhu the nao|the nao|cach nao|o dau|la gi|bi gi|vay|a|nhe|giup|toi|minh|em|anh|chi|cho hoi|hoi|muon|can|phai|duoc khong|co the|bang cach nao|huong dan)\b/g;
const STOP = new Set(['va', 'cua', 'la', 'thi', 'nhung', 'cac', 'mot', 'voi', 'de', 'nay', 'do', 'tu', 'den', 'cho', 'khi', 'ma', 'o', 'se', 'da', 'dang', 'bi', 'co', 'nao', 'gi', 'roi', 'nua', 'trong', 'tren', 'duoi', 'ra', 'vao', 'len', 'xuong']);
const ERR = /\b(loi|khong duoc|khong the|that bai|bao|sai|het|tu choi|mat|quen|khong co|bi|treo|cham|ket)\b/;

/** chia thư viện thành các đoạn tìm kiếm; gắn vị trí trong hành trình nếu có */
export function buildIndex(lib: Record<string, Pick<Guide, 'slug' | 'title' | 'sections'>>, J?: Journey, short?: Record<string, string>): Chunk[] {
  const at: Record<string, Chunk['at']> = {};
  J?.stages.forEach((st, k) => st.steps.forEach((x, p) => { const key = `${x.g}#${x.s}`; if (!at[key]) at[key] = { k, p, role: x.role, stage: st.title, color: st.color }; }));
  const out: Chunk[] = [];
  for (const g of Object.values(lib)) for (const s of g.sections) {
    const base = { g: g.slug, s: s.id, guide: short?.[g.slug] || g.title, title: s.title, group: s.group, at: at[`${g.slug}#${s.id}`] };
    const mk = (kind: Chunk['kind'], head: string, md: string, extra?: Partial<Chunk>) => { const text = plain(md); if (!text && !head) return;
      out.push({ ...base, id: `${g.slug}#${s.id}#${out.length}`, kind, head, text, f: fold(`${s.title} ${head} ${text}`), ft: fold(s.title), fh: fold(head), ...extra }); };
    // bảng tra lỗi: mỗi dòng một đoạn
    const tbl = s.md.split('\n').filter((l) => /^\|.*\|$/.test(l.trim()));
    if (tbl.length > 2 && /triệu chứng/i.test(tbl[0])) {
      const H = tbl[0].split('|').map((x) => fold(x).trim());
      const ix = (k: string) => H.findIndex((h) => h.includes(k));
      for (const row of tbl.slice(2)) { const c = row.split('|').map((x) => x.trim());
        const link = (row.match(/\]\(([^)]+)\)/) || [])[1];
        const sym = { who: plain(c[ix('ai gap')] || ''), symptom: plain(c[ix('trieu chung')] || ''), cause: plain(c[ix('nguyen nhan')] || ''), fix: plain(c[ix('cach xu ly')] || ''), link };
        mk('symptom', sym.symptom, `${sym.symptom}. Nguyên nhân: ${sym.cause}. Cách xử lý: ${sym.fix}`, { sym });
      }
      continue;
    }
    // chia theo tiêu đề nhỏ (### …) và câu hỏi in đậm (**…?**)
    const parts: { head: string; md: string; kind: Chunk['kind'] }[] = [{ head: '', md: '', kind: 'part' }];
    for (const line of s.md.split('\n')) {
      const h = line.match(/^#{2,4}\s+(.*)$/), q = line.match(/^\*\*(.+\?)\*\*\s*$/);
      if (h) parts.push({ head: plain(h[1]), md: '', kind: /^bước/i.test(plain(h[1])) ? 'step' : 'part' });
      else if (q) parts.push({ head: q[1].trim(), md: '', kind: 'faq' });
      else parts[parts.length - 1].md += line + '\n';
    }
    parts.forEach((p) => mk(p.kind, p.head, p.md));
  }
  return out;
}

/** mở rộng câu hỏi thành các cụm cần tìm (cụm gốc + đồng nghĩa) */
function expand(q: string): { terms: string[][]; err: boolean; phrase: string } {
  let f = fold(q).replace(/\s+/g, ' ').trim();
  const err = ERR.test(f);
  const phrase = f;
  f = f.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const toks = f.split(' ').filter(Boolean);
  const terms: string[][] = [], used = new Set<number>();
  // ưu tiên cụm dài khớp từ điển đồng nghĩa
  for (let n = 3; n >= 1; n--) for (let i = 0; i + n <= toks.length; i++) {
    if ([...Array(n).keys()].some((k) => used.has(i + k))) continue;
    const w = toks.slice(i, i + n).join(' ');
    if (SYNI[w]) { terms.push(SYNI[w]); for (let k = 0; k < n; k++) used.add(i + k); }
  }
  toks.forEach((w, i) => { if (!used.has(i) && !STOP.has(w) && w.length > 0) terms.push([w]); });
  return { terms, err, phrase };
}
const lev1 = (a: string, b: string) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; };
const has = (hay: string, w: string) => (` ${hay} `).includes(` ${w} `);
const count = (hay: string, w: string) => { let n = 0, i = -1; const H = ` ${hay} `, W = ` ${w} `; while ((i = H.indexOf(W, i + 1)) >= 0) n++; return n; };

export function search(idx: Chunk[], q: string, limit = 12): Hit[] {
  const { terms, err, phrase } = expand(q);
  if (!terms.length) return [];
  // sửa lỗi gõ: từ đơn không có trong dữ liệu → tìm từ gần nhất (sai 1 ký tự)
  const vocab = new Set<string>(); idx.forEach((c) => c.f.split(' ').forEach((w) => w.length > 3 && vocab.add(w)));
  const T = terms.map((alts) => { if (alts.length > 1 || alts[0].includes(' ') || vocab.has(alts[0]) || alts[0].length < 4) return alts; const fix = [...vocab].find((v) => lev1(alts[0], v)); return fix ? [alts[0], fix] : alts; });
  const N = idx.length, avg = idx.reduce((a, c) => a + c.f.split(' ').length, 0) / Math.max(1, N);
  const df = T.map((alts) => idx.filter((c) => alts.some((w) => has(c.f, w))).length);
  const hits: Hit[] = [];
  for (const c of idx) {
    let sc = 0, matched = 0; const tm: string[] = []; const len = c.f.split(' ').length;
    T.forEach((alts, i) => {
      let best = 0, bw = '';
      for (const w of alts) { const tf = count(c.f, w); if (!tf) continue;
        const idf = Math.log(1 + (N - df[i] + 0.5) / (df[i] + 0.5));
        let s = idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * len / avg));
        if (has(c.ft, w)) s *= 2.2; if (has(c.fh, w)) s *= 1.8;
        if (w !== alts[0]) s *= 0.85;
        if (s > best) { best = s; bw = w; } }
      if (best) { sc += best; matched++; tm.push(bw); }
    });
    if (!matched) continue;
    sc *= 0.35 + 0.65 * (matched / T.length) ** 1.5;            // ưu tiên đoạn khớp đủ ý
    if (phrase.length > 5 && c.f.includes(phrase)) sc *= 1.6;   // khớp nguyên cụm
    if (err && (c.kind === 'symptom' || c.kind === 'faq')) sc *= 1.5;
    if (c.kind === 'step') sc *= 1.08;
    hits.push({ c, score: sc, terms: tm });
  }
  hits.sort((a, b) => b.score - a.score);
  // mỗi mục tối đa 2 đoạn để kết quả đa dạng
  const per: Record<string, number> = {}, out: Hit[] = [];
  for (const h of hits) { const k = `${h.c.g}#${h.c.s}`; if ((per[k] = (per[k] || 0) + 1) > 2) continue; out.push(h); if (out.length >= limit) break; }
  return out;
}

/** đoạn trích quanh chỗ khớp nhiều từ nhất, tô sáng (trả về HTML đã escape) */
export function snippet(text: string, terms: string[], max = 180): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const f = fold(text); let best = 0, bs = 0;
  const pos: number[] = []; terms.forEach((w) => { let i = -1; while ((i = f.indexOf(w, i + 1)) >= 0) pos.push(i); });
  pos.forEach((p) => { const n = pos.filter((x) => x >= p && x < p + max).length; if (n > bs) { bs = n; best = p; } });
  const a = Math.max(0, best - 40), b = Math.min(text.length, a + max), seg = text.slice(a, b), fs = f.slice(a, b);
  const marks: [number, number][] = []; terms.forEach((w) => { let i = -1; while ((i = fs.indexOf(w, i + 1)) >= 0) if ((i === 0 || fs[i - 1] === ' ') && (fs[i + w.length] === undefined || fs[i + w.length] === ' ')) marks.push([i, i + w.length]); });
  marks.sort((x, y) => x[0] - y[0]); let h = '', at = 0;
  for (const [x, y] of marks) { if (x < at) continue; h += esc(seg.slice(at, x)) + '<mark>' + esc(seg.slice(x, y)) + '</mark>'; at = y; }
  return (a ? '…' : '') + h + esc(seg.slice(at)) + (b < text.length ? '…' : '');
}

/** tô sáng từ khoá trong 1 khối HTML đã hiển thị (giữ dấu: so trên chữ đã bỏ dấu, cùng độ dài) */
export function highlightDom(root: HTMLElement, terms: string[]) {
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
  while (walker.nextNode()) { const n = walker.currentNode as Text; if (n.data.trim() && !(n.parentElement?.closest('mark,script,style'))) nodes.push(n); }
  for (const n of nodes) {
    const t = n.data.normalize('NFC'), f = Array.from(t).map(foldChar).join(''); if (Array.from(t).length !== t.length) continue;
    const R: [number, number][] = []; terms.forEach((w) => { let i = -1; while ((i = f.indexOf(w, i + 1)) >= 0) if ((i === 0 || f[i - 1] === ' ') && (i + w.length >= f.length || f[i + w.length] === ' ')) R.push([i, i + w.length]); });
    if (!R.length) continue; R.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment(); let at = 0;
    for (const [a, b] of R) { if (a < at) continue; frag.append(t.slice(at, a)); const m = document.createElement('mark'); m.className = 'hd-hl'; m.textContent = t.slice(a, b); frag.append(m); at = b; }
    frag.append(t.slice(at)); n.replaceWith(frag);
  }
}
