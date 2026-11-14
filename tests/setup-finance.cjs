const path=require('path');
const original=path.resolve(__dirname,'..');
if(process.env.FINANCE_TEST_MODULES){process.env.NODE_PATH=process.env.FINANCE_TEST_MODULES;require('module').Module._initPaths();}
require('dotenv').config({path:process.env.FINANCE_TEST_ENV||path.join(original,'.env'),quiet:true});
const fs=require('fs');
const mysql=require('mysql2/promise');
module.exports = async function createTestDatabase(){
 const con=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',multipleStatements:true});
 const database='finance_review_'+Date.now();
 await con.query('CREATE DATABASE `'+database+'`');await con.query('USE `'+database+'`');
 const sql=fs.readFileSync(path.join(original,'database/cloud_marketplace.sql'),'utf8');
 for(const m of sql.matchAll(/CREATE TABLE (\w+)\s*\([\s\S]*?ENGINE=InnoDB;/g))if(!["EmailVerificationTokens", "UserTwoFactor"].includes(m[1]))await con.query(m[0]);
 await con.query(sql.match(/ALTER TABLE Notifications[\s\S]*?;/)[0]);
 const hash=await require('bcrypt').hash('FinanceTest123!',4);
 for(const role of ['admin','customer','provider','provider']){
  const id=role==='provider'?Math.random().toString(36).slice(2):role;
  await con.execute('INSERT INTO Users (first_name,last_name,email,password_hash,role,email_verified_at) VALUES (?,?,?,?,?,NOW())',['Finance','Test',id+'@finance.test',hash,role]);
 }
 await con.end();
 return database;
};
