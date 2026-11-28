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
