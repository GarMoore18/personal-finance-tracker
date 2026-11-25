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
    expect(page.get_by_role('heading', name='Accounts')).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Accounts')).to_be_visible()
    page.get_by_role('link', name='More').click()
    page.get_by_role('button', name='Sign out').click()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    page.reload()
    expect(page.get_by_role('heading', name='Sign in')).to_be_visible()
    expect(page.get_by_role('navigation')).to_have_count(0)
    assert not errors, errors
    print('PASS owner sign-in, verification retry, session reload, and sign-out')


if __name__ == '__main__':
    assert (DIST / 'index.html').is_file(), 'Build app/dist with the documented synthetic configuration.'
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=DIST)) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        chrome = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**chrome)
            test_sign_in(f'http://127.0.0.1:{server.server_port}/', browser)
            browser.close()
        server.shutdown()
