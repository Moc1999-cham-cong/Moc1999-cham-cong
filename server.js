
const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "moc1999.db");
const ADMIN_KEY = process.env.ADMIN_KEY || "MOC1999-ADMIN";

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT DEFAULT '',
  salary REAL DEFAULT 0,
  password TEXT DEFAULT '123456',
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius REAL DEFAULT 200,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  in_time TEXT,
  in_lat REAL,
  in_lng REAL,
  out_time TEXT,
  out_lat REAL,
  out_lng REAL,
  qr_bucket INTEGER,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(employee_id) REFERENCES employees(id),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT,
  employee_id INTEGER,
  project_id INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function qrToken(bucket) {
  return crypto.createHash("sha256").update(`${ADMIN_KEY}:${bucket}`).digest("hex").slice(0, 24);
}
function validQr(token) {
  const now = Math.floor(Date.now()/30000);
  return token === qrToken(now) || token === qrToken(now-1);
}
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R=6371000, r=Math.PI/180;
  const a=Math.sin((lat2-lat1)*r/2)**2 +
    Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lon2-lon1)*r/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function authEmployee(req) {
  const id = Number(req.headers["x-employee-id"]);
  const password = String(req.headers["x-employee-password"] || "");
  if (!id || !password) return null;
  return db.prepare("SELECT * FROM employees WHERE id=? AND password=? AND active=1").get(id,password);
}
function admin(req) {
  return String(req.headers["x-admin-key"] || "") === ADMIN_KEY;
}

app.get("/api/qr", (req,res)=>{
  const bucket=Math.floor(Date.now()/30000);
  const token=qrToken(bucket);
  const site = `${req.protocol}://${req.get("host")}`;
  res.json({ token, bucket, url:`${site}/?qr=${token}`, expiresIn:30 });
});

app.post("/api/login", (req,res)=>{
  const {employeeId,password}=req.body||{};
  const e=db.prepare("SELECT id,name,department,salary FROM employees WHERE id=? AND password=? AND active=1").get(Number(employeeId),String(password||""));
  if(!e) return res.status(401).json({error:"Sai mã nhân viên hoặc mật khẩu"});
  res.json(e);
});

app.get("/api/employees",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  res.json(db.prepare("SELECT id,name,department,salary,active FROM employees ORDER BY active DESC,id").all());
});
app.post("/api/employees",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  const {name,department,salary,password}=req.body||{};
  if(!name) return res.status(400).json({error:"Thiếu tên"});
  const info=db.prepare("INSERT INTO employees(name,department,salary,password) VALUES(?,?,?,?)")
    .run(name,department||"",Number(salary||0),password||"123456");
  res.json({id:info.lastInsertRowid});
});
app.put("/api/employees/:id",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  const {name,department,salary,password,active}=req.body||{};
  db.prepare("UPDATE employees SET name=?,department=?,salary=?,password=?,active=? WHERE id=?")
    .run(name,department||"",Number(salary||0),password||"123456",active===false?0:1,Number(req.params.id));
  res.json({ok:true});
});

app.get("/api/projects",(req,res)=>{
  const all = db.prepare("SELECT * FROM projects WHERE active=1 ORDER BY id DESC").all();
  res.json(all);
});
app.post("/api/projects",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  const {name,address,lat,lng,radius}=req.body||{};
  if(!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)))
    return res.status(400).json({error:"Thiếu tên hoặc tọa độ công trình"});
  const info=db.prepare("INSERT INTO projects(name,address,lat,lng,radius) VALUES(?,?,?,?,?)")
    .run(name,address||"",Number(lat),Number(lng),Number(radius||200));
  res.json({id:info.lastInsertRowid});
});
app.put("/api/projects/:id",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  const {name,address,lat,lng,radius,active}=req.body||{};
  db.prepare("UPDATE projects SET name=?,address=?,lat=?,lng=?,radius=?,active=? WHERE id=?")
    .run(name,address||"",Number(lat),Number(lng),Number(radius||200),active===false?0:1,Number(req.params.id));
  res.json({ok:true});
});

app.get("/api/my-today",(req,res)=>{
  const e=authEmployee(req); if(!e) return res.status(401).json({error:"Chưa đăng nhập"});
  const rows=db.prepare(`
    SELECT a.*,p.name project_name,p.address project_address
    FROM attendance a JOIN projects p ON p.id=a.project_id
    WHERE a.employee_id=? AND a.work_date=date('now','localtime')
    ORDER BY a.id DESC`).all(e.id);
  res.json(rows);
});

app.post("/api/punch",(req,res)=>{
  const e=authEmployee(req); if(!e) return res.status(401).json({error:"Chưa đăng nhập"});
  const {projectId,action,lat,lng,qrToken,note}=req.body||{};
  if(!validQr(String(qrToken||""))) return res.status(400).json({error:"QR đã hết hạn. Quét lại QR tại công trình."});
  const p=db.prepare("SELECT * FROM projects WHERE id=? AND active=1").get(Number(projectId));
  if(!p) return res.status(404).json({error:"Không tìm thấy công trình"});
  const dist=distanceMeters(Number(lat),Number(lng),p.lat,p.lng);
  if(dist>p.radius) return res.status(400).json({error:`Bạn đang cách công trình khoảng ${Math.round(dist)}m, vượt bán kính cho phép ${p.radius}m.`});
  const now=new Date(), date=now.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const time=now.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour12:false});
  let row=db.prepare("SELECT * FROM attendance WHERE employee_id=? AND project_id=? AND work_date=? AND out_time IS NULL ORDER BY id DESC LIMIT 1").get(e.id,p.id,date);
  if(action==="in"){
    if(row) return res.status(400).json({error:"Bạn đang có ca chưa RA CA tại công trình này."});
    const info=db.prepare("INSERT INTO attendance(employee_id,project_id,work_date,in_time,in_lat,in_lng,qr_bucket,note) VALUES(?,?,?,?,?,?,?,?)")
      .run(e.id,p.id,date,time,Number(lat),Number(lng),Math.floor(Date.now()/30000),note||"");
    db.prepare("INSERT INTO audit_log(action,employee_id,project_id,detail) VALUES(?,?,?,?)").run("IN",e.id,p.id,`Vào ca ${date} ${time}`);
    return res.json({ok:true,id:info.lastInsertRowid,message:`Đã VÀO CA tại ${p.name} lúc ${time}`});
  }
  if(action==="out"){
    if(!row) return res.status(400).json({error:"Không có ca đang mở tại công trình này."});
    db.prepare("UPDATE attendance SET out_time=?,out_lat=?,out_lng=? WHERE id=?").run(time,Number(lat),Number(lng),row.id);
    db.prepare("INSERT INTO audit_log(action,employee_id,project_id,detail) VALUES(?,?,?,?)").run("OUT",e.id,p.id,`Ra ca ${date} ${time}`);
    return res.json({ok:true,message:`Đã RA CA tại ${p.name} lúc ${time}`});
  }
  res.status(400).json({error:"Action không hợp lệ"});
});

app.get("/api/report",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  const rows=db.prepare(`
    SELECT a.id,a.work_date,a.in_time,a.out_time,e.name employee_name,e.department,p.name project_name,
      CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL
      THEN round((julianday('2000-01-01 '||a.out_time)-julianday('2000-01-01 '||a.in_time))*24,2) ELSE 0 END hours
    FROM attendance a JOIN employees e ON e.id=a.employee_id JOIN projects p ON p.id=a.project_id
    WHERE substr(a.work_date,1,7)=? ORDER BY a.work_date,e.name,a.in_time`).all(month);
  res.json(rows);
});
app.get("/api/audit",(req,res)=>{
  if(!admin(req)) return res.status(403).json({error:"Không có quyền"});
  res.json(db.prepare(`
    SELECT l.*,e.name employee_name,p.name project_name
    FROM audit_log l LEFT JOIN employees e ON e.id=l.employee_id LEFT JOIN projects p ON p.id=l.project_id
    ORDER BY l.id DESC LIMIT 300`).all());
});

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Moc1999 attendance running on ${PORT}`));
