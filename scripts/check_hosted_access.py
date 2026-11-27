"""Read-only checks of hosted Supabase Auth settings and anonymous permissions."""
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

FINANCIAL_RESOURCES = (
    'account_groups',
    'accounts',
    'balance_snapshots',
    'categories',
    'transactions',
    'current_net_worth',
)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        return None


def check_access(origin, publishable_key):
    opener = build_opener(NoRedirects())

    def get(path):
        request = Request(origin + path, headers={'apikey': publishable_key, 'Accept': 'application/json'})
        return opener.open(request, timeout=15)

    failures = []
    with get('/auth/v1/settings') as response:
        settings = json.load(response)
    if settings.get('disable_signup') is not True:
        failures.append('Hosted Auth did not confirm that public registration is disabled.')
    if settings.get('external', {}).get('anonymous_users') is not False:
        failures.append('Hosted Auth did not confirm that anonymous sign-in is disabled.')

    for resource in FINANCIAL_RESOURCES:
        try:
            with get(f'/rest/v1/{resource}?limit=0') as response:
                failures.append(f'{resource}: anonymous request returned HTTP {response.status}.')
        except HTTPError as error:
            try:
                denied = error.code in (401, 403) and json.load(error).get('code') == '42501'
            except (ValueError, AttributeError):
                denied = False
            finally:
                error.close()
            if not denied:
                failures.append(f'{resource}: HTTP {error.code} did not verify permission denial.')
    return failures


def main():
    try:
        origin = os.environ['LEDGER_SUPABASE_URL'].rstrip('/')
        key = os.environ['LEDGER_SUPABASE_PUBLISHABLE_KEY']
        parsed = urlsplit(origin)
        valid_origin = (
            parsed.scheme == 'https' and parsed.hostname
            and parsed.username is None and parsed.password is None
            and not (parsed.path or parsed.query or parsed.fragment)
        )
        if not valid_origin or not re.fullmatch(r'sb_publishable_[a-zA-Z0-9_-]+', key):
            print('Set an HTTPS Supabase project origin and a modern publishable key.')
            return 1
    except (KeyError, ValueError):
        print('Set LEDGER_SUPABASE_URL and LEDGER_SUPABASE_PUBLISHABLE_KEY for the hosted project.')
        return 1

    try:
        failures = check_access(origin, key)
    except HTTPError as error:
        error.close()
        print(f'Hosted access verification could not read Auth settings (HTTP {error.code}).')
        return 1
    except (URLError, ValueError, TimeoutError, AttributeError):
        print('Hosted access verification could not complete. Check connectivity and project configuration.')
        return 1

    if failures:
        for failure in failures:
            print(f'FAIL {failure}')
        return 1
    print('PASS public registration and anonymous sign-in are disabled, and anonymous financial reads are denied.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
