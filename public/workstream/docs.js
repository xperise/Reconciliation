/* ==========================================================================
   XPERISE — TÀI LIỆU  ·  docs.js   (thay cho minutes.js)

   Một tab, hai tab con:
     1. Biên bản họp   — bảng meeting_minutes, bucket "minutes"   (giữ nguyên)
     2. Tài liệu khác  — bảng documents + doc_folders, bucket "documents"

   Phần biên bản họp giữ nguyên bảng và bucket cũ, nên dữ liệu đã nhập
   trước đây không mất và không phải chuyển đổi gì.

   Cần chạy migrate_v3.sql để có phần tài liệu khác.
   ========================================================================== */

/* ---------- CHỮ ---------- */
Object.assign(I18N.vi, {
  /* nhãn tab và tab con */
  dTab: "Tài liệu", dTabTip: "Biên bản họp và tài liệu lưu trữ",
  dEyebrow: "Lưu trữ", dTitle: "Tài liệu",
  dSubMinutes: "Biên bản họp", dSubFiles: "Tài liệu khác",
  dMinutesHint: "Mỗi biên bản gồm ngày họp, nội dung, thành phần và tệp đính kèm",

  /* --- biên bản họp: giữ nguyên bộ chữ cũ từ minutes.js --- */
  mNew: "Thêm biên bản",
  mDate: "Ngày họp", mSubject: "Nội dung cuộc họp", mAttendees: "Thành phần tham dự",
  mSummary: "Tóm tắt và kết luận",
  mSubjectPh: "Ví dụ: Họp rà soát tiến độ tuần",
  mAttendeesPh: "Ngăn cách bằng dấu phẩy",
  mSummaryPh: "Những điểm chính, quyết định và việc cần làm",
  mDropMain: "Kéo tệp vào đây, hoặc <button class='linkbtn' id='minutePick'>chọn từ máy</button>",
  mDropSub: "Nhận mọi định dạng, tối đa 20 MB",
  mSave: "Lưu biên bản", mDownload: "Tải về", mDelete: "Xóa",
  mEmpty: "Chưa có biên bản nào. Bấm \u201cThêm biên bản\u201d để bắt đầu.",
  mNeedDate: "Cần chọn ngày họp.", mNeedSubject: "Cần nhập nội dung cuộc họp.",
  mTooBig: "Tệp vượt quá 20 MB.",
  mSaved: "Đã lưu biên bản", mDeleted: "Đã xóa biên bản",
  mSaveFail: e => `Lưu không thành công: ${e}`,
  mConfirmDelete: name => `Xóa biên bản "${name}"? Thao tác này không hoàn tác được.`,
  mNoFile: "Không đính kèm tệp", mSaving: "Đang lưu…",
  mAttendeesLabel: "Tham dự",
  mTableMissing: "Chưa có bảng biên bản họp. Chạy migrate_v2.sql rồi tải lại trang.",
  mNeedDb: "Chưa nối Supabase — phần biên bản họp cần kết nối để hoạt động.",

  /* tài liệu khác */
  dSearchPh: "Tìm theo tên tài liệu…",
  dNewFolder: "Thư mục mới", dUpload: "Tải tệp lên",
  dDropMain: "Thả tệp vào đây để tải lên",
  dDropSub: "Nhiều tệp cùng lúc cũng được · tối đa 20 MB mỗi tệp",
  dRoot: "Tất cả tài liệu",
  dFolderCount: n => n === 1 ? "1 tài liệu" : `${n} tài liệu`,
  dEmptyRoot: "Chưa có tài liệu nào. Tạo thư mục hoặc tải tệp lên để bắt đầu.",
  dEmptyFolder: "Thư mục này còn trống. Tải tệp lên hoặc kéo tệp vào đây.",
  dNoMatch: "Không có tài liệu nào khớp với từ khóa.",
  dFolderName: "Tên thư mục",
  dFolderPrompt: "Đặt tên cho thư mục mới:",
  dFolderExists: "Đã có thư mục trùng tên",
  dFolderCreated: n => `Đã tạo thư mục "${n}"`,
  dFolderRename: "Đổi tên", dFolderDelete: "Xóa thư mục",
  dFolderRenamePrompt: "Tên mới cho thư mục:",
  dFolderDeleteConfirm: (n, c) => c
    ? `Xóa thư mục "${n}"?\n\n${c} tài liệu bên trong sẽ được chuyển ra ngoài, không bị xóa.`
    : `Xóa thư mục "${n}"?`,
  dFolderDeleted: "Đã xóa thư mục",
  dMoveTo: "Chuyển vào thư mục", dMoveRoot: "— để ngoài thư mục —",
  dMoved: "Đã chuyển tài liệu",
  dUploading: n => `Đang tải lên ${n} tệp…`,
  dUploaded: n => n === 1 ? "Đã tải lên 1 tệp" : `Đã tải lên ${n} tệp`,
  dUploadFail: (f, e) => `Không tải được "${f}": ${e}`,
  dTooBig: f => `"${f}" vượt quá 20 MB`,
  dDocDelete: "Xóa", dDocDownload: "Tải về",
  dDocDeleteConfirm: n => `Xóa "${n}"? Thao tác này không hoàn tác được.`,
  dDocDeleted: "Đã xóa tài liệu",
  dUploadedOn: "Tải lên",
  dTableMissing: "Chưa có bảng tài liệu. Chạy migrate_v3.sql rồi tải lại trang.",
  dNeedDb: "Chưa nối Supabase — phần tài liệu cần kết nối để hoạt động.",
  dCopySql: "Sao chép SQL tạo bảng", dSqlCopied: "Đã sao chép SQL"
});

Object.assign(I18N.en, {
  dTab: "Documents", dTabTip: "Meeting minutes and stored documents",
  dEyebrow: "Archive", dTitle: "Documents",
  dSubMinutes: "Meeting minutes", dSubFiles: "Other documents",
  dMinutesHint: "Each entry holds the date, subject, attendees and an attached file",

  /* --- meeting minutes: strings carried over from minutes.js --- */
  mNew: "Add minutes",
  mDate: "Meeting date", mSubject: "Subject", mAttendees: "Attendees",
  mSummary: "Summary and decisions",
  mSubjectPh: "e.g. Weekly progress review",
  mAttendeesPh: "Separate names with commas",
  mSummaryPh: "Key points, decisions and actions",
  mDropMain: "Drop a file here, or <button class='linkbtn' id='minutePick'>choose from your computer</button>",
  mDropSub: "Any format, up to 20 MB",
  mSave: "Save minutes", mDownload: "Download", mDelete: "Delete",
  mEmpty: "No minutes yet. Press \u201cAdd minutes\u201d to start.",
  mNeedDate: "Please choose the meeting date.", mNeedSubject: "Please enter the subject.",
  mTooBig: "The file is larger than 20 MB.",
  mSaved: "Minutes saved", mDeleted: "Minutes deleted",
  mSaveFail: e => `Save failed: ${e}`,
  mConfirmDelete: name => `Delete "${name}"? This cannot be undone.`,
  mNoFile: "No file attached", mSaving: "Saving…",
  mAttendeesLabel: "Attendees",
  mTableMissing: "The minutes table is missing. Run migrate_v2.sql and reload.",
  mNeedDb: "Supabase is not connected — meeting minutes need it to work.",

  dSearchPh: "Search documents…",
  dNewFolder: "New folder", dUpload: "Upload files",
  dDropMain: "Drop files here to upload",
  dDropSub: "Several at once is fine · up to 20 MB each",
  dRoot: "All documents",
  dFolderCount: n => n === 1 ? "1 document" : `${n} documents`,
  dEmptyRoot: "No documents yet. Create a folder or upload files to start.",
  dEmptyFolder: "This folder is empty. Upload files or drop them here.",
  dNoMatch: "No documents match that search.",
  dFolderName: "Folder name",
  dFolderPrompt: "Name for the new folder:",
  dFolderExists: "A folder with that name already exists",
  dFolderCreated: n => `Folder "${n}" created`,
  dFolderRename: "Rename", dFolderDelete: "Delete folder",
  dFolderRenamePrompt: "New name for the folder:",
  dFolderDeleteConfirm: (n, c) => c
    ? `Delete the "${n}" folder?\n\n${c} documents inside will move out of it, not be deleted.`
    : `Delete the "${n}" folder?`,
  dFolderDeleted: "Folder deleted",
  dMoveTo: "Move to folder", dMoveRoot: "— outside any folder —",
  dMoved: "Document moved",
  dUploading: n => `Uploading ${n} files…`,
  dUploaded: n => n === 1 ? "1 file uploaded" : `${n} files uploaded`,
  dUploadFail: (f, e) => `Could not upload "${f}": ${e}`,
  dTooBig: f => `"${f}" is larger than 20 MB`,
  dDocDelete: "Delete", dDocDownload: "Download",
  dDocDeleteConfirm: n => `Delete "${n}"? This cannot be undone.`,
  dDocDeleted: "Document deleted",
  dUploadedOn: "Uploaded",
  dTableMissing: "The documents tables are missing. Run migrate_v3.sql and reload.",
  dNeedDb: "Supabase is not connected — documents need it to work.",
  dCopySql: "Copy setup SQL", dSqlCopied: "SQL copied"
});

const SQL_DOCS = `-- Xperise Workstream Intelligence — documents layer
create table if not exists public.doc_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid references public.doc_folders(id) on delete set null,
  title       text not null,
  file_path   text not null,
  file_name   text,
  file_size   bigint,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create index if not exists documents_folder_idx on public.documents(folder_id);

alter table public.doc_folders disable row level security;
alter table public.documents   disable row level security;`;


const Docs = (function () {

  const D = {
    sb: null, bound: false, loaded: false,
    pane: "minutes",          // tab con đang mở
    minutes: [],              // biên bản họp
    folders: [], files: [],   // tài liệu khác
    folderId: null,           // null = đang ở ngoài cùng
    q: "",                    // từ khóa tìm
    hasDocs: true,            // bảng documents đã tồn tại chưa
    minuteFile: null
  };

  const MAX_FILE = 20 * 1024 * 1024;
  const q = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  function note(msg, kind) {
    if (typeof toast === "function") toast(msg, kind || "ok");
    else console.log(msg);
  }
  const fmtDay = d => new Date(d).toLocaleDateString("en-GB",
    { day: "2-digit", month: "short", year: "numeric" });

  /* Biểu tượng theo đuôi tệp — nhìn lướt là biết loại tài liệu. */
  function fileIcon(name) {
    const e = String(name || "").split(".").pop().toLowerCase();
    if (["pdf"].includes(e))                      return ["bi-file-earmark-pdf", "#E11D48"];
    if (["doc", "docx", "rtf"].includes(e))       return ["bi-file-earmark-word", "#2563EB"];
    if (["xls", "xlsx", "csv"].includes(e))       return ["bi-file-earmark-spreadsheet", "#0D9488"];
    if (["ppt", "pptx"].includes(e))              return ["bi-file-earmark-slides", "#EA8C0B"];
    if (["png","jpg","jpeg","gif","webp","svg"].includes(e)) return ["bi-file-earmark-image", "#A855F7"];
    if (["zip", "rar", "7z"].includes(e))         return ["bi-file-earmark-zip", "#8A968F"];
    return ["bi-file-earmark", "#8A968F"];
  }

  function init(sbClient) { D.sb = sbClient || null; }

  function enter() {
    bindOnce();
    if (!D.loaded) { D.loaded = true; loadMinutes(); loadDocs(); }
  }

  function load() {
    return Promise.all([loadMinutes(), loadDocs()]);
  }

  /** Vẽ lại bằng dữ liệu sẵn có — dùng khi đổi ngôn ngữ. */
  function relabel() {
    resetMinuteForm();
    renderMinutes();
    renderDocs();
  }

  /* ======================================================================
     TAB CON 1 — BIÊN BẢN HỌP  (giữ nguyên bảng và bucket cũ)
     ====================================================================== */

  async function loadMinutes() {
    const host = q("minuteList");
    if (!host) return;
    if (!D.sb) { host.innerHTML = `<p class="minute-empty">${t("mNeedDb")}</p>`; return; }

    const { data, error } = await D.sb.from("meeting_minutes")
      .select("*").order("meeting_date", { ascending: false });
    if (error) {
      host.innerHTML = `<p class="minute-empty">${t("mTableMissing")}</p>`;
      return;
    }
    D.minutes = data || [];
    renderMinutes();
    updateCount();
  }

  function renderMinutes() {
    const host = q("minuteList");
    if (!host || !D.sb) return;
    if (!D.minutes.length) { host.innerHTML = `<p class="minute-empty">${t("mEmpty")}</p>`; return; }

    host.innerHTML = D.minutes.map(m => {
      const url = m.file_path
        ? D.sb.storage.from("minutes").getPublicUrl(m.file_path).data.publicUrl : null;
      const d = new Date(m.meeting_date + "T00:00:00");
      return `<article class="minute">
        <div class="minute-date">
          <b>${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</b>
          <span>${d.getFullYear()}</span>
        </div>
        <div class="minute-body">
          <h3 class="minute-title">${esc(m.title)}</h3>
          ${m.attendees ? `<p class="minute-att"><span>${t("mAttendeesLabel")}:</span> ${esc(m.attendees)}</p>` : ""}
          ${m.summary ? `<p class="minute-sum">${esc(m.summary)}</p>` : ""}
          <div class="minute-foot">
            ${url
              ? `<a class="btn btn-ghost btn-sm" href="${url}" download="${esc(m.file_name || "")}" target="_blank" rel="noopener">
                   <i class="bi bi-download"></i> ${t("mDownload")}
                   <span class="minute-fname">${esc(m.file_name || "")}${m.file_size ? " · " + kb(m.file_size) : ""}</span>
                 </a>`
              : `<span class="minute-nofile">${t("mNoFile")}</span>`}
            <button class="linkbtn minute-del" data-id="${m.id}"
              data-path="${esc(m.file_path || "")}" data-name="${esc(m.title)}">${t("mDelete")}</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function resetMinuteForm() {
    D.minuteFile = null;
    ["mDate", "mSubject", "mAttendees", "mSummary"].forEach(id => { if (q(id)) q(id).value = ""; });
    if (q("minuteDropMain")) q("minuteDropMain").innerHTML = t("mDropMain");
    bindMinutePick();
    if (q("minuteFile")) q("minuteFile").value = "";
  }

  async function saveMinute() {
    if (!D.sb) return note(t("mNeedDb"), "warn");
    const date = q("mDate").value, title = q("mSubject").value.trim();
    if (!date)  return note(t("mNeedDate"), "warn");
    if (!title) return note(t("mNeedSubject"), "warn");

    const btn = q("btnMinuteSave"); btn.disabled = true;
    const label = btn.textContent; btn.textContent = t("mSaving");
    try {
      let path = null, fname = null, fsize = null;
      if (D.minuteFile) {
        const safe = D.minuteFile.name.replace(/[^\w.\-]+/g, "_");
        path = `${date}/${Date.now()}_${safe}`;
        const { error: eUp } = await D.sb.storage.from("minutes")
          .upload(path, D.minuteFile, { upsert: false });
        if (eUp) throw eUp;
        fname = D.minuteFile.name; fsize = D.minuteFile.size;
      }
      const { error } = await D.sb.from("meeting_minutes").insert({
        meeting_date: date, title,
        attendees: q("mAttendees").value.trim() || null,
        summary: q("mSummary").value.trim() || null,
        file_path: path, file_name: fname, file_size: fsize,
        uploaded_by: "dashboard"
      });
      if (error) throw error;
      note(t("mSaved"), "ok");
      q("minuteForm").classList.add("d-none");
      resetMinuteForm();
      loadMinutes();
    } catch (e) {
      note(t("mSaveFail")(e.message || e), "err");
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  async function deleteMinute(id, path, name) {
    if (!window.confirm(t("mConfirmDelete")(name))) return;
    try {
      if (path) await D.sb.storage.from("minutes").remove([path]);
      const { error } = await D.sb.from("meeting_minutes").delete().eq("id", id);
      if (error) throw error;
      note(t("mDeleted"), "ok");
      loadMinutes();
    } catch (e) {
      note(t("mSaveFail")(e.message || e), "err");
    }
  }

  function bindMinutePick() {
    const p = q("minutePick");
    if (p) p.addEventListener("click", () => q("minuteFile").click());
  }

  function pickedMinuteFile(f) {
    if (!f) return;
    if (f.size > MAX_FILE) return note(t("mTooBig"), "warn");
    D.minuteFile = f;
    q("minuteDropMain").innerHTML =
      `<i class="bi bi-file-earmark-check"></i> ${esc(f.name)} · ${kb(f.size)}`;
  }

  /* ======================================================================
     TAB CON 2 — TÀI LIỆU KHÁC (có thư mục)
     ====================================================================== */

  async function loadDocs() {
    if (!D.sb) { D.hasDocs = false; renderDocs(); return; }

    const [fr, dr] = await Promise.all([
      D.sb.from("doc_folders").select("*").order("name"),
      D.sb.from("documents").select("*").order("uploaded_at", { ascending: false })
    ]);

    // Thiếu bảng thì báo rõ và chặn thao tác, không giữ tạm trong bộ nhớ rồi
    // để người dùng tưởng đã lưu — mất dữ liệu âm thầm là kiểu hỏng tệ nhất.
    if (fr.error || dr.error) { D.hasDocs = false; renderDocs(); return; }

    D.hasDocs = true;
    D.folders = fr.data || [];
    D.files   = dr.data || [];
    if (D.folderId && !D.folders.some(f => f.id === D.folderId)) D.folderId = null;
    renderDocs();
    updateCount();
  }

  const countIn = fid => D.files.filter(f => (f.folder_id || null) === fid).length;

  function renderDocs() {
    const host = q("docBody");
    if (!host) return;

    if (!D.sb)      { host.innerHTML = `<p class="minute-empty">${t("dNeedDb")}</p>`; hideDocTools(); return; }
    if (!D.hasDocs) {
      host.innerHTML = `<div class="doc-blocked">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <div><div>${esc(t("dTableMissing"))}</div>
          <button type="button" class="linkbtn" id="btnDocSql">${esc(t("dCopySql"))}</button></div>
        </div>`;
      hideDocTools();
      const b = q("btnDocSql");
      if (b) b.addEventListener("click", () => {
        navigator.clipboard.writeText(SQL_DOCS)
          .then(() => note(t("dSqlCopied"), "ok"), () => note(t("sqlCopyFail") || "", "err"));
      });
      return;
    }
    showDocTools();
    renderCrumb();

    const term = D.q.trim().toLowerCase();

    /* Đang tìm kiếm: bỏ qua thư mục, quét toàn bộ tài liệu. Người dùng tìm
       thứ họ không nhớ để ở đâu — giới hạn trong thư mục hiện tại sẽ vô dụng. */
    if (term) {
      const hits = D.files.filter(f =>
        String(f.title || "").toLowerCase().includes(term) ||
        String(f.file_name || "").toLowerCase().includes(term));
      host.innerHTML = hits.length
        ? `<div class="doc-grid">${hits.map(fileCard).join("")}</div>`
        : `<p class="minute-empty">${t("dNoMatch")}</p>`;
      return;
    }

    let html = "";

    // Ngoài cùng thì hiện các thư mục trước, rồi tới tệp rời
    if (D.folderId === null && D.folders.length) {
      html += `<div class="folder-grid">${D.folders.map(f => `
        <div class="folder" data-folder="${esc(f.id)}">
          <i class="bi bi-folder-fill folder-ico"></i>
          <div class="folder-body">
            <div class="folder-name">${esc(f.name)}</div>
            <div class="folder-meta">${esc(t("dFolderCount")(countIn(f.id)))}</div>
          </div>
          <div class="folder-acts">
            <button class="icon-btn" data-ren="${esc(f.id)}" title="${esc(t("dFolderRename"))}"><i class="bi bi-pencil"></i></button>
            <button class="icon-btn danger" data-delf="${esc(f.id)}" title="${esc(t("dFolderDelete"))}"><i class="bi bi-trash3"></i></button>
          </div>
        </div>`).join("")}</div>`;
    }

    const here = D.files.filter(f => (f.folder_id || null) === D.folderId);
    if (here.length) {
      html += `<div class="doc-grid">${here.map(fileCard).join("")}</div>`;
    } else if (D.folderId !== null) {
      html += `<p class="minute-empty">${t("dEmptyFolder")}</p>`;
    } else if (!D.folders.length) {
      html += `<p class="minute-empty">${t("dEmptyRoot")}</p>`;
    }

    host.innerHTML = html;
  }

  function fileCard(f) {
    const [ico, col] = fileIcon(f.file_name || f.title);
    const url = D.sb.storage.from("documents").getPublicUrl(f.file_path).data.publicUrl;
    const opts = [`<option value="">${esc(t("dMoveRoot"))}</option>`]
      .concat(D.folders.map(fo =>
        `<option value="${esc(fo.id)}"${(f.folder_id || "") === fo.id ? " selected" : ""}>${esc(fo.name)}</option>`))
      .join("");
    return `<article class="doc">
      <i class="bi ${ico} doc-ico" style="color:${col}"></i>
      <div class="doc-body">
        <div class="doc-name" title="${esc(f.title)}">${esc(f.title)}</div>
        <div class="doc-meta">${f.file_size ? kb(f.file_size) + " · " : ""}${t("dUploadedOn")} ${fmtDay(f.uploaded_at)}</div>
        <select class="doc-move" data-move="${esc(f.id)}" title="${esc(t("dMoveTo"))}">${opts}</select>
      </div>
      <div class="doc-acts">
        <a class="icon-btn" href="${url}" download="${esc(f.file_name || "")}" target="_blank"
           rel="noopener" title="${esc(t("dDocDownload"))}"><i class="bi bi-download"></i></a>
        <button class="icon-btn danger" data-deld="${esc(f.id)}" data-path="${esc(f.file_path)}"
                data-name="${esc(f.title)}" title="${esc(t("dDocDelete"))}"><i class="bi bi-trash3"></i></button>
      </div>
    </article>`;
  }

  function renderCrumb() {
    const c = q("docCrumb");
    if (!c) return;
    if (D.folderId === null) { c.innerHTML = ""; c.classList.add("d-none"); return; }
    const f = D.folders.find(x => x.id === D.folderId);
    c.classList.remove("d-none");
    c.innerHTML = `<button class="linkbtn" id="crumbRoot"><i class="bi bi-arrow-left"></i> ${esc(t("dRoot"))}</button>
      <span class="crumb-sep">/</span><span class="crumb-here">${esc(f ? f.name : "")}</span>`;
    q("crumbRoot").addEventListener("click", () => { D.folderId = null; renderDocs(); });
  }

  function hideDocTools() {
    ["btnNewFolder", "btnDocUpload"].forEach(id => { if (q(id)) q(id).disabled = true; });
    if (q("docDrop")) q("docDrop").classList.add("d-none");
  }
  function showDocTools() {
    ["btnNewFolder", "btnDocUpload"].forEach(id => { if (q(id)) q(id).disabled = false; });
  }

  async function createFolder() {
    const name = (window.prompt(t("dFolderPrompt")) || "").trim();
    if (!name) return;
    if (D.folders.some(f => f.name.toLowerCase() === name.toLowerCase()))
      return note(t("dFolderExists"), "err");

    const { error } = await D.sb.from("doc_folders").insert({ name });
    if (error) return note(t("mSaveFail")(error.message), "err");
    note(t("dFolderCreated")(name), "ok");
    loadDocs();
  }

  async function renameFolder(id) {
    const f = D.folders.find(x => x.id === id);
    if (!f) return;
    const name = (window.prompt(t("dFolderRenamePrompt"), f.name) || "").trim();
    if (!name || name === f.name) return;
    if (D.folders.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
      return note(t("dFolderExists"), "err");

    const { error } = await D.sb.from("doc_folders").update({ name }).eq("id", id);
    if (error) return note(t("mSaveFail")(error.message), "err");
    loadDocs();
  }

  /** Xóa thư mục KHÔNG xóa tài liệu — khóa ngoại đặt on delete set null,
      nên tệp bên trong tự chuyển ra ngoài cùng. */
  async function deleteFolder(id) {
    const f = D.folders.find(x => x.id === id);
    if (!f) return;
    if (!window.confirm(t("dFolderDeleteConfirm")(f.name, countIn(id)))) return;

    const { error } = await D.sb.from("doc_folders").delete().eq("id", id);
    if (error) return note(t("mSaveFail")(error.message), "err");
    if (D.folderId === id) D.folderId = null;
    note(t("dFolderDeleted"), "ok");
    loadDocs();
  }

  async function moveDoc(id, folderId) {
    const { error } = await D.sb.from("documents")
      .update({ folder_id: folderId || null }).eq("id", id);
    if (error) return note(t("mSaveFail")(error.message), "err");
    note(t("dMoved"), "ok");
    loadDocs();
  }

  async function deleteDoc(id, path, name) {
    if (!window.confirm(t("dDocDeleteConfirm")(name))) return;
    try {
      if (path) await D.sb.storage.from("documents").remove([path]);
      const { error } = await D.sb.from("documents").delete().eq("id", id);
      if (error) throw error;
      note(t("dDocDeleted"), "ok");
      loadDocs();
    } catch (e) {
      note(t("mSaveFail")(e.message || e), "err");
    }
  }

  let uploading = false;

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || uploading || !D.hasDocs) return;

    uploading = true;
    if (files.length > 1) note(t("dUploading")(files.length));
    let ok = 0;

    for (const file of files) {
      if (file.size > MAX_FILE) { note(t("dTooBig")(file.name), "err"); continue; }
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${D.folderId || "root"}/${Date.now()}_${safe}`;
        const { error: eUp } = await D.sb.storage.from("documents")
          .upload(path, file, { upsert: false });
        if (eUp) throw eUp;

        const { error } = await D.sb.from("documents").insert({
          folder_id: D.folderId, title: file.name,
          file_path: path, file_name: file.name, file_size: file.size,
          uploaded_by: "dashboard"
        });
        if (error) throw error;
        ok++;
      } catch (e) {
        note(t("dUploadFail")(file.name, e.message || e), "err");
      }
    }

    uploading = false;
    if (ok) { note(t("dUploaded")(ok), "ok"); loadDocs(); }
    if (q("docFile")) q("docFile").value = "";
  }

  /* ======================================================================
     CHUNG
     ====================================================================== */

  function switchPane(name) {
    D.pane = name;
    document.querySelectorAll("#docSeg .seg-btn")
      .forEach(b => b.classList.toggle("is-active", b.dataset.doc === name));
    q("docPaneMinutes").classList.toggle("d-none", name !== "minutes");
    q("docPaneFiles").classList.toggle("d-none", name !== "files");
  }

  /** Số trên nhãn tab = biên bản + tài liệu, vì tab gộp cả hai. */
  function updateCount() {
    const c = q("tabCountDocs");
    if (c) c.textContent = D.minutes.length + D.files.length;
  }

  function bindOnce() {
    if (D.bound) return; D.bound = true;
    resetMinuteForm();

    /* --- chuyển tab con --- */
    q("docSeg").addEventListener("click", e => {
      const b = e.target.closest(".seg-btn");
      if (b) switchPane(b.dataset.doc);
    });

    /* --- biên bản họp --- */
    q("btnNewMinute").addEventListener("click", () => {
      const f = q("minuteForm");
      f.classList.toggle("d-none");
      if (!f.classList.contains("d-none")) {
        if (!q("mDate").value) q("mDate").value = new Date().toISOString().slice(0, 10);
        q("mSubject").focus();
      }
    });
    q("btnMinuteCancel").addEventListener("click", () => {
      q("minuteForm").classList.add("d-none"); resetMinuteForm();
    });
    q("btnMinuteSave").addEventListener("click", saveMinute);
    q("minuteFile").addEventListener("change", e => pickedMinuteFile(e.target.files[0]));

    const md = q("minuteDrop");
    ["dragenter", "dragover"].forEach(ev => md.addEventListener(ev, e => {
      e.preventDefault(); md.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach(ev => md.addEventListener(ev, e => {
      e.preventDefault(); md.classList.remove("is-over");
    }));
    md.addEventListener("drop", e => pickedMinuteFile(e.dataTransfer.files[0]));

    q("minuteList").addEventListener("click", e => {
      const b = e.target.closest(".minute-del");
      if (b) deleteMinute(b.dataset.id, b.dataset.path, b.dataset.name);
    });

    /* --- tài liệu khác --- */
    q("btnNewFolder").addEventListener("click", createFolder);
    q("btnDocUpload").addEventListener("click", () => q("docFile").click());
    q("docFile").addEventListener("change", e => uploadFiles(e.target.files));

    let timer;
    q("docSearch").addEventListener("input", e => {
      clearTimeout(timer);
      timer = setTimeout(() => { D.q = e.target.value; renderDocs(); }, 160);
    });

    q("docBody").addEventListener("click", e => {
      const open = e.target.closest("[data-folder]");
      const ren  = e.target.closest("[data-ren]");
      const delf = e.target.closest("[data-delf]");
      const deld = e.target.closest("[data-deld]");
      if (ren)  { e.stopPropagation(); return renameFolder(ren.dataset.ren); }
      if (delf) { e.stopPropagation(); return deleteFolder(delf.dataset.delf); }
      if (deld) { e.stopPropagation(); return deleteDoc(deld.dataset.deld, deld.dataset.path, deld.dataset.name); }
      if (open) { D.folderId = open.dataset.folder; D.q = ""; q("docSearch").value = ""; renderDocs(); }
    });
    q("docBody").addEventListener("change", e => {
      const m = e.target.closest("[data-move]");
      if (m) moveDoc(m.dataset.move, m.value);
    });

    /* --- thả tệp vào bất kỳ đâu trong khu tài liệu --- */
    const pane = q("docPaneFiles"), drop = q("docDrop");
    ["dragenter", "dragover"].forEach(ev => pane.addEventListener(ev, e => {
      if (!D.hasDocs) return;
      e.preventDefault(); drop.classList.remove("d-none"); drop.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach(ev => pane.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === "drop" || !pane.contains(e.relatedTarget)) {
        drop.classList.add("d-none"); drop.classList.remove("is-over");
      }
    }));
    pane.addEventListener("drop", e => { if (D.hasDocs) uploadFiles(e.dataTransfer.files); });
  }

  return {
    init, load, enter, relabel,
    count: () => D.minutes.length + D.files.length
  };
})();

/* Giữ tên cũ để mọi lời gọi Minutes.* trong app.js vẫn chạy. */
const Minutes = Docs;
