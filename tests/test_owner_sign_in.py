"""Browser regression test for Ledger's sign-in gate with a synthetic Supabase API."""
import base64
import json
import os
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

DIST = Path(__file__).resolve().parents[1] / 'app' / 'dist'
ORIGIN = 'https://ledger-test.supabase.co'
USER = {
    'id': '00000000-0000-4000-8000-000000000001',
    'aud': 'authenticated',
    'email': 'owner@example.test',
    'role': 'authenticated',
    'app_metadata': {},
    'user_metadata': {},
}
PASSWORD = 'local-fixture-password'


def encode(data):
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')


def test_sign_in(url, browser):
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    verification_available = False
    token = '.'.join([
        encode({'alg': 'HS256', 'typ': 'JWT'}),
        encode({'sub': USER['id'], 'exp': int(time.time()) + 3600}),
        encode('synthetic signature'),
    ])

    def auth_response(route):
        request = route.request
        path = urlsplit(request.url).path
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        }
        status = 200
        body = {}
        if request.method == 'OPTIONS':
            status = 204
        elif path == '/auth/v1/token' and request.post_data_json.get('password') == PASSWORD:
            body = {'access_token': token, 'token_type': 'bearer', 'expires_in': 3600,
                    'refresh_token': 'synthetic-refresh-token', 'user': USER}
        elif path == '/auth/v1/user' and verification_available:
            body = USER
        elif path == '/auth/v1/user':
            status, body = 503, {'message': 'Synthetic verification failure'}
        elif path == '/auth/v1/logout':
            status = 204
        else:
            status, body = 400, {'message': 'Synthetic invalid credentials'}
        if status == 204:
            route.fulfill(status=status, headers=headers)
        else:
            route.fulfill(status=status, headers=headers, json=body)

    page.route(ORIGIN + '/**', auth_response)
    page.goto(url + '#/accounts')
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    expect(page.get_by_role('navigation')).to_have_count(0)
    page.get_by_label('Email').fill(USER['email'])
    page.get_by_label('Password').fill('wrong-password')
    page.get_by_role('button', name='Sign in').click()
    expect(page.get_by_role('alert')).to_contain_text('Sign-in failed')

    page.get_by_label('Password').fill(PASSWORD)
    page.get_by_role('button', name='Sign in').click()
    expect(page.get_by_role('alert')).to_contain_text('Could not verify your session')
    expect(page.get_by_role('navigation')).to_have_count(0)

    verification_available = True
    page.get_by_role('button', name='Retry').click()
    expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()
    page.get_by_role('link', name='More').click()
    page.get_by_role('button', name='Sign out').click()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    expect(page.get_by_role('navigation')).to_have_count(0)
    assert not errors, errors
    print('PASS owner sign-in, verification retry, session reload, and sign-out')


def test_account_management(url, browser):
    """Synthetic REST fixture covers UI behavior, not Supabase RLS."""
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors, writes, groups, accounts = [], [], [], []
    next_id = 1
    page.on('pageerror', lambda error: errors.append(str(error)))
    token = '.'.join([encode({'alg': 'HS256', 'typ': 'JWT'}),
                     encode({'sub': USER['id'], 'exp': int(time.time()) + 3600}),
                     encode('synthetic signature')])

    def api(route):
        nonlocal next_id
        req = route.request
        path = urlsplit(req.url).path
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                   'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
                   'Content-Type': 'application/json'}
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
        elif path == '/auth/v1/token':
            route.fulfill(status=200, headers=headers, json={
                'access_token': token, 'token_type': 'bearer', 'expires_in': 3600,
                'refresh_token': 'synthetic-refresh-token', 'user': USER})
        elif path == '/auth/v1/user':
            route.fulfill(status=200, headers=headers, json=USER)
        elif path.startswith('/rest/v1/'):
            table = path.rsplit('/', 1)[-1]
            rows = groups if table == 'account_groups' else accounts
            if req.method == 'GET':
                route.fulfill(status=200, headers=headers, json=rows)
            else:
                payload = req.post_data_json or {}
                writes.append((table, req.method, payload))
                if req.method == 'POST':
                    row = {'id': f'synthetic-{next_id}', 'sort_order': len(groups)} if table == 'account_groups' else {'id': f'synthetic-{next_id}', 'archived_at': None}
                    next_id += 1
                    row.update(payload)
                    rows.append(row)
                    route.fulfill(status=201, headers=headers, body='')
                else:
                    row_id = urlsplit(req.url).query.split('id=eq.', 1)[1].split('&', 1)[0]
                    next(row for row in rows if row['id'] == row_id).update(payload)
                    route.fulfill(status=204, headers=headers, body='')
        else:
            route.fulfill(status=204, headers=headers, body='')

    page.route(ORIGIN + '/**', api)
    page.goto(url + '#/accounts')
    page.get_by_label('Email').fill(USER['email'])
    page.get_by_label('Password').fill(PASSWORD)
    page.get_by_role('button', name='Sign in').click()
    expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()

    page.get_by_role('button', name='Add group').click()
    page.get_by_label('Group name').fill('Banking')
    page.get_by_role('button', name='Create group').click()
    group = groups[0]
    expect(page.get_by_role('heading', name='Banking')).to_be_visible()
    page.get_by_role('button', name='Add account').click()
    expect(page.get_by_label('Starting balance')).to_have_value('0.00')
    page.get_by_label('Account name').fill('Everyday checking')
    page.get_by_label('Group').select_option(group['id'])
    page.get_by_label('Starting balance').fill('125.25')
    page.get_by_role('button', name='Create account').click()
    expect(page.get_by_text('Everyday checking')).to_be_visible()
    account = accounts[0]
    assert account['current_balance'] == 125.25 and 'balance_observed_on' in account
    assert all('user_id' not in payload for _, _, payload in writes)

    page.get_by_role('button', name='Add account').click()
    page.get_by_label('Account name').fill('Cash reserve')
    page.get_by_role('button', name='Create account').click()
    expect(page.get_by_text('Cash reserve')).to_be_visible()
    assert accounts[1]['group_id'] is None
    today = page.evaluate("(() => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')).join('-'); })()")
    assert account['balance_observed_on'] == today

    page.get_by_role('button', name='Rename').click()
    page.locator('input[id^="rename-"]').fill('Daily banking')
    page.get_by_role('button', name='Save group').click()
    expect(page.get_by_role('heading', name='Daily banking')).to_be_visible()
    page.get_by_role('button', name='Edit Everyday checking').click()
    page.get_by_label('Account name').fill('Joint checking')
    page.get_by_label('Classification').select_option('liability')
    page.get_by_role('button', name='Save changes').click()
    expect(page.get_by_text('Joint checking')).to_be_visible()
    page.get_by_role('button', name='Archive', exact=True).click()
    expect(page.get_by_role('heading', name='Archived accounts')).to_be_visible()
    page.get_by_role('button', name='Restore').click()
    expect(page.get_by_role('button', name='Edit Joint checking')).to_be_visible()
    assert all(method != 'DELETE' for _, method, _ in writes)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    print('PASS account grouping, create/edit, archive/restore, mobile overflow, and no JavaScript errors')
    page.close()


if __name__ == '__main__':
    assert (DIST / 'index.html').is_file(), 'Build app/dist with the documented synthetic configuration.'
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=DIST)) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        chrome = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**chrome)
            test_sign_in(f'http://127.0.0.1:{server.server_port}/', browser)
            test_account_management(f'http://127.0.0.1:{server.server_port}/', browser)
            browser.close()
        server.shutdown()
