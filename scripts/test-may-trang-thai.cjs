const ts=require("/tmp/node_modules/typescript"),fs=require("fs");
const tr=(f,o)=>{const r=ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:1,target:99}}); fs.writeFileSync(o,r.outputText);};
tr("../src/lib/tuan-thu/cau-hinh.ts","/tmp/mt-tests/cau-hinh.js");
tr("../src/lib/tuan-thu/may-trang-thai.ts","/tmp/mt-tests/may-trang-thai.js");
const M=require("/tmp/mt-tests/may-trang-thai.js"), C=require("/tmp/mt-tests/cau-hinh.js");
const cfg=JSON.parse(JSON.stringify(C.CAU_HINH_MAC_DINH));
const tv={ke_toan:["u1"],demand:["u2"],supply:["u3"],ceo:["u4"]};
let fails=0; const ok=(c,n)=>{console.log(c?"OK  ":"FAIL",n); if(!c) fails++;};
// Hành vi cũ: cho_ke_toan --(kế toán duyệt)--> cho_ceo --(CEO duyệt)--> da_gui
ok(M.nhomCho(cfg).join()==="1,3","nhóm chờ mặc định = 1 và 3 (demand/supply không chờ)");
let s="cho_ke_toan";
ok(M.coTheDuyet(cfg,s,"ke_toan") && !M.coTheDuyet(cfg,s,"ceo"),"ở chờ kế toán: kế toán duyệt, CEO không");
ok(M.coTheKiemSoat(cfg,s,"demand","chan") && !M.coTheKiemSoat(cfg,s,"ke_toan","chan"),"demand chặn được, kế toán không");
s=M.buocTiep(cfg,s,[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"}],tv); ok(s==="cho_ceo","kế toán duyệt → chờ CEO (cho_nhom_2)");
ok(M.coTheDuyet(cfg,s,"ceo") && !M.coTheDuyet(cfg,s,"ke_toan"),"ở chờ CEO: CEO duyệt, kế toán không");
s=M.buocTiep(cfg,s,[{roleKey:"ceo",quyet_dinh:"duyet",nguoi:"u4"}],tv); ok(s==="da_gui","CEO duyệt → đã gửi");
// Trạng thái cũ vẫn đọc được
ok(M.nhomHienTai(cfg,"cho_ceo")===3 && M.nhomHienTai(cfg,"cho_ke_toan")===1,"đọc được trạng thái cũ cho_ceo, cho_ke_toan");
// Trả về không đổi nhóm (xử lý ở duyetBuoc); chặn không gọi buocTiep
// Nhóm nhiều bước song song: cả hai phải duyệt (mặc định mode any)
const c2=JSON.parse(JSON.stringify(cfg));
c2.buoc.push({key:"ke_toan_2",thuTu:2,roleKey:"supply",mode:"any",ketQua:["duyet","tra_ve"],nhom:2});
c2.buoc.find(b=>b.key==="demand_kiem_soat").nhom=2; c2.buoc.find(b=>b.key==="supply_kiem_soat").nhom=2;
c2.buoc.find(b=>b.key==="demand_kiem_soat").ketQua=["duyet","chan","tra_ve"];
ok(M.nhomCho(c2).join()==="1,2,3","3 nhóm chờ khi nhóm 2 có bước duyệt");
let s2=M.buocTiep(c2,"cho_ke_toan",[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"}],tv);
ok(s2==="cho_nhom_2","sang nhóm 2");
let s3=M.buocTiep(c2,s2,[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"},{roleKey:"demand",quyet_dinh:"duyet",nguoi:"u2"}],tv);
ok(s3==="cho_nhom_2","nhóm 2 chưa xong khi supply chưa duyệt (cùng nhóm)");
ok(M.buocTiep(c2,s3,[{roleKey:"demand",quyet_dinh:"duyet",nguoi:"u2"},{roleKey:"supply",quyet_dinh:"duyet",nguoi:"u3"}],tv)==="cho_nhom_3","nhóm 2 xong khi cả hai duyệt → nhóm 3");
// Chế độ "tất cả": mọi thành viên của role phải duyệt
const c3=JSON.parse(JSON.stringify(cfg)); c3.buoc.find(b=>b.key==="ke_toan_duyet").mode="all";
const tv3={...tv, ke_toan:["u1","u5"]};
ok(M.buocTiep(c3,"cho_ke_toan",[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"}],tv3)==="cho_ke_toan","chế độ tất cả: thiếu một người thì chưa xong");
ok(M.buocTiep(c3,"cho_ke_toan",[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"},{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u5"}],tv3)==="cho_ceo","chế độ tất cả: đủ người thì xong");
// Người cụ thể
const c4=JSON.parse(JSON.stringify(cfg)); c4.buoc.find(b=>b.key==="ceo_duyet").nguoi="u9";
ok(M.buocTiep(c4,"cho_ceo",[{roleKey:"ceo",quyet_dinh:"duyet",nguoi:"u4"}],tv)==="cho_ceo","bước có người cụ thể: người khác duyệt không tính");
ok(M.buocTiep(c4,"cho_ceo",[{roleKey:"ceo",quyet_dinh:"duyet",nguoi:"u9"}],tv)==="da_gui","bước có người cụ thể: đúng người duyệt → xong");
console.log(fails?`\n${fails} FAIL`:"\nALL PASS");

// --- Quorum sửa đổi theo bước ---
{
  const q=(n,c)=>{ if(!c){console.log("FAIL",n); process.exitCode=1;} else console.log("OK  ",n); };
  const cfg2=JSON.parse(JSON.stringify(C.CAU_HINH_MAC_DINH));
  const tv2={ke_toan:["u1"],demand:["u2"],supply:["u3"],ceo:["u4"]};
  const all=[{roleKey:"ke_toan",nguoi:"u1"},{roleKey:"demand",nguoi:"u2"},{roleKey:"supply",nguoi:"u3"},{roleKey:"ceo",nguoi:"u4"}];
  q("mặc định: cần đủ bốn role như trước", M.quorumSuaDoiDat(cfg2, all, tv2) && !M.quorumSuaDoiDat(cfg2, all.slice(0,3), tv2));
  const c5=JSON.parse(JSON.stringify(cfg2));
  c5.buoc.find(b=>b.key==="demand_kiem_soat").suaDoi=false; c5.buoc.find(b=>b.key==="supply_kiem_soat").suaDoi=false;
  q("chỉ chọn kế toán và CEO: hai người là đủ", M.quorumSuaDoiDat(c5, [all[0], all[3]], tv2));
  q("chỉ chọn kế toán và CEO: thiếu CEO thì chưa", !M.quorumSuaDoiDat(c5, [all[0]], tv2));
  const c6=JSON.parse(JSON.stringify(cfg2)); c6.buoc.forEach(b=>b.suaDoi=false);
  q("không bước nào được chọn: không thông qua", !M.quorumSuaDoiDat(c6, all, tv2));
  const c7=JSON.parse(JSON.stringify(c5)); c7.buoc.find(b=>b.key==="ke_toan_duyet").mode="all";
  const tv7={...tv2, ke_toan:["u1","u5"]};
  q("chế độ tất cả trong bước: thiếu một thành viên thì chưa", !M.quorumSuaDoiDat(c7, [all[0], all[3]], tv7));
}

// --- Yêu cầu duyệt và chạy khi (SQL 61) ---
{
  const q=(n,c)=>{ if(!c){console.log("FAIL",n); process.exitCode=1;} else console.log("OK  ",n); };
  const base=JSON.parse(JSON.stringify(C.CAU_HINH_MAC_DINH));
  const tv={ke_toan:["u1"],demand:["u2"],supply:["u3"],ceo:["u4"]};
  const ketThuc=[{roleKey:"ke_toan",quyet_dinh:"duyet",nguoi:"u1"}];
  const set=(c,key,f)=>{ Object.assign(c.buoc.find(b=>b.key===key),f); return c; };
  const sach={coCanhBaoChan:false,coNgoaiLe:false,tongTien:100,nguongTien:500};
  const cot={coCanhBaoChan:true,coNgoaiLe:false,tongTien:100,nguongTien:500};
  const vuot={coCanhBaoChan:false,coNgoaiLe:false,tongTien:600,nguongTien:500};
  // Demand chỉ chạy khi có cảnh báo chặn gửi
  const c1=set(JSON.parse(JSON.stringify(base)),"demand_kiem_soat",{chayKhi:"canh_bao_chan"});
  q("Demand không chạy khi không có cảnh báo chặn", M.nhomCho(c1,sach).join()==="1,3");
  q("Demand chạy khi có cảnh báo chặn", M.nhomCho(c1,cot).join()==="1,3");
  q("không cảnh báo: không chặn được", !M.coTheKiemSoat(c1,"cho_ke_toan","demand","chan",sach));
  q("có cảnh báo: chặn được", M.coTheKiemSoat(c1,"cho_ke_toan","demand","chan",cot));
  // CEO chỉ duyệt khi vượt ngưỡng; dưới ngưỡng thì tự gửi sau kế toán
  const c2=set(JSON.parse(JSON.stringify(base)),"ceo_duyet",{chayKhi:"vuot_nguong"});
  q("dưới ngưỡng: sau kế toán là đã gửi", M.buocTiep(c2,"cho_ke_toan",ketThuc,tv,sach)==="da_gui");
  q("vượt ngưỡng: sau kế toán chờ CEO", M.buocTiep(c2,"cho_ke_toan",ketThuc,tv,vuot)==="cho_ceo");
  q("chưa đặt ngưỡng: không vượt", M.buocTiep(c2,"cho_ke_toan",ketThuc,tv,{...vuot,nguongTien:null})==="da_gui");
  // Bắt đầu lần chạy: nhóm đầu không chạy thì bắt đầu ở nhóm sau
  const c3=set(JSON.parse(JSON.stringify(base)),"ke_toan_duyet",{chayKhi:"ngoai_le"});
  q("kế toán không chạy: bắt đầu từ CEO", M.trangThaiBatDau(c3,sach)==="cho_ceo");
  q("kế toán chạy: bắt đầu từ kế toán", M.trangThaiBatDau(c3,{...sach,coNgoaiLe:true})==="cho_ke_toan");
  // Không yêu cầu duyệt: bước tự qua, không gating
  const c4=set(JSON.parse(JSON.stringify(base)),"ke_toan_duyet",{yeuCauDuyet:false});
  q("kế toán không yêu cầu duyệt: bắt đầu thẳng ở nhóm CEO", M.trangThaiBatDau(c4,sach)==="cho_nhom_3");
  q("không yêu cầu duyệt: kế toán không duyệt được", !M.coTheDuyet(c4,"cho_ceo","ke_toan",sach));
  // Mặc định (không có ctx) vẫn như cũ
  q("không truyền điều kiện: mọi bước chạy như trước", M.trangThaiBatDau(base)==="cho_ke_toan");
}
