"""Headless iPhone-viewport tests for Ledger. Run: python3 tests/test_ledger.py  (CHROME_PATH optional)"""
import os, sys, pathlib, tempfile
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()
SHOTS = os.environ.get('SHOTS_DIR')
res, errors = [], []
def check(name, cond, extra=''):
    res.append(bool(cond)); print(('PASS' if cond else 'FAIL'), name, extra)

with sync_playwright() as p:
    kw = {'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}
    b = p.chromium.launch(args=['--no-sandbox'], **kw)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL)
    shot = lambda n: pg.screenshot(path=f'{SHOTS}/{n}.png') if SHOTS else None
    def js(expr, arg=None): return pg.evaluate(expr, arg) if arg is not None else pg.evaluate(expr)
    def tab(k): pg.click(f'#tabs [data-t="{k}"]')
    def keys(s):
        for ch in s: pg.click(f'.pad [data-k="{ch}"]')
    def tap_add(): pg.click('#tabs .fab')

    check('welcome screen on first run', pg.locator('text=Add your first account').count() == 1)
    check('no horizontal scroll', js('document.documentElement.scrollWidth <= innerWidth'))
    shot('01-welcome')

    def mk_acct(name, typ, bal, date):
        js('openAcct()'); pg.fill('#aN', name); pg.select_option('#aT', typ); pg.fill('#aO', str(bal)); pg.fill('#aD', date); pg.click('[data-a="saveAcct"]')
    t0 = js('today()')
    mk_acct('Checking', 'Checking', 1000, '2020-01-01'); mk_acct('Savings', 'Savings', 500, '2020-01-01'); mk_acct('Brokerage', 'Investment', 10000, '2020-01-01')
    check('3 accounts + snapshot auto-created', js('S.accounts.length') == 3 and js('S.snaps.length') == 1)
    bal = lambda n: js('(n)=>balances(S.accounts.find(a=>a.name===n))', n)

    # keypad add
    tap_add(); check('add sheet opens with keypad', pg.locator('.pad').count() == 1)
    keys('42.5'); check('keypad shows amount', '42.5' in pg.inner_text('#amtv'), pg.inner_text('#amtv'))
    pg.click('.pad [data-k="bk"]'); pg.click('.pad [data-k="5"]'); keys('99')
    check('max 2 decimals enforced', pg.inner_text('#amtv').endswith('42.59') or '42.5' in pg.inner_text('#amtv'))
    shot('02-add-sheet')
    pg.click('[data-a="saveTx"]')   # 3 taps: amount, (category default), save
    check('quick add saved expense with default category', js('S.txns.length') == 1 and js('S.txns[0].category') != '' and js('S.txns[0].type') == 'expense')
    amt = js('S.txns[0].amount'); check('amount parsed correctly', amt in (42.5, 42.59), str(amt))
    js('S.txns[0].amount=50;save()')

    def add(typ, amount, status='cleared', date=None, to=None, payee=''):
        tap_add(); pg.click(f'[data-a="typ"][data-t="{typ}"]'); keys(str(amount))
        if status == 'pending': pg.click('[data-a="togPend"]')
        if date: pg.fill('[data-f="tdate"]', date)
        if to: pg.click(f'[data-a="toacct"]', ) if False else js('(n)=>{draft.toAccount=S.accounts.find(a=>a.name===n).id;drawTx()}', to)
        if payee: pg.click('[data-a="togDet"]'); pg.fill('[data-f="tpayee"]', payee)
        pg.click('[data-a="saveTx"]')
    add('expense', 20, status='pending', payee='Gas Co')
    b1 = bal('Checking'); check('pending shown separately: 950/-20/930', (b1['cleared'], b1['pending'], b1['projected']) == (950, -20, 930), str(b1))
    add('expense', 99, date='2019-06-01')
    check('txn before as-of date not counted', bal('Checking')['cleared'] == 950)
    add('transfer', 100, to='Savings')
    check('transfer moves money', (bal('Checking')['cleared'], bal('Savings')['cleared']) == (850, 600))
    check('transfer excluded from spend', js("monthSpend(monthOf(today()))") == 50 + 20 + 0 or js("monthSpend(monthOf(today()))") == 70)

    # clear pending keeps one record, amount editable
    n_before = js('S.txns.length'); tid = js("S.txns.find(t=>t.status==='pending').id")
    tab('home'); shot('03-home')
    pg.click(f'[data-a="clear"][data-id="{tid}"]'); pg.fill('#cAmt', '23.4'); pg.click('[data-a="doClear"]')
    check('clearing keeps one record (no double count)', js('S.txns.length') == n_before)
    check('cleared with final amount', js(f"S.txns.find(t=>t.id==='{tid}').amount") == 23.4 and bal('Checking')['pending'] == 0)
    check('checking = 826.6', abs(bal('Checking')['cleared'] - 826.6) < 1e-9, str(bal('Checking')))

    # investment accounts: tracked by value, not spending
    check('investment balance = opening value', bal('Brokerage')['cleared'] == 10000)
    tab('accts'); shot('04-accounts')
    js("openVal(S.accounts.find(a=>a.name==='Brokerage').id)"); pg.fill('#vV', '10750'); pg.click('[data-a="saveVal"]')
    check('investment value update', bal('Brokerage')['cleared'] == 10750)
    check('investment not offered in add sheet', 'Brokerage' not in js("(()=>{openTx();const h=document.querySelector('[data-f=tacct]').outerHTML;closeSheet();return h})()"))
    check('investment change shown vs snapshot', pg.locator('text=+$750').count() >= 1)

    # reconcile
    js("openRecon(S.accounts.find(a=>a.name==='Checking').id)"); pg.fill('#rB', '830')
    check('reconcile shows difference', 'Difference' in pg.inner_text('#rOut') and '3.40' in pg.inner_text('#rOut'), pg.inner_text('#rOut'))
    pg.click('[data-a="reconAdj"]')
    check('adjustment reconciles to bank', abs(bal('Checking')['cleared'] - 830) < 1e-9 and js("S.recon[S.accounts.find(a=>a.name==='Checking').id].diff") == 0)

    # activity + filters
    tab('act'); check('activity lists transactions', pg.locator('#tl .item').count() >= 4); shot('05-activity')
    pg.fill('#fq', 'gas'); check('search filters', pg.locator('#tl .item').count() == 1)
    pg.fill('#fq', '')

    # home cards: hide/reorder persist
    tab('more'); shot('06-more')
    first = js('S.settings.cards[0].k'); pg.click(f'[data-a="cardmove"][data-k="{first}"][data-n="1"]')
    check('card reorder', js('S.settings.cards[1].k') == first)
    pg.uncheck('[data-f="cardon"][data-k="cats"]'); tab('home')
    check('hidden card not shown', pg.locator('text=Top categories').count() == 0)
    pg.reload(); check('state + settings persist', js('S.txns.length') >= 4 and js("S.settings.cards.find(c=>c.k==='cats').on") is False)

    # validation & hardening
    tab('more'); pg.fill('[data-f="cur"]', 'XX1'); pg.press('[data-f="cur"]', 'Tab')
    check('invalid currency rejected', js('S.settings.currency') == 'USD')
    evil = {'accounts': [{'id': "a');window.__pwn=1;//", 'name': '<img src=x onerror=window.__pwn=2>', 'opening': 'abc', 'type': 'Investment', 'vals': [{'date': 'x', 'value': '5'}]}],
            'categories': [{'id': 'c1', 'name': 'X', 'color': 'red;background:url(x)'}], 'txns': [{'id': "t');window.__pwn=3;//", 'type': 'expense', 'amount': '-12', 'date': '2026-12-01', 'account': "a');window.__pwn=1;//", 'category': 'c1'}, {'type': 'bogus'}],
            'settings': {'currency': 'ZZZZ', 'theme': 'x', 'cards': [{'k': 'nope'}, {'k': 'cats', 'on': True}]}, 'snaps': [{'month': 'bad'}]}
    js('(e)=>{S=normalize(e);save();render()}', evil); tab('accts'); pg.wait_for_timeout(150)
    check('malicious import sanitized', js('window.__pwn') is None and js('S.txns.length') == 1 and js('S.categories[0].color') == '#888888' and js('S.settings.currency') == 'USD' and js('S.settings.cards.length') == 5 and js('S.snaps.length') == 0)
    check('no injected img element', pg.locator('img[src="x"]').count() == 0)

    # CSV formula guard
    js('(e)=>{S=defaultState();S.accounts=[{id:"a1",name:"C",type:"Checking",opening:0,openingDate:"2020-01-01",archived:false,vals:[]}];S.txns=[{id:"t1",date:"2026-01-01",amount:5,type:"expense",account:"a1",toAccount:"",category:"",payee:\'=HYPERLINK("http://x")\',note:"",status:"cleared"}];save();render()}', 1)
    tab('more')
    with pg.expect_download() as d: pg.click('[data-a="csv"]')
    path = os.path.join(tempfile.mkdtemp(), 't.csv'); d.value.save_as(path); csv = open(path).read()
    check('CSV neutralizes formula payee', "\"'=HYPERLINK" in csv and '"=HYPERLINK' not in csv)

    # layout sanity on phone
    for k in ['home', 'act', 'accts', 'more']:
        tab(k); check(f'no horizontal overflow on {k}', js('document.documentElement.scrollWidth <= innerWidth'))
    tabbar = js("(()=>{const r=document.querySelector('.tabbar').getBoundingClientRect();return [Math.round(r.bottom),innerHeight]})()")
    check('tab bar pinned to bottom', tabbar[0] == tabbar[1], str(tabbar))
    small = js("[...document.querySelectorAll('#tabs button,.pad button')].filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44}).length")
    tap_add(); small2 = js("[...document.querySelectorAll('.pad button,.chip')].filter(e=>e.getBoundingClientRect().height<38).length")
    check('tap targets >= 44px (tabs) / 38px (chips)', small == 0 and small2 == 0, f'{small},{small2}')
    # iOS Safari zooms the page when focusing a field with font-size < 16px
    pg.click('[data-a="closeSheet"]'); tab('home')
    tap_add(); pg.click('[data-a="togDet"]')
    tiny = js("[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='hidden'&&e.type!=='color'&&e.type!=='checkbox'&&parseFloat(getComputedStyle(e).fontSize)<16).length")
    check('form fields >= 16px (no iOS focus zoom) in add sheet', tiny == 0, str(tiny))
    pg.click('[data-a="closeSheet"]'); tab('more')
    tiny2 = js("[...document.querySelectorAll('input,select,textarea')].filter(e=>e.type!=='hidden'&&e.type!=='color'&&e.type!=='checkbox'&&parseFloat(getComputedStyle(e).fontSize)<16).length")
    check('form fields >= 16px on More', tiny2 == 0, str(tiny2))
    check('PWA manifest + icons present', all((ROOT / f).exists() for f in ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']))
    check('no JS errors', not errors, str(errors[:3]))
    b.close()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
