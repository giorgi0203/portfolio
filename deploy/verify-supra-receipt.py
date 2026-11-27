"""Verify the public receipt, shared identity and table flow with one synthetic OpenAI request."""
import base64
import datetime
from decimal import Decimal
import hashlib
import http.cookiejar
import json
from pathlib import Path
import secrets
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

IDENTITY = 'https://auth.giorgi.app'
DECISIONS = 'https://decisions.giorgi.app'
SUPRA = 'https://split-supra.giorgi.app'
DB = 'file:/var/lib/smart-todolist/workspace.sqlite?mode=rw'


class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        url = urllib.parse.urlsplit(new_url)
        if url.scheme != 'https' or url.netloc not in {
            'decisions.giorgi.app', 'auth.giorgi.app', 'split-supra.giorgi.app'
        }:
            raise ValueError('Unexpected redirect destination during sign-in.')
        return super().redirect_request(request, fp, code, message, headers, new_url)


def check(ok, message):
    if not ok:
        raise ValueError(message)


def safe_failure_detail(response):
    """Read only fixed diagnostic fields; never print an HTML body or provider message."""
    stage_hints = {
        'provider_http': 'upstream rejected the request',
        'provider_transport': 'upstream connection failed',
        'provider_timeout': 'upstream timed out',
        'scan_cancelled': 'client cancelled the request',
        'provider_empty': 'upstream sent an empty body',
        'provider_response_size': 'upstream response exceeded the byte limit',
        'provider_non_json': 'upstream returned non-JSON content',
        'provider_envelope': 'upstream response lacked a Chat Completions message',
        'receipt_non_json': 'model message contained invalid JSON',
        'receipt_shape': 'model fields failed receipt validation',
        'receipt_refused': 'model declined to transcribe the image',
        'receipt_truncated': 'model reached the response length limit',
    }
    known_provider_codes = {
        'invalid_api_key','insufficient_quota','rate_limit_exceeded','model_not_found',
        'invalid_json_schema','unsupported_response_format','unsupported_parameter',
        'unsupported_value','invalid_request_error','invalid_image','invalid_image_format',
        'invalid_value','server_error','content_policy_violation',
    }
    try:
        data = json.loads(response.read(4096))
        diagnostic = data.get('diagnostic', {})
        hint = stage_hints.get(diagnostic.get('code'))
        if not hint:
            return ''
        status = diagnostic.get('upstreamStatus')
        if isinstance(status, int) and 400 <= status <= 599:
            hint += f', upstream HTTP {status}'
        code = diagnostic.get('providerCode')
        if code in known_provider_codes:
            hint += ', ' + code
        return ' (' + hint + ')'
    except (ValueError, AttributeError, TypeError):
        return ''


def verify(fixture):
    photo = 'data:image/png;base64,' + base64.b64encode(fixture.read_bytes()).decode()
    user_id = str(uuid.uuid4())
    session_token = secrets.token_hex(32)
    name = 'Receipt check'
    jar = http.cookiejar.CookieJar()
    jar.set_cookie(http.cookiejar.Cookie(
        version=0, name='__Host-giorgi_identity', value=session_token,
        port=None, port_specified=False, domain='auth.giorgi.app', domain_specified=False,
        domain_initial_dot=False, path='/', path_specified=True, secure=True,
        expires=int(time.time()) + 600, discard=True, comment=None, comment_url=None,
        rest={'HttpOnly': None}, rfc2109=False))
    client = urllib.request.build_opener(Redirects(), urllib.request.HTTPCookieProcessor(jar))

    def request(url, step, *, method='GET', body=None, origin=None, status=200, participant=None):
        headers = {'Accept': 'application/json', 'DNT': '1'}
        if origin:
            headers['Origin'] = origin
        if participant:
            headers['X-Participant-Token'] = participant
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            response = client.open(req, timeout=40)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            if response.status != status:
                raise ValueError(f'{step} returned HTTP {response.status}{safe_failure_detail(response)}.')
            if origin == SUPRA and url.startswith(DECISIONS + '/api/receipt/'):
                check(response.headers.get('Access-Control-Allow-Origin') == SUPRA and
                      response.headers.get('Access-Control-Allow-Credentials') == 'true',
                      f'{step} did not permit the credentialed Split app.')
            if step == 'Sign-in':
                check(response.url == SUPRA + '/', 'Sign-in did not return to the Split app.')
                return None
            return json.load(response)

    created = None
    with sqlite3.connect(DB, uri=True) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',
                   (user_id, 'receipt-' + user_id + '@example.invalid', name, 'disabled',
                    datetime.datetime.now(datetime.timezone.utc).isoformat()))
        db.execute('INSERT INTO identity_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
                   (hashlib.sha256(session_token.encode()).hexdigest(), user_id, int(time.time()*1000)+600_000))
    try:
        request(DECISIONS + '/api/auth/sso/start?returnTo=/supra', 'Sign-in')
        session_url = DECISIONS + '/api/receipt/session'
        scan_url = DECISIONS + '/api/receipt/analyze'
        session = request(session_url, 'Unverified session', origin=SUPRA)
        check(session.get('user') == {'name': name, 'emailVerified': False}, 'Unverified user mismatch.')
        # Test the gate without passing the photo or triggering a provider request.
        request(scan_url, 'Verification gate', method='POST', body={}, origin=SUPRA, status=403)
        with sqlite3.connect(DB, uri=True) as db:
            db.execute('INSERT INTO email_confirmations(user_id,verified_at) VALUES(?,?)',
                       (user_id, datetime.datetime.now(datetime.timezone.utc).isoformat()))
        session = request(session_url, 'Verified session', origin=SUPRA)
        check(session.get('configured') is True and session.get('user') == {'name': name, 'emailVerified': True},
              'Receipt configuration or verified session unavailable.')

        # The only paid request in this check. No retries, including on provider failure.
        receipt = request(scan_url, 'OpenAI receipt extraction', method='POST', body={'image': photo}, origin=SUPRA)
        check(receipt.get('currency') == 'GEL', 'Synthetic receipt currency was not read.')
        check(receipt.get('remaining') == session['remaining']-1, 'Shared scan allowance did not record the attempt.')
        by_name = {item['name'].casefold(): item for item in receipt['items']}
        expected = {'khinkali': (4, Decimal('2.50')), 'lemonade': (2, Decimal('3.00'))}
        items = []
        for item_name, (qty, unit) in expected.items():
            item = next((item for key, item in by_name.items() if item_name in key), None)
            check(item and item['quantity'] == qty and Decimal(item['unitPrice']) == unit and
                  Decimal(item['lineTotal']) == qty * unit, 'Synthetic receipt quantities or prices did not match.')
            items.append({'name': item_name, 'quantity': item['quantity'], 'unitMinor': int(unit*100)})
        check(Decimal(receipt['fee']) == Decimal('1.60') and Decimal(receipt['total']) == Decimal('17.60'),
              'The synthetic receipt fee or grand total did not match.')
        rooms_url = SUPRA + '/api/supra/rooms'
        created = request(rooms_url, 'Create synthetic table', method='POST', origin=SUPRA, status=201,
                          body={'title': 'Receipt deployment check', 'name': 'Test host',
                                'items': items, 'feeMinor': int(Decimal(receipt['fee'])*100)})
        room = created['room']
        check(room['totals']['totalMinor'] == 1760, 'Saved receipt failed to reconcile.')
        table_url = rooms_url + '/' + room['id']
        request(table_url+'/claim', 'Host claim', method='PUT', origin=SUPRA,
                participant=created['participantToken'], body={'itemId': room['items'][0]['id'], 'weight': 1})
        guest = request(table_url+'/join', 'Guest join', method='POST', origin=SUPRA, status=201,
                        body={'name': 'Test guest'})
        split = request(table_url+'/claim', 'Guest claim', method='PUT', origin=SUPRA,
                        participant=guest['participantToken'],
                        body={'itemId': room['items'][0]['id'], 'weight': 1})
        totals = split['room']['totals']
        check([p['totalMinor'] for p in totals['people']] == [550, 550] and totals['unassignedMinor'] == 660,
              'Diner claims or shared fee failed to reconcile.')
    finally:
        try:
            if created:
                request(SUPRA+'/api/supra/rooms/'+created['room']['id'], 'Remove synthetic table',
                        method='DELETE', origin=SUPRA, body={}, participant=created['participantToken'])
        finally:
            # Only the temporary identity and its cascading sessions are removed.
            with sqlite3.connect(DB, uri=True) as db:
                db.execute('PRAGMA foreign_keys=ON')
                db.execute('DELETE FROM users WHERE id=?', (user_id,))
    print('PASS verified cross-origin receipt scan, real OpenAI quantities/fees and public shared table with exact tetri totals.')


if __name__ == '__main__':
    try:
        verify(Path(sys.argv[1]))
    except Exception as error:
        # Avoid logging URLs with SSO codes, provider payloads or session credentials.
        print('Receipt smoke check failed:', str(error) if isinstance(error, ValueError)
              else type(error).__name__, file=sys.stderr)
        sys.exit(1)
