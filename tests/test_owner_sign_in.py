"""Browser regression test for Ledger's sign-in gate with a synthetic Supabase API."""
import base64
import json
import os
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlsplit

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
    errors, writes, groups, accounts, snapshots = [], [], [], [], []
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
            rows = groups if table == 'account_groups' else accounts if table == 'accounts' else snapshots
            if req.method == 'GET':
                route.fulfill(status=200, headers=headers, json=sorted(rows, key=lambda row: row.get('month', ''), reverse=True) if table == 'balance_snapshots' else rows)
            else:
                payload = req.post_data_json or {}
                writes.append((table, req.method, payload))
                if req.method == 'POST':
                    row = {'id': f'synthetic-{next_id}', 'sort_order': len(groups)} if table == 'account_groups' else {'id': f'synthetic-{next_id}', 'archived_at': None}
                    next_id += 1
                    row.update(payload)
                    rows.append(row)
                    if table == 'accounts':
                        snapshots.append({'account_id': row['id'], 'month': row['balance_observed_on'][:7] + '-01', 'balance': row['current_balance'], 'observed_on': row['balance_observed_on']})
                    route.fulfill(status=201, headers=headers, body='')
                else:
                    row_id = urlsplit(req.url).query.split('id=eq.', 1)[1].split('&', 1)[0]
                    updated = next(row for row in rows if row['id'] == row_id)
                    if table == 'accounts' and payload.get('balance_observed_on', updated['balance_observed_on']) < updated['balance_observed_on']:
                        route.fulfill(status=409, headers=headers, json={'message': 'A balance observation cannot precede the current observation'})
                    else:
                        updated.update(payload)
                        if table == 'accounts' and 'current_balance' in payload:
                            month = updated['balance_observed_on'][:7] + '-01'
                            snapshot = next((item for item in snapshots if item['account_id'] == row_id and item['month'] == month), None)
                            if snapshot:
                                snapshot.update(balance=updated['current_balance'], observed_on=updated['balance_observed_on'])
                            else:
                                snapshots.append({'account_id': row_id, 'month': month, 'balance': updated['current_balance'], 'observed_on': updated['balance_observed_on']})
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
    page.locator('form.account-form select[name="group-id"]').select_option(group['id'])
    page.get_by_label('Starting balance').fill('125.25')
    page.get_by_role('button', name='Create account').click()
    expect(page.get_by_text('Everyday checking')).to_be_visible()
    account = accounts[0]
    today = page.evaluate("""() => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }""")
    next_month_observed = page.evaluate("""(today) => { const [year, month] = today.split('-').map(Number); const d = new Date(Date.UTC(year, month, 3)); return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-'); }""", today)
    assert account['current_balance'] == '125.25' and account['balance_observed_on'] == today
    assert snapshots[0]['balance'] == '125.25' and snapshots[0]['month'].endswith('-01')
    assert all('user_id' not in payload for _, _, payload in writes)

    page.get_by_role('button', name='View monthly history').first.click()
    expect(page.get_by_role('list', name='Monthly balance history for Everyday checking')).to_contain_text('125.25')
    page.get_by_role('button', name='Record balance for Everyday checking').click()
    page.get_by_label('Current balance').fill('126.75')
    page.get_by_label('Balance observed on').fill(today)
    page.get_by_role('button', name='Save balance').click()
    expect(page.get_by_role('status').filter(has_text='Balance saved')).to_be_visible()
    assert len([item for item in snapshots if item['account_id'] == account['id']]) == 1
    assert snapshots[0]['balance'] == '126.75'

    page.get_by_role('button', name='Record balance for Everyday checking').click()
    page.get_by_label('Current balance').fill('130.25')
    page.get_by_label('Balance observed on').fill(next_month_observed)
    page.get_by_role('button', name='Save balance').click()
    assert sorted(item['month'] for item in snapshots if item['account_id'] == account['id']) == sorted([today[:7] + '-01', next_month_observed[:7] + '-01'])
    write_count = len([write for write in writes if write[0] == 'accounts' and write[1] == 'PATCH' and 'current_balance' in write[2]])
    page.get_by_role('button', name='Record balance for Everyday checking').click()
    page.get_by_label('Current balance').fill('131.00')
    page.get_by_label('Balance observed on').fill(today)
    page.get_by_role('button', name='Save balance').click()
    expect(page.get_by_role('alert')).to_contain_text(f'on or after {next_month_observed}')
    assert len([write for write in writes if write[0] == 'accounts' and write[1] == 'PATCH' and 'current_balance' in write[2]]) == write_count
    expect(page.get_by_role('list', name='Monthly balance history for Everyday checking')).to_contain_text('130.25')
    assert all(item['balance'] in ('126.75', '130.25') for item in snapshots if item['account_id'] == account['id'])

    page.get_by_role('button', name='Add account').click()
    page.get_by_label('Account name').fill('Cash reserve')
    page.get_by_role('button', name='Create account').click()
    expect(page.get_by_text('Cash reserve')).to_be_visible()
    assert accounts[1]['group_id'] is None

    page.get_by_role('button', name='Rename').click()
    page.locator('input[id^="rename-"]').fill('Daily banking')
    page.get_by_role('button', name='Save group').click()
    expect(page.get_by_role('heading', name='Daily banking')).to_be_visible()
    page.get_by_role('button', name='Edit Everyday checking').click()
    page.get_by_label('Account name').fill('Joint checking')
    page.get_by_label('Classification').select_option('liability')
    page.get_by_role('button', name='Save changes').click()
    expect(page.get_by_text('Joint checking')).to_be_visible()
    writes_before_archive = len(writes)
    page.get_by_role('button', name='Archive Joint checking', exact=True).click()
    confirmation = page.get_by_role('group', name='Confirm archive Joint checking')
    expect(confirmation).to_be_visible()
    assert len(writes) == writes_before_archive
    confirmation.get_by_role('button', name='Cancel').click()
    assert len(writes) == writes_before_archive
    page.get_by_role('button', name='Archive Joint checking', exact=True).click()
    page.get_by_role('group', name='Confirm archive Joint checking').get_by_role('button', name='Confirm archive').click()
    expect(page.get_by_role('heading', name='Archived accounts')).to_be_visible()
    page.get_by_role('button', name='Restore').click()
    expect(page.get_by_role('button', name='Edit Joint checking')).to_be_visible()
    assert all(method != 'DELETE' for _, method, _ in writes)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    print('PASS account grouping, exact balance updates, monthly snapshot history, backdate rejection, archive/restore, mobile overflow, and no JavaScript errors')
    page.close()


def test_manual_expense(url, browser):
    page = browser.new_page(viewport={'width': 390, 'height': 844},
                            timezone_id='America/Los_Angeles')
    token = '.'.join([encode({'alg': 'HS256', 'typ': 'JWT'}),
                     encode({'sub': USER['id'], 'exp': int(time.time()) + 3600}),
                     encode('synthetic signature')])
    category_id = '00000000-0000-4000-8000-000000000002'
    saved, attempts = [], []
    category_requests = 0
    overview_ready = False

    def api(route):
        nonlocal category_requests
        request = route.request
        path = urlsplit(request.url).path
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                   'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'}
        if request.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
        elif path == '/auth/v1/token':
            route.fulfill(headers=headers, json={
                'access_token': token, 'token_type': 'bearer', 'expires_in': 3600,
                'refresh_token': 'synthetic-refresh-token', 'user': USER})
        elif path == '/auth/v1/user':
            route.fulfill(headers=headers, json=USER)
        elif path == '/rest/v1/categories':
            category_requests += 1
            if category_requests == 1:
                route.fulfill(status=400, headers=headers, json={'message': 'Synthetic load failure'})
            else:
                route.fulfill(headers=headers, json=[{'id': category_id, 'name': 'Groceries'}])
        elif path == '/rest/v1/transactions' and request.method == 'GET':
            dates = parse_qs(urlsplit(request.url).query).get('occurred_on', [])
            rows = []
            if overview_ready:
                rows = [
                    {'id': '4', 'occurred_on': today, 'amount': 10.10,
                     'description': 'Coffee beans', 'categories': {'name': 'Groceries'}},
                    {'id': '5', 'occurred_on': today, 'amount': 0.20,
                     'description': 'Parking', 'categories': {'name': 'Transport'}},
                ]
            if dates == ['gte.2024-02-01', 'lt.2024-03-01']:
                rows = [
                    {**saved[0], 'id': '1', 'amount': 12.3, 'categories': {'name': 'Groceries'}},
                    {'id': '2', 'occurred_on': '2024-02-29', 'amount': 0.1,
                     'description': 'Parking meter', 'categories': {'name': 'Transport'}},
                    {'id': '3', 'occurred_on': '2024-02-28', 'amount': 8,
                     'description': 'Sandwich', 'categories': {'name': 'Dining'}},
                ]
            route.fulfill(headers=headers, json=rows)
        elif path == '/rest/v1/current_net_worth':
            route.fulfill(headers=headers, json=[{'net_worth': '-25.05'}] if overview_ready else [])
        elif path == '/rest/v1/accounts':
            route.fulfill(headers=headers, json=[{'id': '6', 'name': 'Checking',
                                                  'current_balance': 75.95}] if overview_ready else [])
        elif path == '/rest/v1/transactions' and request.method == 'POST':
            attempts.append(request.post_data_json)
            if len(attempts) == 1:
                route.fulfill(status=400, headers=headers, json={'message': 'Synthetic write failure'})
            else:
                saved.append(request.post_data_json)
                route.fulfill(status=201, headers=headers, body='')
        else:
            route.fulfill(status=404, headers=headers)

    page.route(ORIGIN + '/**', api)
    page.goto(url + '#/home')
    page.get_by_label('Email').fill(USER['email'])
    page.get_by_label('Password').fill(PASSWORD)
    page.get_by_role('button', name='Sign in').click()
    page.get_by_role('link', name='Add an expense').click()
    today = page.evaluate("""() => new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())""")
    expect(page.get_by_label('Date', exact=True)).to_have_value(today)
    expect(page.get_by_role('alert')).to_have_text('Could not load categories.')
    expect(page.get_by_role('button', name='Save expense')).to_be_disabled()
    page.get_by_role('button', name='Retry').click()

    page.get_by_label('Description').fill('  Market supplies  ')
    page.get_by_label('Category').select_option(label='Groceries')
    page.get_by_label('Date', exact=True).fill('2024-02-29')
    page.get_by_label('Notes (optional)').fill('  Weekly shop  ')
    save = page.get_by_role('button', name='Save expense')
    page.get_by_label('Amount (USD)').fill('12.345')
    save.click()
    expect(page.get_by_role('alert')).to_contain_text('up to two decimal places')
    assert not attempts

    page.get_by_label('Amount (USD)').fill('12.3')
    save.click()
    expect(page.get_by_role('alert')).to_contain_text('Your entries are still here')
    expect(page.get_by_label('Amount (USD)')).to_have_value('12.3')
    expect(page.get_by_label('Notes (optional)')).to_have_value('  Weekly shop  ')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')

    save.click()
    expect(page.get_by_role('heading', name='Home', exact=True)).to_be_visible()
    expect(page.get_by_role('status').filter(has_text='Expense saved.')).to_be_visible()
    assert saved == [{'amount': '12.30', 'description': 'Market supplies',
                      'category_id': category_id, 'occurred_on': '2024-02-29',
                      'notes': 'Weekly shop'}], saved
    print('PASS manual expense date, category retry, amount validation, failed write recovery, and successful save')

    page.get_by_role('link', name='Activity', exact=True).click()
    expect(page.get_by_text('No expenses for this month.')).to_be_visible()
    page.get_by_label('Month', exact=True).fill('2024-02')
    dates = page.locator('.activity-day')
    expect(dates).to_have_count(2)
    latest, earlier = dates.nth(0), dates.nth(1)
    expect(latest.locator('summary')).to_contain_text('$12.40')
    expect(latest.get_by_text('Market supplies')).to_be_visible()
    expect(latest.get_by_text('Groceries')).to_be_visible()
    expect(latest.get_by_text('$12.30', exact=True)).to_be_visible()
    expect(earlier.locator('summary')).to_contain_text('$8.00')
    expect(earlier.get_by_text('Sandwich')).to_be_hidden()
    earlier.locator('summary').click()
    expect(earlier.get_by_text('Sandwich')).to_be_visible()
    latest.locator('summary').click()
    expect(latest.get_by_text('Market supplies')).to_be_hidden()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('PASS monthly activity, daily totals, expense details, and expandable groups')

    overview_ready = True
    page.get_by_role('link', name='Home', exact=True).click()
    expect(page.get_by_role('region', name='Spending this month')).to_contain_text('$10.30')
    expect(page.get_by_role('region', name='Net worth')).to_contain_text('-$25.05')
    expect(page.get_by_role('list', name='Account balances')).to_contain_text('$75.95')
    expect(page.get_by_role('region', name='Recent expenses')).to_contain_text('Coffee beans')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.set_viewport_size({'width': 1280, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('PASS Home spending, signed net worth, account balances, and recent expenses at phone and desktop widths')
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
            test_manual_expense(f'http://127.0.0.1:{server.server_port}/', browser)
            browser.close()
        server.shutdown()
