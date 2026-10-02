
const express=require('express'), path=require('path'), fs=require('fs'), crypto=require('crypto');
const Database=require('better-sqlite3');
const QRCode=require('qrcode');
const app=express(), PORT=process.env.PORT||3000;
app.set('trust proxy', 1);
const ADMIN_KEY=process.env.ADMIN_KEY||'MOC1999-ADMIN';
const COMPANY_LAT=Number(process.env.COMPANY_LAT||'11.9404');
const COMPANY_LNG=Number(process.env.COMPANY_LNG||'108.4583');
const GPS_RADIUS=Number(process.env.GPS_RADIUS||'200');
const db=new Database(process.env.DB_FILE||'/var/data/moc1999.db');
db.pragma('journal_mode=WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS employees(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',
 dept TEXT DEFAULT '',salary REAL DEFAULT 0,standard_days REAL DEFAULT 26,
 ot_rate REAL DEFAULT 0,password_hash TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS attendance(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,work_date TEXT NOT NULL,
 time_in TEXT,time_out TEXT,in_lat REAL,in_lng REAL,out_lat REAL,out_lng REAL,
 in_distance REAL,out_distance REAL,note TEXT DEFAULT '',status TEXT DEFAULT 'pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(employee_id,work_date));
CREATE TABLE IF NOT EXISTS audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT,employee_id INTEGER,work_date TEXT,
 detail TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
app.use(express.json());
const PUBLIC_DIR=path.join(__dirname,'public');
if(fs.existsSync(PUBLIC_DIR)) app.use(express.static(PUBLIC_DIR));
app.get('/',(req,res)=>{
  const f=path.join(PUBLIC_DIR,'index.html');
  if(fs.existsSync(f)) return res.sendFile(f);
  res.type('html').send(`<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Mộc 1999 - Chấm công</title></head><body style=\"font-family:Arial;padding:30px\"><h2>CTY TNHH MỘC 1999 – PHẦN MỀM CHẤM CÔNG</h2><p>Server đã chạy nhưng giao diện chưa được tải lên GitHub. Hãy upload thư mục <b>public</b> chứa <b>index.html</b>.</p></body></html>`);
});
function sha(s){return crypto.createHash('sha256').update(String(s)).digest('hex')}
function now(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh'}))}
function pad(n){return String(n).padStart(2,'0')}
function dateVN(){let d=now();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function timeVN(){let d=now();return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function hours(a,b){if(!a||!b)return 0;let x=a.split(':').map(Number),y=b.split(':').map(Number);let A=x[0]*3600+x[1]*60+x[2],B=y[0]*3600+y[1]*60+y[2];if(B<A)B+=86400;return Math.max(0,(B-A)/3600)}
function qrToken(){
 const bucket=Math.floor(Date.now()/30000);
 return crypto.createHash('sha256').update(String(bucket)+ADMIN_KEY).digest('hex').slice(0,24);
}
function validQR(t){return t===qrToken() || t===crypto.createHash('sha256').update(String(Math.floor(Date.now()/30000)-1)+ADMIN_KEY).digest('hex').slice(0,24)}
function dist(lat1,lon1,lat2,lon2){const R=6371000,p=Math.PI/180;let a=Math.sin((lat2-lat1)*p/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin((lon2-lon1)*p/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
function admin(req,res,next){if(req.header('x-admin-key')!==ADMIN_KEY)return res.status(401).json({error:'Sai mã quản lý'});next()}
function empAuth(req,res,next){let e=db.prepare('SELECT * FROM employees WHERE id=? AND active=1').get(req.header('x-employee-id'));if(!e||sha(req.header('x-employee-password')||'')!==e.password_hash)return res.status(401).json({error:'Sai tài khoản hoặc mật khẩu'});req.emp=e;next()}
app.get('/api/config',(q,r)=>r.json({lat:COMPANY_LAT,lng:COMPANY_LNG,radius:GPS_RADIUS}));
app.get('/api/qr',(req,res)=>{
 const token=qrToken();
 const url=`${req.protocol}://${req.get('host')}/?qr=${token}`;
 res.json({url,token,expiresIn:30});
});
app.get('/api/qr-image',(req,res)=>{
 const token=qrToken();
 const url=`${req.protocol}://${req.get('host')}/?qr=${token}`;
 QRCode.toBuffer(url,{type:'png',width:360,margin:2,errorCorrectionLevel:'M'})
   .then(buf=>{res.set('Content-Type','image/png');res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');res.send(buf)})
   .catch(e=>res.status(500).json({error:'Không tạo được QR: '+e.message}));
});
app.get('/api/employees',(q,r)=>r.json(db.prepare("SELECT id,name,phone,dept FROM employees WHERE active=1 ORDER BY name").all()));
app.post('/api/login',(req,res)=>{let {employeeId,password}=req.body;let e=db.prepare('SELECT * FROM employees WHERE id=? AND active=1').get(employeeId);if(!e||sha(password||'')!==e.password_hash)return res.status(401).json({error:'Sai tài khoản hoặc mật khẩu'});res.json({id:e.id,name:e.name,dept:e.dept})});
app.post('/api/punch/in',empAuth,(req,res)=>{
 let {lat,lng,qrToken:qt}=req.body,d=dateVN(),t=timeVN(),dd=dist(Number(lat),Number(lng),COMPANY_LAT,COMPANY_LNG);
 if(!validQR(qt))return res.status(400).json({error:'Mã QR đã hết hạn. Hãy quét lại QR tại nơi chấm công.'});
 if(dd>GPS_RADIUS)return res.status(400).json({error:`Bạn đang cách điểm chấm công khoảng ${Math.round(dd)}m. Phạm vi cho phép ${GPS_RADIUS}m.`});
 let a=db.prepare('SELECT * FROM attendance WHERE employee_id=? AND work_date=?').get(req.emp.id,d);
 if(a?.time_in)return res.status(400).json({error:`Đã vào ca lúc ${a.time_in}`});
 if(a)db.prepare('UPDATE attendance SET time_in=?,in_lat=?,in_lng=?,in_distance=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(t,lat,lng,dd,'pending',a.id);
 else db.prepare('INSERT INTO attendance(employee_id,work_date,time_in,in_lat,in_lng,in_distance) VALUES(?,?,?,?,?,?)').run(req.emp.id,d,t,lat,lng,dd);
 db.prepare('INSERT INTO audit(action,employee_id,work_date,detail) VALUES(?,?,?,?)').run('VÀO CA',req.emp.id,d,`GPS ${Math.round(dd)}m`);
 res.json({ok:true,time:t,date:d,distance:Math.round(dd)});
});
app.post('/api/punch/out',empAuth,(req,res)=>{
 let {lat,lng,qrToken:qt}=req.body,d=dateVN(),t=timeVN(),dd=dist(Number(lat),Number(lng),COMPANY_LAT,COMPANY_LNG);
 if(!validQR(qt))return res.status(400).json({error:'Mã QR đã hết hạn. Hãy quét lại QR tại nơi chấm công.'});
 if(dd>GPS_RADIUS)return res.status(400).json({error:`Bạn đang cách điểm chấm công khoảng ${Math.round(dd)}m. Phạm vi cho phép ${GPS_RADIUS}m.`});
 let a=db.prepare('SELECT * FROM attendance WHERE employee_id=? AND work_date=?').get(req.emp.id,d);
 if(!a?.time_in)return res.status(400).json({error:'Chưa vào ca hôm nay'});
 if(a.time_out)return res.status(400).json({error:`Đã ra ca lúc ${a.time_out}`});
 db.prepare('UPDATE attendance SET time_out=?,out_lat=?,out_lng=?,out_distance=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(t,lat,lng,dd,a.id);
 db.prepare('INSERT INTO audit(action,employee_id,work_date,detail) VALUES(?,?,?,?)').run('RA CA',req.emp.id,d,`GPS ${Math.round(dd)}m`);
 res.json({ok:true,time:t,date:d,distance:Math.round(dd)});
});
app.get('/api/my-today',empAuth,(req,res)=>r(res,db.prepare('SELECT * FROM attendance WHERE employee_id=? AND work_date=?').get(req.emp.id,dateVN())||{}));
app.get('/api/report',admin,(req,res)=>{
 let month=req.query.month||dateVN().slice(0,7);
 let rows=db.prepare(`SELECT a.*,e.name,e.dept,e.salary,e.standard_days,e.ot_rate FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE substr(a.work_date,1,7)=? ORDER BY a.work_date,e.name`).all(month);
 rows=rows.map(x=>({...x,hours:+hours(x.time_in,x.time_out).toFixed(2),ot:+Math.max(0,hours(x.time_in,x.time_out)-8).toFixed(2)}));res.json(rows)
});
app.post('/api/employees',admin,(req,res)=>{let {name,phone='',dept='',salary=0,standard=26,otRate=0,password='123456'}=req.body;if(!name)return res.status(400).json({error:'Thiếu tên'});let x=db.prepare('INSERT INTO employees(name,phone,dept,salary,standard_days,ot_rate,password_hash) VALUES(?,?,?,?,?,?,?)').run(name,phone,dept,+salary||0,+standard||26,+otRate||0,sha(password));res.json({id:x.lastInsertRowid})});
app.put('/api/employees/:id',admin,(req,res)=>{let {name,phone='',dept='',salary=0,standard=26,otRate=0,password}=req.body;if(password)db.prepare('UPDATE employees SET name=?,phone=?,dept=?,salary=?,standard_days=?,ot_rate=?,password_hash=? WHERE id=?').run(name,phone,dept,+salary||0,+standard||26,+otRate||0,sha(password),req.params.id);else db.prepare('UPDATE employees SET name=?,phone=?,dept=?,salary=?,standard_days=?,ot_rate=? WHERE id=?').run(name,phone,dept,+salary||0,+standard||26,+otRate||0,req.params.id);res.json({ok:true})});
app.delete('/api/employees/:id',admin,(req,res)=>{db.prepare('UPDATE employees SET active=0 WHERE id=?').run(req.params.id);res.json({ok:true})});
app.get('/api/audit',admin,(req,res)=>res.json(db.prepare('SELECT a.*,e.name FROM audit a LEFT JOIN employees e ON e.id=a.employee_id ORDER BY a.id DESC LIMIT 500').all()));
app.listen(PORT,()=>console.log('Moc1999 online on '+PORT));
