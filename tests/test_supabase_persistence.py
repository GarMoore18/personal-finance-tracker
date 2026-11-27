"""Opt-in integration check against a disposable Supabase stack on loopback."""
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from secrets import token_urlsafe
from threading import Thread
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

DIST = Path(__file__).resolve().parents[1] / 'app' / 'dist'


def create_user(api_url, service_key):
    email = f'ledger-test-{uuid4().hex}@example.test'
    password = token_urlsafe(24)
    request = Request(
        f'{api_url}/auth/v1/admin/users',
        data=json.dumps({'email': email, 'password': password, 'email_confirm': True}).encode(),
        headers={
            'Content-Type': 'application/json',
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
        },
    )
    with urlopen(request, timeout=15) as response:
        assert json.load(response)['email'] == email
    return email, password


def sign_in(page, url, credentials):
    page.goto(url + '#/home')
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    expect(page.get_by_role('navigation')).to_have_count(0)
    page.get_by_label('Email').fill(credentials[0])
    page.get_by_label('Password').fill(credentials[1])
    page.get_by_role('button', name='Sign in').click()
    expect(page.get_by_role('heading', name='Overview')).to_be_visible()


def verify_persistence(browser, url, owner, other_user):
    description = f'Synthetic persistence check {uuid4().hex[:8]}'
    phone = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    sign_in(phone, url, owner)
    phone.get_by_role('link', name='Add an expense').click()
    phone.get_by_label('Amount (USD)').fill('12.34')
    phone.get_by_label('Description').fill(description)
    category = phone.get_by_label('Category')
    expect(category).to_be_enabled()
    category.select_option(label='Groceries')
    phone.get_by_role('button', name='Save expense').click()
    expect(phone.get_by_role('status').filter(has_text='Expense saved.')).to_be_visible()
    phone.close()

    desktop = browser.new_page(viewport={'width': 1280, 'height': 900})
    sign_in(desktop, url, owner)
    desktop.get_by_role('link', name='Activity', exact=True).click()
    expect(desktop.get_by_text(description, exact=True)).to_be_visible()
    expect(desktop.locator('.activity-day summary')).to_contain_text('$12.34')
    desktop.close()

    other = browser.new_page()
    sign_in(other, url, other_user)
    other.get_by_role('link', name='Activity', exact=True).click()
    expect(other.get_by_text('No expenses for this month.')).to_be_visible()
    other.close()


def assert_anonymous_read_denied(api_url, publishable_key):
    request = Request(f'{api_url}/rest/v1/transactions?select=id', headers={'apikey': publishable_key})
    try:
        with urlopen(request, timeout=15):
            raise AssertionError('The anonymous transactions request was not denied by table permissions')
    except HTTPError as error:
        assert error.code in (401, 403), f'Expected a permission error, got HTTP {error.code}'


if __name__ == '__main__':
    api_url = os.environ['LEDGER_SUPABASE_URL'].rstrip('/')
    parsed_url = urlsplit(api_url)
    assert parsed_url.scheme == 'http' and parsed_url.hostname == '127.0.0.1', 'Use a disposable loopback stack'
    assert not (parsed_url.path or parsed_url.query or parsed_url.fragment)
    assert parsed_url.username is None and parsed_url.password is None
    assert (DIST / 'index.html').is_file(), 'Build app/dist for the same local stack'
    assert any(api_url.encode() in path.read_bytes() for path in (DIST / 'assets').glob('*.js')), (
        'Build app/dist with LEDGER_SUPABASE_URL set to the same local stack'
    )
    service_key = os.environ['LEDGER_TEST_SUPABASE_SERVICE_ROLE_KEY']
    assert_anonymous_read_denied(api_url, os.environ['LEDGER_SUPABASE_PUBLISHABLE_KEY'])
    owner = create_user(api_url, service_key)
    other_user = create_user(api_url, service_key)
    handler = partial(SimpleHTTPRequestHandler, directory=DIST)
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            launch = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(**launch)
                verify_persistence(browser, f'http://127.0.0.1:{server.server_port}/', owner, other_user)
                browser.close()
        finally:
            server.shutdown()
    print('PASS local Supabase persistence across browser sessions and isolation from other users and anonymous requests')
