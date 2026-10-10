const { Client } = require('pg'); 
const c = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/lmshub' }); 
c.connect().then(() => c.query("UPDATE settings SET value = '2PBP7IABZ2' WHERE key = 'payment.easebuzz.key'; UPDATE settings SET value = 'DAH88E3UWQ' WHERE key = 'payment.easebuzz.salt'; UPDATE settings SET value = 'test' WHERE key = 'payment.easebuzz.env'; UPDATE settings SET value = 'true' WHERE key = 'payment.easebuzz.enabled';")).then(() => console.log('Updated!')).catch(console.error).finally(() => c.end())
