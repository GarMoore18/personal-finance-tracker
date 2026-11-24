import json, sys, tempfile, os
from playwright.sync_api import sync_playwright
import pathlib
URL=(pathlib.Path(__file__).resolve().parent.parent/'index.html').as_uri()
res=[]; errors=[]; dialogs=[]
def check(name,cond,extra=''):
    res.append((name,bool(cond),extra)); print(('PASS' if cond else 'FAIL'),name,extra)

with sync_playwright() as p:
    b=p.chromium.launch(**({'executable_path':os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}),args=['--no-sandbox'])
    ctx=b.new_context(accept_downloads=True); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errors.append(str(e)))
    pg.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'cdnjs' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    pg.goto(URL)
    check('welcome screen renders',pg.locator('text=Welcome').count()==1)

    def add_acct(name,opening,date):
        pg.evaluate('openAcct()'); pg.fill('#aN',name); pg.fill('#aO',str(opening)); pg.fill('#aD',date)
        pg.click('#aForm button.btn'); 
    add_acct('Checking',1000,'2026-12-01'); add_acct('Savings',500,'2026-12-01')
    bal=lambda n:pg.evaluate('(n)=>balances(S.accounts.find(a=>a.name===n))',n)
    check('two accounts created',pg.evaluate('S.accounts.length')==2)
    ids=pg.evaluate('S.accounts.map(a=>a.id)')

    def add_tx(typ,amt,date,status='cleared',payee='',to=None):
        pg.keyboard.press('Escape'); pg.click('#addBtn')
        pg.click(f'#txForm [data-ty="{typ}"]')
        pg.fill('#tA',str(amt)); pg.fill('#tD',date)
        pg.click(f'#txForm [data-st="{status}"]')
        if payee: pg.fill('#tP',payee)
        if to: pg.select_option('#tTo',label=to)
        pg.click('#tSave')
    add_tx('expense',50,'2026-12-02',payee='Store')
    add_tx('expense',20,'2026-12-03',status='pending',payee='Gas Co')
    b1=bal('Checking')
    check('cleared=950, pending=-20, projected=930',(b1['cleared'],b1['pending'],b1['projected'])==(950,-20,930),str(b1))
    add_tx('expense',99,'2026-11-15',payee='Old')
    check('txn before as-of date not counted',bal('Checking')['cleared']==950)
    pg.click('nav [data-t="txns"]')
    check('"not counted" label shown',pg.locator('text=not counted').count()>=1)
    add_tx('transfer',100,'2026-12-04',payee='To savings',to='Savings')
    bc,bs=bal('Checking'),bal('Savings')
    check('transfer moves money',(bc['cleared'],bs['cleared'])==(850,600),f'{bc} {bs}')
    check('transfer not counted as spending',pg.evaluate("S.txns.filter(t=>t.type==='transfer').length")==1)
    # clear pending
    tid=pg.evaluate("S.txns.find(t=>t.status==='pending').id"); pg.evaluate(f"clearTx('{tid}')")
    b2=bal('Checking'); check('clearing pending updates cleared balance',(b2['cleared'],b2['pending'])==(830,0),str(b2))
    # type switch clears toAccount
    pg.evaluate("openTx(S.txns.find(t=>t.type==='transfer').id)"); pg.click('#txForm [data-ty="expense"]')
    check('switching off transfer clears toAccount',pg.evaluate('txDraft.toAccount')=='')
    pg.click('#tCancel')
    # invalid currency
    pg.click('nav [data-t="settings"]'); pg.fill('#sCur','XX1'); pg.press('#sCur','Tab')
    check('invalid currency rejected, app still renders',pg.locator('nav button').count()==4 and pg.evaluate('S.settings.currency')=='USD')
    pg.click('nav [data-t="dash"]'); check('dashboard still renders after bad currency',pg.locator('text=Cleared balance').count()==1)
    # CSV formula guard
    add_tx('expense',5,'2026-12-05',payee='=HYPERLINK("http://x")')
    pg.click('nav [data-t="settings"]')
    with pg.expect_download() as d: pg.click('#xCsv')
    path=os.path.join(tempfile.mkdtemp(),'t.csv'); d.value.save_as(path); csv=open(path).read()
    check('CSV neutralizes formula payee',"\"'=HYPERLINK" in csv and '"=HYPERLINK' not in csv)
    # malicious import
    evil={'accounts':[{'id':"a');window.__pwn=1;//",'name':'<img src=x onerror=window.__pwn=2>','opening':'abc','openingDate':'nope'}],
          'categories':[{'id':'c1','name':'X','type':'expense','color':'red;background:url(x)'}],
          'txns':[{'id':"t');window.__pwn=3;//",'type':'expense','amount':'-12','date':'2026-12-01','account':"a');window.__pwn=1;//",'category':'c1','status':'pending'},{'type':'bogus'}],
          'settings':{'currency':'ZZZZ','theme':'x'}}
    pg.evaluate('(e)=>{S=normalize(e);save();render()}',evil); pg.click('nav [data-t="txns"]')
    pg.wait_for_timeout(200)
    check('malicious import sanitized',pg.evaluate('window.__pwn')is None and pg.evaluate("S.txns.length")==1 and pg.evaluate("S.categories[0].color")=='#888888' and pg.evaluate("S.settings.currency")=='USD' and pg.evaluate("S.txns[0].amount")==12)
    check('no raw injected img element',pg.locator('img[src="x"]').count()==0)
    # persistence
    pg.reload(); check('state persists across reload',pg.evaluate('S.txns.length')==1)
    check('no JS errors',not errors,str(errors[:3]))
    b.close()
fails=[r for r in res if not r[1]]; print(f'\n{len(res)-len(fails)}/{len(res)} passed'); sys.exit(1 if fails else 0)
