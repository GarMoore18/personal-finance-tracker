"""Browser regression test for Ledger's sign-in gate with a synthetic Supabase API."""
import base64
import json
import os
import re
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
VIEWPORTS = (
    ('compact phone', {'width': 320, 'height': 720}),
    ('phone', {'width': 390, 'height': 844}),
    ('large phone', {'width': 430, 'height': 932}),
    ('desktop', {'width': 1280, 'height': 900}),
)


def encode(data):
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')


def assert_layout(page, *targets):
    width, scroll_width = page.evaluate('() => [window.innerWidth, document.documentElement.scrollWidth]')
    assert scroll_width <= width, f'{page.url} overflows its {width}px viewport ({scroll_width}px document)'
    for target in targets:
        size = target.bounding_box()
        assert size and size['width'] >= 44 and size['height'] >= 44, f'{target} has a small hit area: {size}'


def test_sign_in(url, browser, viewport):
    page = browser.new_page(viewport=viewport, color_scheme='light')
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
    assert_layout(page, page.get_by_role('button', name='Sign in'))
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
    page.keyboard.press('Tab')
    expect(page.get_by_role('link', name='Skip to content')).to_be_focused()
    page.keyboard.press('Enter')
    expect(page.get_by_role('main')).to_be_focused()
    page.get_by_role('link', name='More').click()
    page.get_by_role('radio', name='dark').check()
    page.reload()
    expect(page.get_by_role('radio', name='dark')).to_be_checked()
    expect(page.locator('html')).to_have_css('color-scheme', 'dark')
    page.get_by_role('button', name='Sign out').click()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    expect(page.locator('html')).to_have_css('color-scheme', 'dark')
    expect(page.get_by_role('navigation')).to_have_count(0)
    assert not errors, errors
    print('PASS owner sign-in, verification retry, session reload, and sign-out')


def test_account_management(url, browser, viewport):
    """Synthetic REST fixture covers UI behavior, not Supabase RLS."""
    page = browser.new_page(viewport=viewport)
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
                if table == 'accounts':
                    rows = [{**row, 'current_balance': float(row['current_balance'])} for row in rows]
                elif table == 'balance_snapshots':
                    rows = [{**row, 'balance': float(row['balance'])}
                            for row in sorted(rows, key=lambda row: row['month'], reverse=True)]
                route.fulfill(status=200, headers=headers, json=rows)
            else:
                payload = req.post_data_json or {}
                writes.append((table, req.method, payload))
                if table == 'accounts' and req.method == 'PATCH':
                    allowed = {'group_id', 'name', 'current_balance', 'balance_observed_on', 'archived_at'}
                    if payload.keys() - allowed:
                        route.fulfill(status=403, headers=headers, json={'message': 'Disallowed account column'})
                        return
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
                    if payload.get('name') == 'Unavailable checking':
                        route.fulfill(headers=headers, json=[])
                        return
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
                        route.fulfill(headers=headers, json=[{'id': row_id}])
        else:
            route.fulfill(status=204, headers=headers, body='')

    page.route(ORIGIN + '/**', api)
    page.goto(url + '#/accounts')
    page.get_by_label('Email').fill(USER['email'])
    page.get_by_label('Password').fill(PASSWORD)
    page.get_by_role('button', name='Sign in').click()
    expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()

    page.get_by_role('button', name='Add group').click()
    page.get_by_label('Group name').fill('   ')
    page.get_by_role('button', name='Create group').click()
    expect(page.get_by_role('alert')).to_contain_text('Enter a group name')
    expect(page.get_by_label('Group name')).to_be_focused()
    assert not writes
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
    expect(page.get_by_role('list', name='Monthly balance history for Everyday checking')).to_contain_text('130.25')
    assert sorted(item['month'] for item in snapshots if item['account_id'] == account['id']) == sorted([today[:7] + '-01', next_month_observed[:7] + '-01'])
    write_count = len([write for write in writes if write[0] == 'accounts' and write[1] == 'PATCH' and 'current_balance' in write[2]])
    page.get_by_role('button', name='Record balance for Everyday checking').click()
    page.get_by_label('Current balance').fill('131.00')
    page.get_by_label('Balance observed on').fill(today)
    page.get_by_role('button', name='Save balance').click()
    alert = page.get_by_role('alert')
    expect(alert).to_contain_text(f'on or after {next_month_observed}')
    page.emulate_media(color_scheme='dark')
    expect(page.locator('html')).to_have_css('color-scheme', 'dark')
    expect(alert).to_have_css('color', 'rgb(255, 180, 171)')
    page.emulate_media(color_scheme='light')
    expect(page.locator('html')).to_have_css('color-scheme', 'light')
    expect(alert).to_have_css('color', 'rgb(165, 39, 39)')
    assert len([write for write in writes if write[0] == 'accounts' and write[1] == 'PATCH' and 'current_balance' in write[2]]) == write_count
    assert all(item['balance'] in ('126.75', '130.25') for item in snapshots if item['account_id'] == account['id'])

    page.get_by_role('button', name='Add account').click()
    long_account_name = 'EmergencyReserveAccountForUpcomingHouseholdExpenses'
    page.get_by_label('Account name').fill(long_account_name)
    page.get_by_label('Starting balance').fill('999999999999.99')
    page.get_by_role('button', name='Create account').click()
    expect(page.get_by_text(long_account_name, exact=True)).to_be_visible()
    expect(page.get_by_text('$999,999,999,999.99')).to_be_visible()
    assert_layout(page, page.get_by_role('button', name='Edit ' + long_account_name))
    assert accounts[1]['group_id'] is None

    page.get_by_role('button', name='Rename').click()
    page.locator('input[id^="rename-"]').fill('Daily banking')
    page.get_by_role('button', name='Save group').click()
    expect(page.get_by_role('heading', name='Daily banking')).to_be_visible()
    page.get_by_role('button', name='Edit Everyday checking').click()
    page.get_by_label('Account name').fill('Unavailable checking')
    page.get_by_role('button', name='Save changes').click()
    expect(page.get_by_role('alert')).to_contain_text('Your entries are still here')
    expect(page.get_by_label('Account name')).to_have_value('Unavailable checking')
    assert account['name'] == 'Everyday checking'
    page.get_by_label('Account name').fill('Joint checking')
    page.locator('select[name=group-id]').select_option(label='Ungrouped')
    page.get_by_role('button', name='Save changes').click()
    expect(page.get_by_text('Joint checking')).to_be_visible()
    assert account['group_id'] is None and account['kind'] == 'asset'
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


def test_manual_expense(url, browser, viewport):
    page = browser.new_page(viewport=viewport,
                            timezone_id='America/Los_Angeles')
    token = '.'.join([encode({'alg': 'HS256', 'typ': 'JWT'}),
                     encode({'sub': USER['id'], 'exp': int(time.time()) + 3600}),
                     encode('synthetic signature')])
    category_id = '00000000-0000-4000-8000-000000000002'
    categories = {category_id: {'id': category_id, 'name': 'Groceries', 'color': '#527435',
                                'icon': 'basket', 'sort_order': 10}}
    category_writes = []
    saved, attempts, changes = [], [], []
    category_requests = 0
    overview_ready = False

    def api(route):
        nonlocal category_requests
        request = route.request
        path = urlsplit(request.url).path
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
                   'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'}
        if request.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
        elif path == '/auth/v1/token':
            route.fulfill(headers=headers, json={
                'access_token': token, 'token_type': 'bearer', 'expires_in': 3600,
                'refresh_token': 'synthetic-refresh-token', 'user': USER})
        elif path == '/auth/v1/user':
            route.fulfill(headers=headers, json=USER)
        elif path == '/rest/v1/categories':
            if request.method == 'GET':
                category_requests += 1
                if category_requests == 1:
                    route.fulfill(status=400, headers=headers, json={'message': 'Synthetic load failure'})
                else:
                    route.fulfill(headers=headers, json=list(categories.values()))
            elif request.method == 'POST':
                category_writes.append(request.post_data_json)
                if len(category_writes) == 1:
                    route.fulfill(status=400, headers=headers, json={'message': 'Synthetic category save failure'})
                else:
                    categories['custom'] = {'id': 'custom', 'sort_order': 0, **request.post_data_json}
                    route.fulfill(status=201, headers=headers, json=categories['custom'])
            elif request.method == 'PATCH':
                assert parse_qs(urlsplit(request.url).query)['id'] == [f'eq.{category_id}']
                category_writes.append(request.post_data_json)
                categories[category_id].update(request.post_data_json)
                route.fulfill(headers=headers, json=categories[category_id])
        elif path == '/rest/v1/transactions' and request.method == 'GET':
            dates = parse_qs(urlsplit(request.url).query).get('occurred_on', [])
            rows = []
            if overview_ready:
                rows = [
                    *[{**expense, 'id': f'quick-{index}', 'amount': float(expense['amount']),
                       'categories': {'name': categories[expense['category_id']]['name']}}
                      for index, expense in enumerate(saved)],
                    {'id': '4', 'occurred_on': today, 'amount': 10.10,
                     'description': 'Coffee beans', 'categories': {'name': 'Groceries'}},
                    {'id': '5', 'occurred_on': today, 'amount': 0.20,
                     'description': 'Parking', 'categories': {'name': 'Transport'}},
                ]
            if dates == ['gte.2024-02-01', 'lt.2024-03-01']:
                rows = [
                    *[{**expense, 'id': '1', 'amount': float(expense['amount']),
                       'categories': {'name': 'Groceries'}} for expense in saved],
                    {'id': '2', 'occurred_on': '2024-02-29', 'amount': 0.1,
                     'description': 'Parking meter', 'category_id': 'transport', 'categories': {'name': 'Transport'}},
                    {'id': '3', 'occurred_on': '2024-02-28', 'amount': 8,
                     'description': 'Sandwich', 'category_id': 'dining', 'categories': {'name': 'Dining'}},
                ]
            route.fulfill(headers=headers, json=rows)
        elif path == '/rest/v1/current_net_worth':
            route.fulfill(headers=headers, json=[{'net_worth': '-25.05'}] if overview_ready else [])
        elif path == '/rest/v1/accounts':
            route.fulfill(headers=headers, json=[{'id': '6', 'name': 'Checking',
                                                  'current_balance': 75.95}] if overview_ready else [])
        elif path == '/rest/v1/transactions' and request.method in ('PATCH', 'DELETE'):
            assert parse_qs(urlsplit(request.url).query)['id'] == ['eq.1']
            changes.append(request.method)
            if request.method == 'PATCH':
                saved[0].update(request.post_data_json)
            else:
                saved.clear()
            route.fulfill(headers=headers, json=[{'id': '1'}])
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
    assert_layout(page, save, page.get_by_label('Amount (USD)'), page.get_by_label('Category'))
    if viewport['width'] == 320:
        page.get_by_role('main').focus()
        for _ in range(12):
            page.keyboard.press('Tab')
            if save.evaluate('(button) => button === document.activeElement'):
                break
        expect(save).to_be_focused()
        save_box = save.bounding_box()
        nav_box = page.get_by_role('navigation', name='Main navigation').bounding_box()
        assert save_box['y'] + save_box['height'] <= nav_box['y'], 'Bottom navigation covers Save expense'
    page.get_by_label('Amount (USD)').fill('12.345')
    save.click()
    expect(page.get_by_role('alert')).to_contain_text('up to two decimal places')
    expect(page.get_by_label('Amount (USD)')).to_be_focused()
    expect(page.get_by_label('Amount (USD)')).to_have_accessible_description(
        'Enter a positive amount with up to two decimal places.')
    assert not attempts

    page.get_by_label('Amount (USD)').fill('12.3')
    page.get_by_label('Description').fill('   ')
    save.click()
    expect(page.get_by_label('Description')).to_be_focused()
    expect(page.get_by_label('Description')).to_have_accessible_description('Enter an expense description.')
    assert not attempts
    page.get_by_label('Description').fill('  Market supplies  ')
    save.click()
    expect(page.get_by_role('alert')).to_contain_text('Your entries are still here')
    expect(page.get_by_label('Amount (USD)')).to_have_value('12.3')
    expect(page.get_by_label('Notes (optional)')).to_have_value('  Weekly shop  ')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')

    save.click()
    expect(page.get_by_role('heading', name='Overview', exact=True)).to_be_visible()
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

    search = page.get_by_role('searchbox', name='Search descriptions')
    search.fill('  SaNd  ')
    expect(dates).to_have_count(1)
    expect(page.get_by_text('Sandwich')).to_be_visible()
    expect(page.get_by_text('Market supplies')).to_have_count(0)
    search.fill('meter')
    expect(page.get_by_text('Parking meter')).to_be_visible()
    expect(dates.locator('summary')).to_contain_text('$0.10')
    search.fill('Groceries')
    expect(page.get_by_role('status').filter(has_text='No expenses match')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.get_by_role('button', name='Clear search').click()
    expect(search).to_have_value('')
    expect(search).to_be_focused()
    expect(dates).to_have_count(2)

    page.get_by_text('Filters', exact=True).click()
    filters = page.get_by_role('group', name='Filter expenses in the selected month')
    category = filters.get_by_label('Category')
    category.select_option(label='Transport')
    expect(page.get_by_text('Parking meter')).to_be_visible()
    expect(page.get_by_text('Market supplies')).to_have_count(0)
    category.select_option(label='All categories')
    filters.get_by_label('From date').fill('2024-02-29')
    expect(page.get_by_text('Sandwich')).to_have_count(0)
    filters.get_by_role('button', name='Clear dates').click()
    filters.get_by_label('Minimum amount (USD)').fill('8.00')
    expect(page.get_by_text('Sandwich')).to_be_visible()
    expect(page.get_by_text('Parking meter')).to_have_count(0)
    filters.get_by_label('Maximum amount (USD)').fill('7.99')
    expect(filters.get_by_role('alert')).to_contain_text('maximum amount')
    filters.get_by_role('button', name='Clear amounts').click()

    category.select_option(label='Groceries')
    filters.get_by_label('Through date').fill('2024-02-29')
    filters.get_by_label('Maximum amount (USD)').fill('12.30')
    expect(page.get_by_text('Filters (3 active)', exact=True)).to_be_visible()
    expect(page.get_by_text('Market supplies')).to_be_visible()
    search.fill('meter')
    expect(page.get_by_role('status').filter(has_text='No expenses match your filters')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    filters.get_by_role('button', name='Reset filters').click()
    expect(search).to_have_value('meter')
    expect(page.get_by_text('Parking meter')).to_be_visible()
    page.get_by_role('button', name='Clear search').click()
    page.get_by_text('Filters', exact=True).click()
    print('PASS independent and combined Activity filters, invalid bounds, resets, and mobile overflow')

    earlier.locator('summary').click()
    print('PASS description search, no matches, and keyboard focus after clearing')

    latest.get_by_role('button', name='Edit Market supplies').click()
    editor = page.get_by_role('region', name='Edit expense')
    expect(editor.get_by_label('Description')).to_have_value('Market supplies')
    expect(editor.get_by_label('Amount (USD)')).to_have_value('12.3')
    expect(editor.get_by_label('Category')).to_have_value(category_id)
    expect(editor.get_by_label('Date', exact=True)).to_have_value('2024-02-29')
    expect(editor.get_by_label('Notes (optional)')).to_have_value('Weekly shop')
    editor.get_by_label('Description').fill('Discarded edit')
    editor.get_by_role('button', name='Cancel', exact=True).click()
    expect(latest.get_by_text('Market supplies')).to_be_visible()
    assert not changes

    latest.get_by_role('button', name='Edit Market supplies').click()
    editor.get_by_label('Description').fill('Market produce')
    editor.get_by_label('Amount (USD)').fill('18.15')
    editor.get_by_role('button', name='Save changes').click()
    expect(latest.get_by_text('Market produce')).to_be_visible()
    expect(latest.locator('summary')).to_contain_text('$18.25')
    expect(earlier.get_by_text('Sandwich')).to_be_visible()
    expect(page.get_by_label('Month', exact=True)).to_have_value('2024-02')

    latest.get_by_role('button', name='Edit Market produce').click()
    editor.get_by_role('button', name='Delete expense').click()
    expect(editor.get_by_text('Delete “Market produce”?')).to_be_visible()
    editor.get_by_role('button', name='Keep expense').click()
    assert changes == ['PATCH']
    editor.get_by_role('button', name='Delete expense').click()
    editor.get_by_role('button', name='Confirm deletion').click()
    expect(latest.get_by_text('Market produce')).to_have_count(0)
    expect(latest.locator('summary')).to_contain_text('$0.10')
    assert changes == ['PATCH', 'DELETE']
    print('PASS expense prefill, cancel, save, confirmed deletion, and preserved Activity context')

    overview_ready = True
    page.get_by_role('link', name='Home', exact=True).click()
    expect(page.get_by_role('region', name='Spending this month')).to_contain_text('$10.30')
    expect(page.get_by_role('img', name='Daily totals', exact=False)).to_have_accessible_name(
        re.compile(r'Peak: \$10\.30 on'))
    expect(page.get_by_role('region', name='Net worth')).to_contain_text('-$25.05')
    expect(page.get_by_role('list', name='Account balances')).to_contain_text('$75.95')
    expect(page.get_by_role('region', name='Recent expenses')).to_contain_text('Coffee beans')
    navigation = page.get_by_role('navigation', name='Main navigation')
    expect(navigation.get_by_role('link', name='Home')).to_have_attribute('aria-current', 'page')
    assert_layout(page, *navigation.get_by_role('link').all(), page.get_by_role('button', name='Quick add expense'))
    navigation.get_by_role('link', name='More').click()
    page.get_by_role('radio', name='dark').check()
    navigation.get_by_role('link', name='Home').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    expect(page.get_by_role('region', name='Spending this month')).to_contain_text('$10.30')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('PASS Home data, navigation targets, and dark theme')

    page.get_by_role('button', name='Quick add expense').click()
    quick_add = page.get_by_role('region', name='Expense details')
    amount = quick_add.get_by_label('Amount (USD)')
    expect(amount).to_be_focused()
    expect(quick_add.get_by_label('Date', exact=True)).to_have_value(today)
    for description in ('Fresh bread', 'Fresh fruit'):
        amount.fill('.75')
        quick_add.get_by_label('Description').fill(description)
        quick_add.get_by_label('Category').select_option(label='Groceries')
        quick_add.get_by_role('button', name='Save expense').click()
        expect(page.get_by_role('region', name='Recent expenses')).to_contain_text(description)
        expect(amount).to_have_value('')
        expect(amount).to_be_focused()
        expect(quick_add.get_by_label('Description')).to_have_value('')
        expect(quick_add.get_by_label('Category')).to_have_value('')
    expect(page.get_by_role('status').filter(has_text='2 expenses saved.')).to_be_visible()
    expect(page.get_by_role('region', name='Spending this month')).to_contain_text('$11.80')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.get_by_role('button', name='Close quick add').click()
    expect(quick_add).to_be_hidden()
    print('PASS dashboard quick add, repeated saves, updated totals, and narrow layout')

    navigation.get_by_role('link', name='More').click()
    widgets = page.get_by_role('group', name='Dashboard widgets')
    for label in ('Spending this month', 'Recent expenses', 'Net worth'):
        expect(widgets.get_by_role('checkbox', name=label)).to_be_checked()
        widgets.get_by_role('checkbox', name=label).uncheck()
    navigation.get_by_role('link', name='Home').click()
    for label in ('Spending this month', 'Recent expenses', 'Net worth'):
        expect(page.get_by_role('region', name=label)).to_have_count(0)
    expect(page.get_by_role('button', name='Quick add expense')).to_be_visible()
    page.reload()
    page.get_by_role('link', name='Settings', exact=True).click()
    for label in ('Spending this month', 'Recent expenses', 'Net worth'):
        expect(widgets.get_by_role('checkbox', name=label)).not_to_be_checked()
    widgets.get_by_role('checkbox', name='Recent expenses').check()
    navigation.get_by_role('link', name='Home').click()
    expect(page.get_by_role('region', name='Recent expenses')).to_contain_text('Fresh fruit')
    expect(page.get_by_role('region', name='Net worth')).to_have_count(0)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('PASS dashboard widget defaults, hiding, persistence, and restoring a widget')

    navigation.get_by_role('link', name='More').click()
    page.get_by_role('link', name='Manage categories').click()
    settings = page.get_by_role('region', name='Manage categories')
    settings.get_by_role('button', name='Add category').click()
    form = settings.get_by_role('form', name='New category')
    assert_layout(page, form.get_by_label('Color'), form.get_by_label('Icon'), form.get_by_role('button', name='Save category'))
    expect(form.get_by_label('Name')).to_be_focused()
    form.get_by_label('Name').fill('  Cycling  ')
    form.get_by_label('Color').fill('#345678')
    form.get_by_label('Icon').select_option('bus')
    form.get_by_role('button', name='Save category').click()
    expect(form.get_by_role('alert')).to_contain_text('Your entries are still here')
    expect(form.get_by_label('Name')).to_have_value('  Cycling  ')
    form.get_by_role('button', name='Save category').click()
    expect(settings.get_by_role('status')).to_have_text('Category created.')
    assert categories['custom']['name'] == 'Cycling'
    assert categories['custom']['color'] == '#345678' and categories['custom']['icon'] == 'bus'
    expect(settings.get_by_role('button', name='Add category')).to_be_focused()

    settings.get_by_role('button', name='Edit category Groceries').click()
    form = settings.get_by_role('form', name='Edit category')
    expect(form.get_by_label('Color')).to_have_value('#527435')
    expect(form.get_by_label('Icon')).to_have_value('basket')
    form.get_by_label('Name').fill('Food at home')
    form.get_by_role('button', name='Save category').click()
    expect(settings.get_by_role('status')).to_have_text('Category updated.')
    assert set(category_writes[-1]) == {'name', 'color', 'icon'}
    assert all(expense['category_id'] == category_id for expense in saved)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    navigation.get_by_role('link', name='Home').click()
    expect(page.get_by_role('region', name='Recent expenses')).to_contain_text('Food at home')
    navigation.get_by_role('link', name='Add an expense').click()
    page.get_by_label('Category').select_option(label='Cycling')
    print('PASS category creation, failed save recovery, appearance preferences, and reference-safe rename')
    page.close()


if __name__ == '__main__':
    assert (DIST / 'index.html').is_file(), 'Build app/dist with the documented synthetic configuration.'
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=DIST)) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        chrome = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**chrome)
            url = f'http://127.0.0.1:{server.server_port}/'
            for name, viewport in VIEWPORTS:
                print(f'Testing {name} at {viewport["width"]} × {viewport["height"]}', flush=True)
                test_sign_in(url, browser, viewport)
                test_account_management(url, browser, viewport)
                test_manual_expense(url, browser, viewport)
            browser.close()
        server.shutdown()
