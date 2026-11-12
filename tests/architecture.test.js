const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

// Isolated behavior tests: no MySQL connections, emails, or real sessions.
function load(file, mocks) {
    const filename = path.join(root, file);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Buffer, URL, process, console,
        __dirname: path.dirname(filename),
        require(name) {
            if (Object.hasOwn(mocks, name)) return mocks[name];
            throw new Error(`Unexpected dependency: ${name}`);
        }
    }, { filename });
    return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('JavaScript parses, relative modules resolve, and SQL stays in DAL', () => {
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        if (e.name === 'node_modules' || e.name === '.git') return [];
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
    });
    for (const file of walk(root)) {
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
            assert.doesNotThrow(() => require.resolve(path.resolve(path.dirname(file), match[1])));
        }
        if (file.includes(path.join('backend', 'BLL')) || file.includes(path.join('backend', 'PL'))) {
            assert.doesNotMatch(text, /\.(execute|query)\s*\(/);
            assert.doesNotMatch(text, /\b(?:SELECT .+ FROM|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/i);
        }
    }
});

test('password verification keeps unknown-account bcrypt work and verified-email gate', async () => {
    let user = null;
    const calls = [];
    const service = load('backend/BLL/auth/userService.js', {
        bcrypt: { hashSync: () => 'dummy-hash', compare: async (...args) => { calls.push(args); return true; } },
        '../../DAL/auth/usersDAL': { findForLogin: async () => user }
    });
    assert.equal(await service.authenticatePassword('missing@example.com', 'secret'), null);
    assert.deepEqual(calls[0], ['secret', 'dummy-hash']);
    user = { user_id: 7, password_hash: 'real-hash', email_verified_at: null };
    assert.equal(await service.authenticatePassword('known@example.com', 'secret'), null);
    user.email_verified_at = 'verified';
    assert.equal(await service.authenticatePassword('known@example.com', 'secret'), user);
    assert.deepEqual(calls[2], ['secret', 'real-hash']);
});

test('profile and authorization preserve missing, unverified, changed-role and denied-role cases', async () => {
    let user = null;
    const service = load('backend/BLL/auth/userService.js', {
        bcrypt: { hashSync: () => '' },
        '../../DAL/auth/usersDAL': { findById: async () => user, findAuthorization: async () => user }
    });
    assert.equal(await service.getAuthenticatedUser(7), null);
    assert.equal((await service.checkAuthorization(7, 'customer', ['customer'])).status, 401);
    user = { user_id: 7, first_name: 'A', last_name: 'B', email: 'a@example.com', role: 'admin', email_verified_at: 'verified' };
    assert.equal((await service.checkAuthorization(7, 'customer', ['admin'])).message, 'Please log in again');
    assert.equal((await service.checkAuthorization(7, 'admin', ['customer'])).status, 403);
    assert.equal(await service.checkAuthorization(7, 'admin', ['admin']), null);
    assert.deepEqual(plain(await service.getAuthenticatedUser(7)), {userId:7, firstName:'A', lastName:'B', email:'a@example.com', role:'admin'});
});

function transactionMock(queries) {
    const connection = {};
    const calls = [];
    const dal = { getConnection: async () => connection };
    for (const name of ['beginTransaction', 'commit', 'rollback', 'release', ...Object.keys(queries)]) {
        dal[name] = (actual, params) => {
            assert.equal(actual, connection, `${name} must share the transaction connection`);
            calls.push(name);
            return queries[name] ? queries[name](params) : undefined;
        };
    }
    return { dal, calls };
}

test('email verification commits atomically; consumed/expired tokens roll back before updating user', async () => {
    let affectedRows = 1;
    const {dal, calls} = transactionMock({
        findToken: () => [[{token_id: 1, user_id: 7}]],
        lockUserForVerification: () => [[{email_verified_at:null}]],
        consumeToken: () => [{affectedRows}], markEmailVerified: () => [{}]
    });
    const service = load('backend/BLL/auth/verificationService.js', {
        '../../DAL/auth/verificationDAL': dal,
        './verificationToken': {hashVerificationToken: () => 'hash'},
        './emailService': {}
    });
    assert.deepEqual(plain(await service.verifyEmailToken('a'.repeat(64))), {success:true,userId:7});
    assert.deepEqual(calls, ['beginTransaction','findToken','lockUserForVerification','consumeToken','markEmailVerified','commit','release']);
    calls.length = 0; affectedRows = 0;
    await assert.rejects(service.verifyEmailToken('a'.repeat(64)), /Invalid or expired/);
    assert.deepEqual(calls, ['beginTransaction','findToken','lockUserForVerification','consumeToken','rollback','release']);
    calls.length = 0;
    await assert.rejects(service.verifyEmailToken('invalid'), /Invalid verification token/);
    assert.deepEqual(calls, []);
});

test('verification token creation serializes rate checks and stores only the hash', async () => {
    let recent = [];
    const {dal,calls} = transactionMock({
        lockUserForToken: () => [[{email_verified_at:null}]], findRecentToken: () => [recent],
        invalidateUnusedTokens: () => [{}],
        insertToken: params => { assert.deepEqual(plain(params), [7,'hash']); return [{}]; }
    });
    const service = load('backend/BLL/auth/verificationService.js', {
        '../../DAL/auth/verificationDAL':dal,
        './verificationToken': {createVerificationToken: () => ({token:'random',tokenHash:'hash'})},
        './emailService':{}
    });
    assert.equal(await service.createAndStoreToken(7), 'random');
    assert.deepEqual(calls, ['beginTransaction','lockUserForToken','findRecentToken','invalidateUnusedTokens','insertToken','commit','release']);
    calls.length=0;recent=[{token_id:1}];
    await assert.rejects(service.createAndStoreToken(7), /Please wait/);
    assert.deepEqual(calls, ['beginTransaction','lockUserForToken','findRecentToken','rollback','release']);
});

test('2FA login keeps row locking, conditional replay update, rollback and release', async () => {
    let affectedRows=1; let valid=true;
    const {dal,calls}=transactionMock({
        lockEnrollmentForLogin: () => [[{encrypted_secret:'encrypted', enabled_at:'enabled', last_used_step:99}]],
        consumeTimeStep: params => {assert.deepEqual(plain(params),[100,7,100]); return [{affectedRows}];}
    });
    const service=load('backend/BLL/auth/twoFactorDbService.js', {
        '../../DAL/auth/twoFactorDAL':dal,
        './twoFactorService':{verifyTwoFactorCode:async (id,secret,code,last) => {
            assert.deepEqual([id,secret,code,last],[7,'encrypted','123456',99]);return {valid,timeStep:100};
        }}
    });
    assert.deepEqual(plain(await service.verifyLoginTwoFactor(7,'123456')),{valid:true});
    assert.deepEqual(calls,['beginTransaction','lockEnrollmentForLogin','consumeTimeStep','commit','release']);
    calls.length=0;affectedRows=0;
    assert.deepEqual(plain(await service.verifyLoginTwoFactor(7,'123456')),{valid:false});
    assert.deepEqual(calls,['beginTransaction','lockEnrollmentForLogin','consumeTimeStep','rollback','release']);
    calls.length=0;valid=false;
    assert.deepEqual(plain(await service.verifyLoginTwoFactor(7,'123456')),{valid:false});
    assert.deepEqual(calls,['beginTransaction','lockEnrollmentForLogin','rollback','release']);
});

test('2FA enrollment and confirmation retain transaction order and consumed step', async () => {
    const {dal,calls}=transactionMock({
        lockUserForEnrollment:()=>[[{email:'a@example.com',email_verified_at:'verified'}]],
        lockEnrollmentStatus:()=>[[]], insertEnrollment:params=>{assert.deepEqual(plain(params),[7,'encrypted']);return [{}];},
        lockEnrollmentForConfirmation:()=>[[{encrypted_secret:'encrypted',enabled_at:null,last_used_step:null}]],
        enableEnrollment:params=>{assert.deepEqual(plain(params),[100,7]);return [{}];}
    });
    const service=load('backend/BLL/auth/twoFactorDbService.js',{
        '../../DAL/auth/twoFactorDAL':dal,
        './twoFactorService':{createTwoFactorSetup:async()=>({encryptedSecret:'encrypted',qrCode:'qr',manualKey:'key'}),verifyTwoFactorCode:async()=>({valid:true,timeStep:100})}
    });
    assert.deepEqual(plain(await service.startTwoFactorEnrollment(7)),{qrCode:'qr',manualKey:'key'});
    assert.deepEqual(calls,['beginTransaction','lockUserForEnrollment','lockEnrollmentStatus','insertEnrollment','commit','release']);
    calls.length=0;
    assert.equal((await service.confirmTwoFactorEnrollment(7,'123456')).success,true);
    assert.deepEqual(calls,['beginTransaction','lockEnrollmentForConfirmation','enableEnrollment','commit','release']);
});

test('auth routes register once and login regenerates/saves sessions in both stages', async () => {
    const routes=[]; let account={user_id:7,role:'customer',enabled_at:null};
    load('backend/PL/routes/authRoutes.js',{
        express:{Router:()=>({post:(p,...h)=>routes.push({method:'POST',p,h}),get:(p,...h)=>routes.push({method:'GET',p,h})})},
        'express-rate-limit':{rateLimit:()=>()=>{}},
        '../middleware/authMiddleware':{requireAuth:()=>{},requireRole:()=>()=>{}},
        '../../BLL/auth/userService':{authenticatePassword:async()=>account,getVerifiedTwoFactorUser:async()=>account,getAuthenticatedUser:async()=>null},
        '../../BLL/auth/twoFactorDbService':{verifyLoginTwoFactor:async()=>({valid:true})},
        '../../BLL/auth/verificationService':{}
    });
    const paths=routes.map(r=>`${r.method} ${r.p}`);
    assert.deepEqual(paths,['POST /verify-email','POST /resend-verification','POST /login','POST /login/2fa','GET /me','POST /logout','GET /test-customer','GET /test-admin']);
    assert.equal(new Set(paths).size,paths.length);
    const calls=[];
    const session={regenerate:cb=>{calls.push('regenerate');cb();},save:cb=>{calls.push('save');cb();}};
    let status=200; let body;
    const res={status(n){status=n;return this;},json(value){body=value;return this;}};
    await routes.find(r=>r.p==='/login').h.at(-1)({body:{email:'a@example.com',password:'secret'},session},res);
    assert.deepEqual(calls,['regenerate','save']);assert.equal(body.authenticated,true);
    calls.length=0;account.enabled_at='enabled';
    await routes.find(r=>r.p==='/login').h.at(-1)({body:{email:'a@example.com',password:'secret'},session},res);
    assert.equal(status,202);assert.equal(body.requires2FA,true);assert.equal(session.pending2FA.userId,7);
    calls.length=0;status=200;
    await routes.find(r=>r.p==='/login/2fa').h.at(-1)({body:{code:'123456'},session},res);
    assert.deepEqual(calls,['regenerate','save']);assert.equal(body.authenticated,true);
});

test('root startup preserves health responses, frontend path, port and bind address', async () => {
    const routes=new Map();const mounts=[];let listening;let unavailable=false;
    const app={use:(...args)=>mounts.push(args),get:(p,fn)=>routes.set(p,fn),listen:(...args)=>{listening=args;}};
    const express=()=>app;express.json=()=> 'json';express.static=p=>p;
    load('server.js',{
        dotenv:{config:()=>{}},path,express,
        './backend/config/sessionConfig':{sessionMiddleware:'session'},
        './backend/PL/routes/authRoutes':'authRouter',
        './backend/BLL/healthService':{checkDatabaseHealth:async()=>{if(unavailable)throw new Error('simulated unavailable');}}
    });
    assert.deepEqual(listening.slice(0,2),[process.env.PORT || 1337,'0.0.0.0']);
    assert.equal(mounts.filter(args=>args[0]==='/api/auth').length,1);
    assert.ok(mounts.some(args=>args[0]===path.join(root,'frontend')));
    let status=200;let body;
    const res={status(n){status=n;return this;},json(v){body=plain(v);return this;}};
    routes.get('/api/health')({},res);
    assert.deepEqual(body,{status:'ok',message:'CortexOps API is running'});
    await routes.get('/api/db-health')({},res);
    assert.deepEqual(body,{status:'ok',database:'connected'});
    unavailable=true;
    const original=console.error;console.error=()=>{};
    try {await routes.get('/api/db-health')({},res);} finally {console.error=original;}
    assert.equal(status,503);assert.deepEqual(body,{status:'error',database:'unavailable'});
});

test('session adapter receives the shared pool and retains expiration/table settings', () => {
    const pool={};let supplied;
    const service=load('backend/DAL/auth/sessionDAL.js',{
        'express-session':{},
        'express-mysql-session':()=>function(options,connection){supplied={options,connection};},
        '../db':pool
    });
    service.createSessionStore();
    assert.equal(supplied.connection,pool);
    assert.deepEqual(plain(supplied.options),{
        createDatabaseTable:false,clearExpired:true,checkExpirationInterval:900000,
        expiration:7200000,endConnectionOnClose:false
    });
});
