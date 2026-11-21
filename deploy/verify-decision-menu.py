"""Bounded production smoke test: temporary account, real PKCE, one AI scan.

No emails are sent. The synthetic account and sessions are removed in finally.
Never print credentials, cookies, photos or returned account data.
"""
import base64,datetime,hashlib,http.cookiejar,json,secrets,sqlite3,sys,time,urllib.error,urllib.request,uuid
from pathlib import Path

database='/var/lib/smart-todolist/workspace.sqlite'
identity='https://auth.giorgi.app'
decisions='https://decisions.giorgi.app'
user_id=str(uuid.uuid4())
identity_token=secrets.token_hex(32)
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
jar.set_cookie(http.cookiejar.Cookie(version=0,name='__Host-giorgi_identity',value=identity_token,port=None,port_specified=False,domain='auth.giorgi.app',domain_specified=False,domain_initial_dot=False,path='/',path_specified=True,secure=True,expires=int(time.time())+3600,discard=False,comment=None,comment_url=None,rest={'HttpOnly':None},rfc2109=False))
def call(url,step,body=None,expected=200):
 headers={'Accept':'application/json'}
 if body is not None:headers.update({'Content-Type':'application/json','Origin':identity if url.startswith(identity) else decisions})
 request=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers=headers)
 try:
  with opener.open(request,timeout=40) as response:status=response.status;raw=response.read(200000)
 except urllib.error.HTTPError as error:status=error.code;raw=error.read(200000)
 if status!=expected:
  try:message=json.loads(raw).get('error','')
  except Exception:message=''
  raise RuntimeError(f'{step}: HTTP {status}. {str(message)[:180]}')
 try:return json.loads(raw)
 except Exception:return None
try:
 with sqlite3.connect(database) as db:
  db.execute('PRAGMA foreign_keys=ON')
  db.execute('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',(user_id,'menu-'+user_id+'@example.invalid','Menu deployment check','disabled',datetime.datetime.now(datetime.timezone.utc).isoformat()))
  db.execute('INSERT INTO identity_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',(hashlib.sha256(identity_token.encode()).hexdigest(),user_id,int(time.time()*1000)+3600000))
 call(decisions+'/api/auth/sso/start','PKCE sign-in')
 account=call(decisions+'/api/menu/session','Unverified session')['user']
 assert account and account['id']==user_id and account['emailVerified'] is False,'Shared unverified session missing'
 photo='data:image/png;base64,'+base64.b64encode(Path(sys.argv[1]).read_bytes()).decode()
 call(decisions+'/api/menu/analyze','Unverified scan rejected',{'image':photo},403)
 with sqlite3.connect(database) as db:db.execute('INSERT INTO email_confirmations(user_id,verified_at) VALUES(?,?)',(user_id,datetime.datetime.now(datetime.timezone.utc).isoformat()))
 account=call(decisions+'/api/menu/session','Verified session')['user']
 assert account and account['emailVerified'] is True,'Verification status did not refresh'
 result=call(decisions+'/api/menu/analyze','Real OpenAI menu extraction',{'image':photo})
 assert result.get('currency')=='GEL','Synthetic menu currency was not read'
 prices={str(item['name']).lower():str(item['price']) for item in result['items']}
 assert any('khachapuri' in name and float(price)==18 for name,price in prices.items() if price!='None'),'Synthetic dish price was not read'
 assert any('lobiani' in name and float(price)==8 for name,price in prices.items() if price!='None'),'Second synthetic dish price was not read'
 cached=call(decisions+'/api/menu/analyze','Repeated photo cache',{'image':photo})
 assert cached.get('cached') is True and cached['remaining']==result['remaining'],'Repeated photo consumed another scan'
 call(identity+'/api/auth/logout','Shared sign-out',{})
 assert call(decisions+'/api/menu/session','Revoked menu session')['user'] is None,'Shared sign-out did not revoke menu access'
 call(decisions+'/api/menu/analyze','Signed-out scan rejected',{'image':photo},401)
 print('PASS production shared PKCE sign-in, live email verification, one real OpenAI vision scan, cached repeat and global logout')
except Exception as error:
 print('Menu deployment verification failed:',str(error)[:300],file=sys.stderr)
 sys.exit(1)
finally:
 with sqlite3.connect(database) as db:
  db.execute('PRAGMA foreign_keys=ON')
  db.execute('DELETE FROM users WHERE id=?',(user_id,))
